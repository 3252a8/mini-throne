"""Expose a small, inert palette from the active Minishop theme."""

import re

from config.webapp_themes_config import (
    effective_webapp_theme_tokens,
    resolve_webapp_theme_selection,
)

COLORS = ("accent", "bg", "panel", "panel_2", "border", "text", "muted")


def branding_theme(settings):
    theme = resolve_webapp_theme_selection(settings.webapp_themes_catalog)
    if theme is None:
        return {}
    tokens = effective_webapp_theme_tokens(
        theme, settings.WEBAPP_PRIMARY_COLOR or "#00fe7a"
    ).model_dump(exclude_none=True)
    return {
        name: value
        for name in COLORS
        if isinstance(value := tokens.get(name), str)
        and len(value) <= 80
        and re.fullmatch(
            r"#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?|rgba?\([0-9.,\s]+\)", value
        )
    }


def traffic_details(panel):
    def number(value):
        if isinstance(value, bool):
            return None
        try:
            result = int(value)
            return result if 0 <= result <= 9007199254740991 else None
        except (ValueError, TypeError, OverflowError):
            return None

    traffic = panel.get("userTraffic") or {}
    return {
        "used_bytes": number(
            traffic.get("usedTrafficBytes", panel.get("usedTrafficBytes"))
        ),
        "limit_bytes": number(panel.get("trafficLimitBytes")),
    }
