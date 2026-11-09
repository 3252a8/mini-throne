# mini-throne

Independent public GPL-3.0 derivative of Throne under owner `3252a8`.
Upstream engine sources remain at the repository root. Mini-throne code lives in
`desktop/` and `minishop-plugin/`; keep the engine pinned and retain upstream notices.
Do not copy personal profiles or credentials from other projects.

Develop on `dev`. Publish the same commit to the configured GitLab and GitHub remotes,
GitLab first. Never publish inherited upstream tags or run upstream release workflows.
Keep access tokens in Windows DPAPI storage, never renderer state, logs or deep links.
User-facing strings must support Russian and English. Validate with `npm run check`
and `npm run build` in `desktop/`, then `npm run check:runtime` for engine/transport
changes; inspect signed plugin archives with Core's installer.
Production plugin changes require an explicit deployment request and a recorded rollback.
GitHub Actions builds Mini Throne releases; upstream workflows remain disabled.
