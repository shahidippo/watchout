# Watchout Android downloads

[Download Watchout 0.1.0 development APK](./Watchout-0.1.0-debug.apk?raw=true)

Android 8.0+ (API 26). This is a debug-signed development build, not a Play Store release.

The app bundles its interface but needs a reachable Watchout backend. Follow [phone setup](../README.md#install-on-android) and the [self-hosting guide](../docs/SELF_HOST.md), then enter your backend address in the app's Settings.

Included: accounts, garages, text posts, public events, private convoy chat, and a private GPS recorder. Live map/road data verification remains blocked by environment access and provider configuration. Aircraft, billing, rewards and advanced navigation are unfinished. GPS behaviour requires physical-device testing. See [validation evidence and feature status](../docs/EVIDENCE.md).

Verify the APK using `sha256sum -c downloads/SHA256SUMS.txt` from the repository root.
