"""Minishop device authorization, isolated from normal browser sessions."""

from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import re
import secrets
from datetime import UTC, datetime
from urllib.parse import urlencode, urlsplit

from aiohttp import web

from bot.app.web.session import extract_authenticated_user_id
from bot.app.web.webapp.assets_branding import _resolve_webapp_logo_url
from bot.infra.redis import get_redis, redis_key
from bot.plugins.spec import WEB_SCOPE_WEBAPP, Plugin, PluginContext
from db.dal import subscription_dal, user_dal

PREFIX = "/api/plugins/mini-throne/v1"
DEVICE_TTL = 300
ACCESS_TTL = 900
SESSION_TTL = 30 * 24 * 3600
TOKEN = re.compile(r"^[A-Za-z0-9_-]{43,128}$")
REQUEST = re.compile(r"^[0-9a-f]{32}$")

# Redis makes approval, redemption and refresh rotation atomic across workers.
APPROVE = """
local raw=redis.call('GET',KEYS[1]); if not raw then return 0 end
local d=cjson.decode(raw); if d.user_id then return 0 end
if d.user_code~=ARGV[1] then return -1 end
d.user_id=tonumber(ARGV[2]); redis.call('SET',KEYS[1],cjson.encode(d),'KEEPTTL'); return 1
"""
REDEEM = """
local raw=redis.call('GET',KEYS[1]); if not raw then return {'expired'} end
local d=cjson.decode(raw); if d.challenge~=ARGV[1] then return {'invalid'} end
if not d.user_id then return {'pending'} end
redis.call('DEL',KEYS[1]); redis.call('DEL',ARGV[2]..d.request_id)
return {'ok',tostring(d.user_id)}
"""
RATE = """
local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end
return n
"""
ISSUE = """
if ARGV[1]=='refresh' and redis.call('GET',KEYS[1])~=ARGV[2] then return 0 end
redis.call('SET',KEYS[1],ARGV[2],'EX',ARGV[3])
redis.call('SET',KEYS[2],ARGV[2],'EX',ARGV[4])
redis.call('SET',KEYS[3],ARGV[2],'EX',ARGV[3])
redis.call('ZADD',KEYS[4],ARGV[5],ARGV[6]); redis.call('EXPIRE',KEYS[4],ARGV[3])
return 1
"""


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def challenge(value: str) -> str:
    return (
        base64.urlsafe_b64encode(hashlib.sha256(value.encode()).digest())
        .decode()
        .rstrip("=")
    )


def response(data: dict, status: int = 200) -> web.Response:
    return web.json_response(
        {"ok": True, **data},
        status=status,
        headers={
            "Cache-Control": "no-store",
            "Pragma": "no-cache",
            "Referrer-Policy": "no-referrer",
        },
    )


def fail(code: str, status: int = 400) -> web.HTTPException:
    classes = {
        400: web.HTTPBadRequest,
        401: web.HTTPUnauthorized,
        403: web.HTTPForbidden,
        404: web.HTTPNotFound,
        409: web.HTTPConflict,
        410: web.HTTPGone,
        429: web.HTTPTooManyRequests,
        503: web.HTTPServiceUnavailable,
    }
    return classes[status](
        text=json.dumps({"ok": False, "error": {"code": code}}),
        content_type="application/json",
        headers={"Cache-Control": "no-store"},
    )


async def body(request: web.Request) -> dict:
    if request.content_type != "application/json":
        raise fail("json_required")
    try:
        raw = await request.content.readexactly(4097)
    except asyncio.IncompleteReadError as exc:
        raw = exc.partial
    if len(raw) > 4096:
        raise fail("body_too_large")
    try:
        value = json.loads(raw)
    except (ValueError, UnicodeDecodeError) as exc:
        raise fail("invalid_json") from exc
    if not isinstance(value, dict):
        raise fail("invalid_json")
    return value


