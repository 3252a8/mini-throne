Mini Throne 0.1.9 simplifies setup and updates automatically before connecting.

- One active add button in an empty app. Paste from the clipboard into a single field; subscription URLs, individual servers, complete Xray JSON, exported links and deep links are recognized automatically.
- Reuse dialogs and icons with an accessible close button. Keep the compact layout on wide windows.
- Remember the service address from a personalized installer even if its one-time ticket expires; updates preserve the account and service address.
- Enable launch with Windows for new installations. Reconnect to the saved server on Windows startup or after restarting a connected app; retain explicit existing launch preferences.
- Configure the loopback HTTP/SOCKS5 proxy endpoint at the bottom of settings. Occupied ports are rejected before disconnecting.
- Check for updates before connecting, show download and installation progress, and apply the signed differential update automatically. If checking fails, open the installed app and retry in the background.

The companion plugin remains compatible with the existing installation API and refreshes application releases automatically. The related Minishop Core dev update preserves plugin request parameters through Google, Yandex, Discord, Telegram, email, password and passkey sign-in. This authentication fix requires updating the Minishop application, not just the plugin.

Windows x64. Throne 1.4.1 and the routing fixes from 0.1.8 are retained. Existing accounts, subscriptions, servers and routes are preserved. The EXE is not Authenticode signed.
