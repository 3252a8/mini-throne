"""Deliver one immutable EXE; carry an expiring enrollment ticket in its name."""

from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import os
import secrets
from pathlib import Path
from urllib.parse import urlsplit

from aiohttp import web

from . import TOKEN, body, digest, fail, response

TTL = 1800
GENERIC_FILENAME = "Mini-Throne-Setup.exe"
# Leave room for the Downloads directory and browser duplicate-name suffixes.
MAX_FILENAME = 180


def installer_filename(origin: str, ticket: str) -> str:
    encoded = base64.urlsafe_b64encode(origin.encode("utf-8")).decode().rstrip("=")
    name = f"Mini-Throne-Setup--mt1.{encoded}.{ticket}.exe"
    return name if len(name) <= MAX_FILENAME else GENERIC_FILENAME


class EnrollmentApi:
    def __init__(self, api, cache=None) -> None:
        self.api = api
        self.cache = cache
        self.verification_lock = asyncio.Lock()
        self.verified_identity: tuple | None = None

    def installer(self, pinned: str | None = None) -> tuple[Path, str]:
        if self.cache and not os.environ.get("MINI_THRONE_INSTALLER_PATH"):
            try:
                return self.cache.installer(pinned)
            except ValueError:
                raise fail("installer_unavailable", 503)
        filename = os.environ.get("MINI_THRONE_INSTALLER_PATH", "")
        expected = os.environ.get("MINI_THRONE_INSTALLER_SHA256", "").lower()
        if (
            not filename
            or len(expected) != 64
            or any(c not in "0123456789abcdef" for c in expected)
        ):
            raise fail("installer_not_configured", 503)
        source = Path(filename)
        if (
            not source.is_absolute()
            or not source.is_file()
            or not 0 < source.stat().st_size <= 400 * 1024 * 1024
        ):
            raise fail("installer_unavailable", 503)
        return source, expected

    def origin(self) -> str:
        public = urlsplit(self.api.public_url())
        return f"{public.scheme}://{public.netloc}"

    @staticmethod
    def identity(source: Path, expected: str) -> tuple:
        stat = source.stat()
        return (
            str(source),
            expected,
            stat.st_dev,
            stat.st_ino,
            stat.st_size,
            stat.st_mtime_ns,
            stat.st_ctime_ns,
        )

    async def verified_installer(self, pinned: str | None = None) -> Path:
        # The operator mounts this artifact read-only. Hash once per artifact,
        # not once per user; replacement or digest changes invalidate the cache.
        async with self.verification_lock:
            source, expected = self.installer(pinned)
            identity = self.identity(source, expected)
            if identity != self.verified_identity:

                def verify() -> None:
                    with source.open("rb") as installer:
                        actual = hashlib.file_digest(installer, "sha256").hexdigest()
                    if (
                        actual != expected
                        or self.identity(source, expected) != identity
                    ):
                        raise fail("installer_digest_mismatch", 503)

                await asyncio.to_thread(verify)
                self.verified_identity = identity
            return source

    async def status(self, request: web.Request) -> web.Response:
        await self.api.browser_user(request)
        try:
            self.installer()
            available = True
        except web.HTTPException:
            available = False
        return response(
            {
                "available": available,
                "version": (self.cache.current or {}).get("version")
                if self.cache
                else None,
                "automatic_login": installer_filename(self.origin(), "a" * 43)
                != GENERIC_FILENAME,
                "ticket_ttl_seconds": TTL,
                "release_status": "retrying"
                if self.cache and self.cache.error
                else "ready"
                if available
                else "preparing",
                "panel_sync": self.cache.panel_status
                if self.cache
                else {"status": "disabled"},
            }
        )

    async def create(self, request: web.Request) -> web.Response:
        user_id = await self.api.browser_user(request, mutation=True)
        await self.api.limit(request, "enrollment", 12)
        _, installer_digest = self.installer()
        ticket, delivery = secrets.token_urlsafe(32), secrets.token_hex(16)
        filename = installer_filename(self.origin(), ticket)
        automatic = filename != GENERIC_FILENAME
        client = await self.api.redis()
        async with client.pipeline(transaction=True) as pipe:
            if automatic:
                pipe.set(self.api.key("enroll", digest(ticket)), str(user_id), ex=TTL)
            pipe.set(
                self.api.key("delivery", delivery),
                json.dumps(
                    {
                        "user_id": user_id,
                        "filename": filename,
                        "installer_digest": installer_digest,
                    }
                ),
                ex=TTL,
            )
            await pipe.execute()
        return response(
            {
                "download_path": "/api/plugins/mini-throne/v1/installer/" + delivery,
                "automatic_login": automatic,
                "expires_in": TTL,
            }
        )

    async def download(self, request: web.Request) -> web.StreamResponse:
        user_id = await self.api.browser_user(request)
        delivery = request.match_info["delivery"]
        if len(delivery) != 32 or any(c not in "0123456789abcdef" for c in delivery):
            raise fail("invalid_delivery")
        client = await self.api.redis()
        raw = await client.get(self.api.key("delivery", delivery))
        if raw is None:
            raise fail("delivery_expired", 410)
        entry = json.loads(raw)
        if entry["user_id"] != user_id:
            raise fail("delivery_not_found", 404)
        # A request created by alpha.1 predates EXE filename enrollment.
        filename = entry.get("filename")
        if not isinstance(filename, str):
            raise fail("delivery_expired", 410)
        source = await self.verified_installer(entry.get("installer_digest"))
        return web.FileResponse(
            source,
            headers={
                "Content-Type": "application/vnd.microsoft.portable-executable",
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Cache-Control": "private, no-store",
                "Referrer-Policy": "no-referrer",
                "X-Content-Type-Options": "nosniff",
            },
        )

    async def redeem(self, request: web.Request) -> web.Response:
        await self.api.limit(request, "redeem", 60)
        ticket = (await body(request)).get("ticket", "")
        if not isinstance(ticket, str) or not TOKEN.fullmatch(ticket):
            raise fail("invalid_ticket", 401)
        client = await self.api.redis()
        # A second installer run, another computer, and concurrent redemption all
        # lose the same atomic race. The filename never contains a session token.
        user_id = await client.getdel(self.api.key("enroll", digest(ticket)))
        if user_id is None:
            raise fail("ticket_used_or_expired", 410)
        return await self.api.issue(int(user_id))
