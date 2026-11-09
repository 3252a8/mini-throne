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

## Connection and update interface (0.1.4)

The subscription card is informational; Settings → Subscriptions and servers manages sources. Server selection includes Throne's URL latency test and cancellation, without switching the selected profile. These measurements include the VPN path and are not ICMP ping. Unreachable and untested results are distinct; complete JSON profiles use a readable label instead of the internal `custom` type.

The same vertical home layout is used at every window width. Desktop controls are centered and capped at 440 CSS pixels. The fallback shield and tray icon are amber with a cross when disconnected and green with a check when connected. A service logo retains its own colors.

PNG/JPEG use Electron's raster decoder; WebP is decoded in an isolated Chromium world and reduced to a bounded PNG thumbnail. Only same-origin, size-limited raster downloads are accepted. Remote HTML, SVG scripts and service CSS are never executed. The service's default logo is included even when its separate custom-logo setting is empty.

Renewal opens `/?renew=1` on the authenticated service origin. Core's existing renewal deep link preserves the request through browser sign-in and opens checkout. Desktop device tokens are not placed in browser URLs.

Update checks begin alongside startup. The main screen shows download progress, transfer size/speed, verification and a three-second restart notice with a Later action. Active connections and tests defer installation. NSIS's existing one-click progress window remains visible while replacing files, then reopens the app automatically; no extra updater process is bundled. Signed release metadata and both file-hash checks remain enforced.
