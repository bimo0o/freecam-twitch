# Store submission package — experimental

`scripts/package-stores.ps1` produces `artifacts/store/freecam-chrome.zip` and `freecam-edge.zip`, with manifest at the archive root. Only the browser extension is included; OBS app, test assets and credentials are excluded.

Listing: **Freecam — твоя камера, твоё место**. Short description: «Перемещай, меняй размер или скрывай вебку на подготовленных Twitch-стримах. Один поток — свой вид у каждого зрителя.» Single purpose: personal camera placement on specially composed Twitch video.

Privacy policy: [PRIVACY.md](PRIVACY.md). Permissions: `storage` for local camera preferences, `activeTab`/`scripting` for the popup's explicit on/off controls, Twitch host access for automatic detection and local video rendering. No data is transmitted to an EBS. Stores must disclose local processing of website/video content; do not mark this as an extension that never accesses website content.

Assets: icons in `browser-extension/icons`, wordmark in `browser-extension/brand`, screenshot `artifacts/store/listing-1280x800.png` is a local demonstration and must be labelled accordingly. No live-Twitch compatibility claim until verified. Supplied third-party footage must have distribution rights cleared before using it in store screenshots; the store package itself contains no footage.

Owner steps: register a developer account, provide the required publisher identity/contact details, upload ZIP and images, enter the public privacy-policy URL, complete data-use declarations and submit for review. No account has been created and no listing has been submitted.

- [Chrome registration](https://developer.chrome.com/docs/webstore/register/): one-time registration fee; [publication](https://developer.chrome.com/docs/webstore/publish).
- [Edge registration](https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/publish/create-dev-account): no registration fee; [submission](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension).

After approval, put actual store URLs in README and the OBS hint. Never show fictitious install buttons or imply a ZIP is store installation.

Firefox Android is an experimental direction: manifest includes m.twitch.tv, but Android/Firefox APIs, playback permissions and touch performance need device testing and an AMO-signed package. No iOS/Twitch-app/TV interactive support is claimed. The composed video remains watchable without any extension.
