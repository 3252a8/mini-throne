Mini Throne 0.1.6 fixes automatic-route probes and preserves service animation.

- Wait for the first routing observations before measuring full Xray configurations with automatic balancers. Keep the subscription's routing and observation settings intact.
- Bundle verified geoip.dat and geosite.dat databases, so JSON routes do not need a separate first-run download. Preserve custom user databases.
- Show protocol, transport and security details in the server picker, including the protocols used by automatic routes.
- Preserve animated WebP service logos instead of converting them to a static PNG.

Windows x64. The Throne 1.4.1 Qt engine remains pinned; ThroneCore is rebuilt from the corresponding sources with the routing-probe fix. GitHub Actions builds and signs release metadata and the plugin archive.
Existing accounts, subscriptions, manual servers and routing settings are preserved. The EXE is not Authenticode signed; SmartScreen may show an unknown publisher.
