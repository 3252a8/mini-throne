"""Release security and panel update checks, independent of a running service."""

import asyncio
import base64
import copy
import hashlib
import importlib.util
import json
import os
import sys
import tempfile
from pathlib import Path

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives import serialization

ROOT = Path(__file__).resolve().parents[1]


def module(name):
    spec = importlib.util.spec_from_file_location(
        name, ROOT / f"minishop-plugin/backend/mini_throne_plugin/{name}.py"
    )
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


async def main():
    releases, guides = module("releases"), module("guides")
    key = Ed25519PrivateKey.generate()
    policy = {
        "repository": "3252a8/mini-throne",
        "publicKey": base64.b64encode(
            key.public_key().public_bytes(
                serialization.Encoding.Raw, serialization.PublicFormat.Raw
            )
        ).decode(),
    }
    body = b"synthetic installer fixture"
    digest = hashlib.sha256(body).hexdigest()
    data = {
        "schema": 1,
        "repository": policy["repository"],
        "version": "0.1.0",
        "files": {releases.INSTALLER: {"sha256": digest, "size": len(body)}},
    }
    raw = json.dumps(data).encode()
    envelope = {
        "manifest": base64.b64encode(raw).decode(),
        "signature": base64.b64encode(key.sign(raw)).decode(),
    }
    assert releases.verify_release(envelope, policy) == data
    try:
        releases.verify_release(
            {**envelope, "signature": base64.b64encode(bytes(64)).decode()}, policy
        )
        raise AssertionError("forged signature accepted")
    except InvalidSignature:
        pass
    with tempfile.TemporaryDirectory() as temporary:
        directory = Path(temporary)
        cache = releases.ReleaseCache(directory / "cache", policy)

        async def fetch(session, url, *, maximum, destination=None):
            if destination:
                destination.write_bytes(body)
                return len(body), digest
            return json.dumps(envelope).encode()

        cache.fetch = fetch
        await cache.refresh()
        assert cache.installer()[0].read_bytes() == body
        old = cache.installer()

        async def unavailable(*args, **kwargs):
            raise OSError("offline")

        cache.fetch = unavailable
        try:
            await cache.refresh()
        except OSError:
            pass
        assert cache.installer() == old
        assert cache.installer(digest) == old
        try:
            cache.installer("../escape")
            raise AssertionError("unsafe cache path")
        except ValueError:
            pass

        core = Path(os.environ.get("CORE_SOURCE", ROOT.parent / "core"))
        sys.path.insert(0, str(core / "backend"))
        from config.subscription_guides_config import (
            default_subscription_guides_config_text,
            validate_subscription_guides_config,
        )
        from config.webapp_themes_config import builtin_webapp_themes_config
        from types import SimpleNamespace

        branding = module("branding")
        settings = SimpleNamespace(
            webapp_themes_catalog=builtin_webapp_themes_config("#123456"),
            WEBAPP_PRIMARY_COLOR="#123456",
        )
        palette = branding.branding_theme(settings)
        assert palette and "bg" in palette and "accent" in palette
        assert set(palette) <= set(branding.COLORS)
        assert branding.traffic_details(
            {"userTraffic": {"usedTrafficBytes": 1024}, "trafficLimitBytes": 2048}
        ) == {"used_bytes": 1024, "limit_bytes": 2048}
        assert branding.traffic_details({"usedTrafficBytes": -1})["used_bytes"] is None

        original = json.loads(default_subscription_guides_config_text())
        updated, changed = guides.add_app(original)
        assert changed and updated != original
        validate_subscription_guides_config(updated)
        assert (
            updated["platforms"]["windows"]["apps"][:-1]
            == original["platforms"]["windows"]["apps"]
        )
        assert guides.add_app(updated) == (updated, False)

        class Panel:
            config = copy.deepcopy(original)
            writes = 0

            async def get_subscription_page_config_list(self):
                return {"configs": [{"uuid": "00000000-0000-0000-0000-000000000000"}]}

            async def get_subscription_page_config_by_uuid(self, identifier):
                return {"uuid": identifier, "config": copy.deepcopy(self.config)}

            async def _request(self, method, endpoint, **kwargs):
                assert method == "PATCH" and endpoint == "/subscription-page-configs"
                self.config = kwargs["json"]["config"]
                self.writes += 1
                return {"response": {"config": self.config}}

        panel = Panel()
        await guides.sync_panel(panel, directory / "backups")
        await guides.sync_panel(panel, directory / "backups")
        assert panel.writes == 1
        assert (
            json.loads(
                next((directory / "backups").glob("*.json")).read_text(encoding="utf-8")
            )["config"]
            == original
        )
    print(
        "Plugin signature rejection, verified cache, offline retention, pinned downloads, Core guide schema, idempotent panel update: passed"
    )


if __name__ == "__main__":
    asyncio.run(main())
