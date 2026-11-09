"""Append one Windows app through the official subscription page API."""

from __future__ import annotations

import copy
import json
import os
from pathlib import Path

DOWNLOAD = "https://github.com/3252a8/mini-throne/releases/latest/download/Mini-Throne-Setup-x64.exe"


def add_app(config: dict) -> tuple[dict, bool]:
    result = copy.deepcopy(config)
    windows = result.get("platforms", {}).get("windows")
    if not isinstance(windows, dict) or not isinstance(windows.get("apps"), list):
        return result, False
    apps = windows["apps"]
    if any(str(app.get("name", "")).lower() == "mini throne" for app in apps):
        return result, False
    locales = result.get("locales", ["ru", "en"])

    def label(ru, en):
        return {locale: ru if locale == "ru" else en for locale in locales}

    apps.append(
        {
            "name": "Mini Throne",
            "featured": False,
            "svgIconKey": windows.get("svgIconKey", "Windows"),
            "blocks": [
                {
                    "title": label("Установите Mini Throne", "Install Mini Throne"),
                    "description": label(
                        "Скачайте и запустите установщик для Windows.",
                        "Download and run the Windows installer.",
                    ),
                    "svgIconKey": "DownloadIcon",
                    "svgIconColor": "cyan",
                    "buttons": [
                        {
                            "type": "external",
                            "link": DOWNLOAD,
                            "text": label(
                                "Скачать для Windows", "Download for Windows"
                            ),
                            "svgIconKey": "ExternalLink",
                        }
                    ],
                },
                {
                    "title": label("Добавьте подписку", "Add your subscription"),
                    "description": label(
                        "Откройте приложение и подтвердите добавление подписки.",
                        "Open the app and confirm importing your subscription.",
                    ),
                    "svgIconKey": "CloudDownload",
                    "svgIconColor": "cyan",
                    "buttons": [
                        {
                            "type": "subscriptionLink",
                            "link": "mini-throne://import/{{SUBSCRIPTION_LINK}}",
                            "text": label(
                                "Добавить в Mini Throne", "Add to Mini Throne"
                            ),
                            "svgIconKey": "Plus",
                        }
                    ],
                },
            ],
        }
    )
    return result, True


def config_items(value):
    if isinstance(value, list):
        return value
    if isinstance(value, dict):
        for key in ("configs", "subscriptionPageConfigs", "response", "data"):
            if key in value:
                return config_items(value[key])
    return []


async def sync_panel(panel, directory: Path) -> dict:
    if os.environ.get("MINI_THRONE_SYNC_PANEL", "true").lower() in {"false", "0", "no"}:
        return {"status": "disabled"}
    changed = 0
    for item in config_items(await panel.get_subscription_page_config_list()):
        identifier = item.get("uuid")
        from uuid import UUID

        identifier = str(UUID(identifier))
        before = await panel.get_subscription_page_config_by_uuid(identifier)
        config = before.get("config") if isinstance(before, dict) else None
        if not isinstance(config, dict):
            continue
        updated, needed = add_app(config)
        if not needed:
            continue
        directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        backup = directory / f"{identifier}.json"
        if not backup.exists():
            with backup.open("x", encoding="utf-8") as handle:
                os.chmod(backup, 0o600)
                json.dump(before, handle, ensure_ascii=False)
        # The panel API has no ETag precondition: re-read immediately before PATCH
        # and retry on the next hourly pass if somebody changed the configuration.
        current = await panel.get_subscription_page_config_by_uuid(identifier)
        if not isinstance(current, dict) or current.get("config") != config:
            continue
        result = await panel._request(
            "PATCH",
            "/subscription-page-configs",
            json={"uuid": identifier, "config": updated},
            log_full_response=False,
        )
        if (
            not isinstance(result, dict)
            or result.get("error")
            or result.get("status_code", 200) >= 400
        ):
            raise RuntimeError("panel_update_failed")
        after = await panel.get_subscription_page_config_by_uuid(identifier)
        if not isinstance(after, dict) or after.get("config") != updated:
            raise RuntimeError("panel_update_not_applied")
        changed += 1
    return {"status": "ready", "changed": changed}
