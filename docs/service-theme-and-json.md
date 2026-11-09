# Service appearance and JSON profiles

The plugin exports the effective default Minishop theme's accent, background, panel,
secondary panel, border, text and muted colors. The desktop app validates these values
and applies them as a fixed palette. Theme JavaScript and arbitrary stylesheets are
not executed. Existing Minishop branding supplies the service name and raster logo;
unavailable values fall back to `/mini-throne` and the bundled shield SVG. The same
shield is used for the Windows executable, shortcut and tray. The bundled Twemoji
Country Flags font renders flag sequences independently of Windows emoji support.

Subscription status opens the source manager; the server row opens profile selection.
Connect is the accent action. Renewal opens the authenticated instance's HTTPS web app
without placing desktop tokens in a URL. Proxy, TUN, routes and full Throne settings
remain behind the settings button. Traffic values come from the panel's current user
record and are omitted when unavailable.

For public HTTPS subscription URLs the client checks the same-origin `/json` endpoint,
with an 8-second limit and a 4 MiB response cap. It selects that endpoint only when the
response contains an array of complete Xray configurations; other servers keep their
original URL. Explicit `/json` URLs are recognized. No production subscription URL or
payload is embedded in the application, tests, screenshots in Git, or release files.

Complete Xray JSON arrays retain DNS, routing, balancers and observatories. Throne
replaces their local inbound listeners with its own bridge. The group uses a pass-through
outer route so local bypass rules do not override the provider's JSON routing. Ordinary
server links retain the default bypass-Russia route. A standalone Xray JSON object pasted
or opened as a file is wrapped as an array to preserve its complete configuration.
The JSON file/text limit is 2 MiB. Sing-box outbound JSON remains subject to Throne's
native importer; this release does not promise preservation of complete sing-box routing.

Throne downloads missing geodata on first use. The app waits for its automatic retry;
provider balancers can also need time to obtain their first health measurements. Existing
manual edits made through Throne are retained. Managed Minishop subscriptions are migrated
to JSON preference once in this release; subsequent refreshes use the stored URL.

Validation covers theme allowlisting, JSON format negotiation and fallback, full-config
startup, native handoff, regular subscriptions and server links. An owner-supplied private
reference was checked separately: 45 complete Xray profiles, 7 balancers in its first
profile, retained routing, and successful HTTPS traffic through the automatic profile.

References: [Remnawave response rules](https://docs.rw/learn-en/routing-rules/),
[Throne](https://github.com/throneproj/Throne),
[Twemoji Country Flags](https://github.com/talkjs/country-flag-emoji-polyfill).
