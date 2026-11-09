Mini Throne 0.1.5 improves connection status, service branding and updates.

- Decode service WebP logos using Chromium without adding an image-processing dependency. Include the service default logo in plugin bootstrap responses.
- Show a yellow shield with a cross while disconnected and a green checked shield while connected; keep service branding unchanged. Reflect connection status in the Windows tray.
- Keep subscription status informational. Open subscription and server management explicitly from Settings.
- Use an HTTPS latency probe for service JSON routes, while preserving custom Throne test settings.
- Retry service refresh automatically after a temporary outage or plugin restart.
- Measure server latency through Throne, show results and allow cancellation. Replace the internal CUSTOM label with a readable description.
- Keep the same centered vertical layout on desktop, with controls limited to 440 px.
- Open renewal checkout directly using the service's existing browser sign-in flow.
- Show update download percentage, transferred bytes and speed on the home screen. Verify the signed download, allow postponing the restart, and show the one-click installer's real progress. Preserve differential downloads and defer installation during an active connection.

Windows x64; plugin for Linux x86_64 / Python 3.12 and Core revision 67357d3cfad4a430bfd66fbb507ddad390e5eb73. Existing subscriptions, manual servers and full JSON routing are preserved.
The EXE is not Authenticode signed; SmartScreen may show an unknown publisher.