class MiniThronePlugin(Plugin):
    name = "mini-throne"
    version = "0.1.4"
    plugin_api_min_version = 1
    plugin_api_max_version = 1

    def setup_web(
        self, ctx: PluginContext, app: web.Application, *, scope: str
    ) -> None:
        if scope != WEB_SCOPE_WEBAPP:
            return
        api = DeviceApi(ctx)
        from .enrollment import EnrollmentApi

        from pathlib import Path
        from bot.plugins.packages import package_root
        from .releases import ReleaseCache
        from .guides import sync_panel

        policy = json.loads(
            Path(__file__).with_name("release-policy.json").read_bytes()
        )
        directory = package_root().parent / "mini-throne"
        cache = ReleaseCache(directory / "installers", policy)
        enrollment = EnrollmentApi(api, cache)

        async def maintain():
            while True:
                try:
                    await cache.refresh()
                except asyncio.CancelledError:
                    raise
                except Exception:
                    cache.error = True
                if cache.current:
                    try:
                        cache.panel_status = await asyncio.wait_for(
                            sync_panel(
                                ctx.require_panel_service(), directory / "panel-backups"
                            ),
                            90,
                        )
                    except asyncio.CancelledError:
                        raise
                    except Exception:
                        cache.panel_status = {
                            "status": "unavailable"
                        }  # Sign-in remains available.
                await asyncio.sleep(3600 if cache.current else 60)

        async def lifecycle(app):
            task = asyncio.create_task(maintain(), name="mini-throne-releases")
            yield
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

        app.cleanup_ctx.append(lifecycle)

        @web.middleware
        async def windows_guide(request, handler):
            result = await handler(request)
            if (
                request.path != "/api/subscription-guides"
                or result.status != 200
                or not isinstance(result, web.Response)
                or result.content_type != "application/json"
            ):
                return result
            from .guides import add_app, DOWNLOAD
            from bot.app.web.webapp.guide_document import remnawave_v1_to_guide_document

            payload = json.loads(result.text)
            if not payload.get("enabled") or not isinstance(
                payload.get("config"), dict
            ):
                return result
            config, changed = add_app(payload["config"])
            for item in config.get("platforms", {}).get("windows", {}).get("apps", []):
                if item.get("name") == "Mini Throne":
                    for block in item.get("blocks", []):
                        for button in block.get("buttons", []):
                            if button.get("link") == DOWNLOAD:
                                button["link"] = (
                                    api.public_url()
                                    + "/extensions/mini-throne/connect?download=1"
                                )
                                changed = True
            if changed:
                payload["config"] = config
                payload["guide_document"] = remnawave_v1_to_guide_document(
                    config, source=str(payload.get("source") or "")
                )
                result.text = json.dumps(payload, ensure_ascii=False)
            return result

        app.middlewares.append(windows_guide)
        for method, path, handler in (
            ("GET", "/discovery", api.discovery),
            ("POST", "/device", api.start),
            ("GET", "/pending", api.pending),
            ("POST", "/approve", api.approve),
            ("POST", "/token", api.token),
            ("POST", "/refresh", api.refresh),
            ("GET", "/bootstrap", api.bootstrap),
            ("POST", "/revoke", api.revoke),
            ("GET", "/devices", api.devices),
            ("POST", "/devices/revoke", api.revoke_device),
            ("GET", "/enrollment/status", enrollment.status),
            ("POST", "/enrollment", enrollment.create),
            ("GET", "/installer/{delivery}", enrollment.download),
            ("POST", "/enroll/redeem", enrollment.redeem),
        ):
            app.router.add_route(method, PREFIX + path, handler)


