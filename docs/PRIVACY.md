# Freecam: privacy policy

Freecam processes the Twitch player's video frames locally to display the game and movable camera. Video, audio, screenshots, viewing history and account identifiers are not uploaded to Freecam servers. The browser extension has no analytics, advertising SDK or remote executable code.

Camera placement, size and corner radius per channel, the global restoration-area threshold and the optional MSE-worker compatibility preference are stored in the browser's local extension storage. Remove the extension to delete that storage. Freecam does not request Twitch passwords or account access tokens.

The separate Windows OBS setup app connects only to the local OBS WebSocket server. Its OBS password is used for that connection and is not stored by the app. The local setup page must be closed to end its browser connection. The native OBS module captures and encodes the background locally, then adds it to the broadcaster’s normal encoded output. Its bitrate/status panel listens only on loopback and has no remote control or analytics. The optional MSE-worker mode parses video buffers locally and does not upload them.

Twitch and browser stores process data under their own policies. Support and privacy questions: [repository issues](https://github.com/bimo0o/freecam-twitch/issues). Do not include passwords or private widget URLs in issue reports.
