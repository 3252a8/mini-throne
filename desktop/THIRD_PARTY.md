# Third-party software

Mini Throne retains the Throne 1.4.1 engine, GPL-3.0, from
https://github.com/throneproj/Throne at 3bbe551d1ca744ad2325b9867160e123ea2b10b9.
The engine's complete corresponding sources and build scripts are retained at the
repository root. Redistributed engine archives retain their license files.

Throne's wire protocol is documented at https://github.com/throneproj/Throne-api
(MIT). The client implementation here is independently written from that protocol.
Its official wire vectors and MIT notice are retained under `scripts/fixtures/`
for checks inside Electron. `@noble/ciphers` (MIT, https://github.com/paulmillr/noble-ciphers)
provides ChaCha20-Poly1305 because Electron's native crypto does not expose it.
This encrypts local control messages; VPN traffic remains in the original engine.
Electron, React, Vite and electron-builder retain their respective upstream licenses
in the packaged dependency tree. Do not remove Electron's LICENSES.chromium.html.

Archi Helper was reviewed for update lifecycle design; its code, assets and personal
profile configuration are not copied into this product.

The offline Russia rule sets come from MetaCubeX/meta-rules-dat (GPL-3.0),
commit 1df33612b1ccc2346e4dbe47a69facf7d1c780bf on its sing branch. Their JSON
sources, binary SRS files, license and exact SHA-256 provenance are in
`desktop/assets/rules/`. Recompile the JSON sources with sing-box `rule-set compile`.

Twemoji Country Flags (country-flag-emoji-polyfill 0.1.10, TalkJS) is bundled
for Windows flag rendering. Code: MIT; Twemoji artwork: CC BY 4.0.
See licenses/TwemojiCountryFlags.LICENSE.md and https://github.com/talkjs/country-flag-emoji-polyfill.
