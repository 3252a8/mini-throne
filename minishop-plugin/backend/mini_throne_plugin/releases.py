"""Fetch authenticated public releases into persistent, content-addressed storage."""

from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import os
import re
import time
import uuid
from pathlib import Path
from urllib.parse import urlsplit

import aiohttp
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

INSTALLER = "Mini-Throne-Setup-x64.exe"
MAX_SIZE = 400 * 1024 * 1024


def verify_release(envelope: dict, policy: dict) -> dict:
    raw = base64.b64decode(envelope["manifest"], validate=True)
    if len(raw) > 32768:
        raise ValueError("release_too_large")
    Ed25519PublicKey.from_public_bytes(
        base64.b64decode(policy["publicKey"], validate=True)
    ).verify(base64.b64decode(envelope["signature"], validate=True), raw)
    data = json.loads(raw)
    if (
        data.get("schema") != 1
        or data.get("repository") != policy["repository"]
        or not re.fullmatch(r"\d+\.\d+\.\d+", data.get("version", ""))
    ):
        raise ValueError("invalid_release")
    entry = data["files"][INSTALLER]
    if (
        not isinstance(entry["size"], int)
        or not 0 < entry["size"] <= MAX_SIZE
        or not re.fullmatch(r"[a-f0-9]{64}", entry["sha256"])
    ):
        raise ValueError("invalid_installer")
    return data


def version(value: str) -> tuple[int, ...]:
    return tuple(map(int, value.split(".")))


class ReleaseCache:
    def __init__(self, directory: Path, policy: dict):
        self.directory, self.policy = directory, policy
        self.current: dict | None = None
        self.lock = asyncio.Lock()
        self.error = False
        self.panel_status = {"status": "pending"}

    def installer(self, digest: str | None = None) -> tuple[Path, str]:
        digest = digest or (self.current or {}).get("files", {}).get(INSTALLER, {}).get(
            "sha256"
        )
        if not isinstance(digest, str) or not re.fullmatch(r"[a-f0-9]{64}", digest):
            raise ValueError("installer_unavailable")
        path = self.directory / f"{digest}.exe"
        if not path.is_file():
            raise ValueError("installer_unavailable")
        return path, digest

    @staticmethod
    async def fetch(session, url, *, maximum, destination=None):
        # Only GitHub's release endpoints and asset CDN may receive these requests.
        for _ in range(5):
            parsed = urlsplit(url)
            if (
                parsed.scheme != "https"
                or parsed.hostname
                not in {
                    "github.com",
                    "release-assets.githubusercontent.com",
                    "objects.githubusercontent.com",
                }
                or parsed.username
                or parsed.password
            ):
                raise ValueError("invalid_release_url")
            async with session.get(url, allow_redirects=False) as response:
                if response.status in {301, 302, 303, 307, 308}:
                    from urllib.parse import urljoin

                    url = urljoin(url, response.headers["Location"])
                    continue
                response.raise_for_status()
                size, chunks, digest = 0, [], hashlib.sha256()
                handle = destination.open("wb") if destination else None
                try:
                    async for chunk in response.content.iter_chunked(256 * 1024):
                        size += len(chunk)
                        if size > maximum:
                            raise ValueError("release_too_large")
                        digest.update(chunk)
                        if handle:
                            handle.write(chunk)
                        else:
                            chunks.append(chunk)
                finally:
                    if handle:
                        handle.close()
                return (size, digest.hexdigest()) if destination else b"".join(chunks)
        raise ValueError("too_many_redirects")

    async def refresh(self):
        async with self.lock:
            self.directory.mkdir(parents=True, exist_ok=True, mode=0o700)
            saved = self.directory / "release-manifest.json"
            if self.current is None and saved.exists():
                try:
                    self.current = verify_release(
                        json.loads(saved.read_bytes()), self.policy
                    )
                except (ValueError, KeyError, TypeError, InvalidSignature):
                    pass
            base = f"https://github.com/{self.policy['repository']}/releases"
            async with aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=600, sock_connect=20, sock_read=60),
                headers={
                    "User-Agent": "Mini-Throne-Plugin",
                    "Cache-Control": "no-cache",
                },
            ) as session:
                raw = await self.fetch(
                    session,
                    base + "/latest/download/release-manifest.json",
                    maximum=49152,
                )
                release = verify_release(json.loads(raw), self.policy)
                if self.current and version(release["version"]) < version(
                    self.current["version"]
                ):
                    raise ValueError("release_rollback")
                entry = release["files"][INSTALLER]
                target = self.directory / f"{entry['sha256']}.exe"
                if not target.exists():
                    temporary = self.directory / f"{uuid.uuid4().hex}.partial"
                    try:
                        size, digest = await self.fetch(
                            session,
                            f"{base}/download/v{release['version']}/{INSTALLER}",
                            maximum=entry["size"],
                            destination=temporary,
                        )
                        if size != entry["size"] or digest != entry["sha256"]:
                            raise ValueError("installer_digest_mismatch")
                        os.replace(temporary, target)
                    finally:
                        temporary.unlink(missing_ok=True)
                # Keep the last working release if a network or signature check fails.
                temporary = saved.with_name(uuid.uuid4().hex + ".json")
                temporary.write_bytes(raw)
                os.replace(temporary, saved)
                self.current, self.error = release, False
                # Delivery tickets pin a digest for 30 minutes. Keep old files for
                # at least a day, and always retain the two most recent versions.
                files = sorted(
                    self.directory.glob("*.exe"),
                    key=lambda p: p.stat().st_mtime,
                    reverse=True,
                )
                for old in files[2:]:
                    if old != target and time.time() - old.stat().st_mtime > 86400:
                        old.unlink()