class DeviceApi:
    def __init__(self, ctx: PluginContext) -> None:
        self.ctx = ctx

    def key(self, *parts: object) -> str:
        return redis_key(self.ctx.settings, "plugins", "mini-throne", "v1", *parts)

    def public_url(self) -> str:
        raw = (
            self.ctx.settings.PUBLIC_APP_URL
            or self.ctx.settings.SUBSCRIPTION_MINI_APP_URL
            or ""
        )
        url = urlsplit(raw)
        if (
            url.scheme != "https"
            or not url.netloc
            or url.username
            or url.password
            or url.query
            or url.fragment
        ):
            raise fail("public_url_not_configured", 503)
        return raw.rstrip("/")

    async def redis(self):
        client = await get_redis(self.ctx.settings)
        if client is None:
            raise fail("redis_required", 503)
        return client

    async def limit(
        self, request: web.Request, action: str, maximum: int, seconds: int = 60
    ) -> None:
        client = await self.redis()
        count = await client.eval(
            RATE,
            1,
            self.key("limit", action, digest(request.remote or "unknown")),
            seconds,
        )
        if count > maximum:
            raise fail("rate_limited", 429)

    async def valid_user(self, user_id: int) -> None:
        async with self.ctx.require_session_factory()() as session:
            user = await user_dal.get_user_by_id(session, user_id)
            if user is None or user.is_banned:
                raise fail("account_unavailable", 403)

    async def browser_user(
        self, request: web.Request, *, mutation: bool = False
    ) -> int:
        if mutation:
            expected = urlsplit(self.public_url())
            origin = request.headers.get("Origin", "")
            if origin != f"{expected.scheme}://{expected.netloc}":
                raise fail("origin_mismatch", 403)
        user_id = extract_authenticated_user_id(request)
        if not user_id:
            raise fail("login_required", 401)
        await self.valid_user(user_id)
        return user_id

    async def discovery(self, request: web.Request) -> web.Response:
        return response(
            {
                "protocol": 1,
                "name": self.ctx.settings.WEBAPP_TITLE,
                "verification_uri": self.public_url()
                + "/extensions/mini-throne/connect",
                "device_endpoint": PREFIX + "/device",
                "expires_in": DEVICE_TTL,
                "scopes": ["subscription:read", "branding:read"],
            }
        )

    async def start(self, request: web.Request) -> web.Response:
        await self.limit(request, "start", 30)
        data = await body(request)
        proof = data.get("code_challenge", "")
        name = data.get("device_name", "Windows")
        if not isinstance(proof, str) or not re.fullmatch(r"[A-Za-z0-9_-]{43}", proof):
            raise fail("invalid_challenge")
        if (
            data.get("code_challenge_method") != "S256"
            or not isinstance(name, str)
            or not 1 <= len(name) <= 80
            or any(ord(c) < 32 for c in name)
        ):
            raise fail("invalid_device")
        device_code, request_id = secrets.token_urlsafe(32), secrets.token_hex(16)
        user_code = "-".join(secrets.token_hex(2).upper() for _ in range(2))
        token_hash = digest(device_code)
        entry = {
            "challenge": proof,
            "request_id": request_id,
            "user_code": user_code,
            "name": name,
        }
        client = await self.redis()
        async with client.pipeline(transaction=True) as pipe:
            pipe.set(self.key("device", token_hash), json.dumps(entry), ex=DEVICE_TTL)
            pipe.set(self.key("request", request_id), token_hash, ex=DEVICE_TTL)
            await pipe.execute()
        return response(
            {
                "device_code": device_code,
                "request_id": request_id,
                "user_code": user_code,
                "verification_uri": self.public_url()
                + "/extensions/mini-throne/connect?"
                + urlencode({"request": request_id}),
                "interval": 3,
                "expires_in": DEVICE_TTL,
            }
        )

    async def pending_record(self, request_id: str):
        if not isinstance(request_id, str) or not REQUEST.fullmatch(request_id):
            raise fail("invalid_request")
        client = await self.redis()
        token_hash = await client.get(self.key("request", request_id))
        raw = await client.get(self.key("device", token_hash)) if token_hash else None
        if raw is None:
            raise fail("request_expired", 410)
        return token_hash, json.loads(raw)

    async def pending(self, request: web.Request) -> web.Response:
        await self.browser_user(request)
        _, entry = await self.pending_record(request.query.get("request", ""))
        return response(
            {
                "device_name": entry["name"],
                "user_code": entry["user_code"],
                "approved": bool(entry.get("user_id")),
            }
        )

    async def approve(self, request: web.Request) -> web.Response:
        user_id = await self.browser_user(request, mutation=True)
        data = await body(request)
        token_hash, _ = await self.pending_record(data.get("request_id", ""))
        client = await self.redis()
        result = await client.eval(
            APPROVE,
            1,
            self.key("device", token_hash),
            str(data.get("user_code", "")),
            user_id,
        )
        if result != 1:
            raise fail("request_used_or_invalid", 409)
        return response({"approved": True})

    async def issue(self, user_id: int, sid: str | None = None) -> web.Response:
        await self.valid_user(user_id)
        client = await self.redis()
        refreshing = sid is not None
        sid = sid or secrets.token_hex(16)
        access, refresh = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
        record = json.dumps({"user_id": user_id, "sid": sid})
        issued = await client.eval(
            ISSUE,
            4,
            self.key("session", sid),
            self.key("access", digest(access)),
            self.key("refresh", digest(refresh)),
            self.key("user", user_id),
            "refresh" if refreshing else "new",
            record,
            SESSION_TTL,
            ACCESS_TTL,
            int(datetime.now(UTC).timestamp()),
            sid,
        )
        if issued != 1:
            raise fail("session_revoked", 401)
        # Limit each account to ten concurrently authorized desktop sessions.
        obsolete = await client.zrange(self.key("user", user_id), 0, -11)
        if obsolete:
            await client.delete(*(self.key("session", old) for old in obsolete))
            await client.zrem(self.key("user", user_id), *obsolete)
        return response(
            {
                "token_type": "Bearer",
                "access_token": access,
                "refresh_token": refresh,
                "expires_in": ACCESS_TTL,
                "session_id": sid,
            }
        )

    async def token(self, request: web.Request) -> web.Response:
        data = await body(request)
        code, verifier = data.get("device_code", ""), data.get("code_verifier", "")
        if (
            not isinstance(code, str)
            or not TOKEN.fullmatch(code)
            or not isinstance(verifier, str)
            or not TOKEN.fullmatch(verifier)
        ):
            raise fail("invalid_grant")
        client = await self.redis()
        if not await client.set(self.key("poll", digest(code)), "1", ex=2, nx=True):
            raise fail("slow_down", 429)
        result = await client.eval(
            REDEEM,
            1,
            self.key("device", digest(code)),
            challenge(verifier),
            self.key("request") + ":",
        )
        if result[0] == "pending":
            return response({"status": "authorization_pending"}, 202)
        if result[0] != "ok":
            raise fail("invalid_or_expired_grant", 410)
        return await self.issue(int(result[1]))

    async def refresh(self, request: web.Request) -> web.Response:
        await self.limit(request, "refresh", 120)
        data = await body(request)
        value = data.get("refresh_token", "")
        if not isinstance(value, str) or not TOKEN.fullmatch(value):
            raise fail("invalid_grant", 401)
        client = await self.redis()
        raw = await client.getdel(self.key("refresh", digest(value)))
        if raw is None:
            raise fail("invalid_grant", 401)
        record = json.loads(raw)
        if not await client.exists(self.key("session", record["sid"])):
            raise fail("session_revoked", 401)
        return await self.issue(record["user_id"], record["sid"])

    async def device_user(self, request: web.Request) -> dict:
        header = request.headers.get("Authorization", "")
        if not header.startswith("Bearer "):
            raise fail("invalid_token", 401)
        value = header.removeprefix("Bearer ")
        if not TOKEN.fullmatch(value):
            raise fail("invalid_token", 401)
        client = await self.redis()
        raw = await client.get(self.key("access", digest(value)))
        if raw is None:
            raise fail("invalid_token", 401)
        record = json.loads(raw)
        if not await client.exists(self.key("session", record["sid"])):
            raise fail("session_revoked", 401)
        await self.valid_user(record["user_id"])
        return record

    async def bootstrap(self, request: web.Request) -> web.Response:
        record = await self.device_user(request)
        async with self.ctx.require_session_factory()() as session:
            subscription = await subscription_dal.get_active_subscription_by_user_id(
                session, record["user_id"]
            )
            panel_id = str(subscription.panel_user_uuid) if subscription else ""
            expires = subscription.end_date.isoformat() if subscription else None
            subscription_id = (
                int(subscription.subscription_id) if subscription else None
            )
        link = None
        panel = {}
        if panel_id:
            try:
                panel = await asyncio.wait_for(
                    self.ctx.require_panel_service().get_user_by_uuid(
                        panel_id, use_cache=False
                    ),
                    8,
                )
            except Exception as exc:
                raise fail("panel_unavailable", 503) from exc
            if not isinstance(panel, dict):
                raise fail("panel_unavailable", 503)
            if str(panel.get("status", "")).upper() == "ACTIVE":
                candidate = str(panel.get("subscriptionUrl") or "")
                parsed = urlsplit(candidate)
                if (
                    parsed.scheme == "https"
                    and parsed.netloc
                    and not parsed.username
                    and not parsed.password
                ):
                    link = candidate
            # Recheck ownership and entitlement after the panel network request.
            async with self.ctx.require_session_factory()() as session:
                current = await subscription_dal.get_active_subscription_by_user_id(
                    session, record["user_id"]
                )
                if (
                    current is None
                    or int(current.subscription_id) != subscription_id
                    or str(current.panel_user_uuid) != panel_id
                ):
                    link = None
        settings = self.ctx.settings
        accent = settings.WEBAPP_PRIMARY_COLOR or "#6c5ce7"
        if not re.fullmatch(r"#[0-9a-fA-F]{6}", accent):
            accent = "#6c5ce7"
        from .branding import branding_theme, traffic_details

        theme = branding_theme(settings)
        # The client only accepts raster images through the same-origin asset URL.
        logo = _resolve_webapp_logo_url(settings)
        return response(
            {
                "protocol": 1,
                "branding": {
                    "name": (settings.WEBAPP_TITLE or "/mini-throne")[:80],
                    "accent": theme.get("accent", accent),
                    "theme": theme,
                    "logo_url": logo,
                },
                "subscription": {
                    "active": bool(link),
                    "url": link,
                    "expires_at": expires,
                    "traffic": traffic_details(panel) if link else None,
                },
                "defaults": {
                    "system_proxy": True,
                    "routing": "bypass-russia",
                    "refresh_minutes": 60,
                },
            }
        )

    async def revoke(self, request: web.Request) -> web.Response:
        record = await self.device_user(request)
        client = await self.redis()
        await client.delete(self.key("session", record["sid"]))
        await client.zrem(self.key("user", record["user_id"]), record["sid"])
        return response({"revoked": True})

    async def devices(self, request: web.Request) -> web.Response:
        user_id = await self.browser_user(request)
        client = await self.redis()
        items = await client.zrevrange(self.key("user", user_id), 0, 9, withscores=True)
        devices = []
        for sid, timestamp in items:
            if await client.exists(self.key("session", sid)):
                devices.append({"id": sid, "last_authorized_at": int(timestamp)})
        return response({"devices": devices})

    async def revoke_device(self, request: web.Request) -> web.Response:
        user_id = await self.browser_user(request, mutation=True)
        sid = (await body(request)).get("id", "")
        if not isinstance(sid, str) or not REQUEST.fullmatch(sid):
            raise fail("invalid_device")
        client = await self.redis()
        raw = await client.get(self.key("session", sid))
        if raw is None or json.loads(raw)["user_id"] != user_id:
            raise fail("device_not_found", 404)
        await client.delete(self.key("session", sid))
        await client.zrem(self.key("user", user_id), sid)
        return response({"revoked": True})


plugin = MiniThronePlugin()
