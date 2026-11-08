"""Personalized delivery without modifying the installer or its signature."""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import secrets
import shutil
import tempfile
import time
import zipfile
from pathlib import Path
from urllib.parse import urlsplit

from aiohttp import web

from . import TOKEN, body, digest, fail, response

TTL = 1800


class EnrollmentApi:
    def __init__(self, api) -> None:
        self.api = api
        self.capacity = asyncio.Semaphore(2)

    def installer(self) -> tuple[Path, str]:
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

    async def status(self, request: web.Request) -> web.Response:
        await self.api.browser_user(request)
        try:
            self.installer()
            available = True
        except web.HTTPException:
            available = False
        return response({"available": available, "ticket_ttl_seconds": TTL})

    async def create(self, request: web.Request) -> web.Response:
        user_id = await self.api.browser_user(request, mutation=True)
        await self.api.limit(request, "enrollment", 12)
        self.installer()
        ticket, delivery = secrets.token_urlsafe(32), secrets.token_hex(16)
        public = urlsplit(self.api.public_url())
        payload = {
            "protocol": 1,
            "origin": f"{public.scheme}://{public.netloc}",
            "ticket": ticket,
            "expires_at": int(time.time()) + TTL,
        }
        client = await self.api.redis()
        async with client.pipeline(transaction=True) as pipe:
            pipe.set(self.api.key("enroll", digest(ticket)), str(user_id), ex=TTL)
            pipe.set(
                self.api.key("delivery", delivery),
                json.dumps({"user_id": user_id, "payload": payload}),
                ex=TTL,
            )
            await pipe.execute()
        return response(
            {
                "download_path": "/api/plugins/mini-throne/v1/installer/" + delivery,
                "expires_in": TTL,
            }
        )

    @staticmethod
    def package(source: Path, expected: str, payload: dict) -> Path:
        descriptor, filename = tempfile.mkstemp(prefix="mini-throne-", suffix=".zip")
        os.close(descriptor)
        target = Path(filename)
        try:
            with source.open("rb") as installer:
                if hashlib.file_digest(installer, "sha256").hexdigest() != expected:
                    raise fail("installer_digest_mismatch", 503)
                installer.seek(0)
                with zipfile.ZipFile(
                    target, "w", compression=zipfile.ZIP_STORED
                ) as archive:
                    with archive.open(
                        "Mini-Throne-Setup.exe", "w", force_zip64=True
                    ) as destination:
                        shutil.copyfileobj(installer, destination, 1024 * 1024)
                    archive.writestr("mini-throne.enroll", json.dumps(payload))
                    archive.writestr(
                        "START-HERE.txt",
                        (
                            "Распакуйте архив целиком и запустите Mini-Throne-Setup.exe.\n"
                            "Файл mini-throne.enroll должен остаться рядом с установщиком.\n"
                            "Вход произойдёт автоматически один раз. Билет действует 30 минут.\n"
                            "Не передавайте этот архив другим людям. После входа удалите архив.\n\n"
                            "Extract the entire archive and run Mini-Throne-Setup.exe.\n"
                            "Keep mini-throne.enroll beside the installer. Sign-in is automatic,\n"
                            "single-use and expires in 30 minutes. Do not share this archive.\n"
                            "Delete it after sign-in.\n"
                        ).encode("utf-8"),
                    )
            return target
        except BaseException:
            target.unlink(missing_ok=True)
            raise

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
        source, expected = self.installer()
        try:
            await asyncio.wait_for(self.capacity.acquire(), 1)
        except TimeoutError as exc:
            raise fail("download_busy", 429) from exc
        target = None
        try:
            packaging = asyncio.create_task(
                asyncio.to_thread(self.package, source, expected, entry["payload"])
            )
            try:
                target = await asyncio.shield(packaging)
            except asyncio.CancelledError:
                target = await packaging
                raise
            result = web.StreamResponse(
                headers={
                    "Content-Type": "application/zip",
                    "Content-Length": str(target.stat().st_size),
                    "Content-Disposition": 'attachment; filename="Mini-Throne-Personal-Setup.zip"',
                    "Cache-Control": "no-store",
                    "X-Content-Type-Options": "nosniff",
                }
            )
            await result.prepare(request)
            with target.open("rb") as archive:
                while chunk := await asyncio.to_thread(archive.read, 256 * 1024):
                    await result.write(chunk)
            await result.write_eof()
            return result
        finally:
            if target is not None:
                target.unlink(missing_ok=True)
            self.capacity.release()

    async def redeem(self, request: web.Request) -> web.Response:
        await self.api.limit(request, "redeem", 60)
        ticket = (await body(request)).get("ticket", "")
        if not isinstance(ticket, str) or not TOKEN.fullmatch(ticket):
            raise fail("invalid_ticket", 401)
        client = await self.api.redis()
        # A second installer run, another computer, and concurrent redemption all
        # lose the same atomic race. No long-lived subscription URL is in the ZIP.
        user_id = await client.getdel(self.api.key("enroll", digest(ticket)))
        if user_id is None:
            raise fail("ticket_used_or_expired", 410)
        return await self.api.issue(int(user_id))
