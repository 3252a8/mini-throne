# Release security

The repository contains upstream Throne history and its GPL notices. Upstream authorship
is preserved. Mini Throne commits use GitHub account `3252a8`; automated package-index
commits use its verified noreply address. The public repository never contains service
credentials, device tokens, private subscription URLs or signing private keys.

Gitleaks 8.30.1 scans the entire history in CI. `.gitleaksignore` lists exact, reviewed
fingerprints only: published Throne API test vectors, upstream commit IDs, translation
examples containing PEM delimiters without private material, shell variables and vendored
SQLite identifiers. No directory-wide secret exception is used. Local runtime fixtures,
artifacts, DPAPI files and audit reports are excluded from Git.

A separate Ed25519 release key authenticates `release-manifest.json`. The manifest binds
repository, numeric version, installer size, SHA-256 and SHA-512. The client requires a
newer version, checks updater metadata against that signature before downloading, verifies
the resulting executable again before installation, and does not install on quit implicitly.
Blockmap tampering cannot bypass the final authenticated executable hash. The plugin checks
the same signature and digest before atomically replacing its persistent cache. Public
keys are pinned in source; a service instance cannot choose an update origin or publisher.

The plugin ZIP has its own Ed25519 signature and the existing trusted publisher identity.
The Minishop repository importer downloads its built ZIP by a pinned commit and verifies
index digest, archive signature, publisher trust, exact Core revision and runtime.
The public installer has no Authenticode certificate yet; Windows may show SmartScreen.
The detached release signature does not claim to be an OS certificate.

Actions are pinned by commit, use read-only permissions by default, and cannot obtain
signing secrets on pull requests. Release steps require a version tag reachable from dev.
Release publication uses short-lived GITHUB_TOKEN; the mirror uses a token limited to this
GitLab project. Its initial expiry is 2027-11-08: rotate it before expiry. Both signing keys
and the mirror credential reside in Actions Secrets, with local DPAPI-protected backups.
Repository write access is therefore release-signing authority and must remain restricted.

Panel configuration is backed up before changes. The API has no conditional PATCH/ETag:
a fresh read immediately before PATCH reduces, but cannot eliminate, simultaneous-edit races.
Avoid editing the same configuration during initial synchronization. Plugin removal does
not delete panel configuration or persistent account/cache data automatically.
