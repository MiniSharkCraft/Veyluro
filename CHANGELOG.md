# Changelog

## v1.5.0 - 2026-05-14

### Added
- Added Wails desktop release targets for Linux portable, Windows portable, and Windows installer builds.
- Added static website release output for users who cannot install a desktop build.
- Added a mobile TextDecoder polyfill so Hermes/Android can handle UTF-16LE decoding paths.

### Changed
- Synced the public source package from the VPS build tree with generated outputs removed.
- Hardened the Android release build order so Reanimated waits for Worklets prefab generation.
- Gated the E2EE fingerprint debug dialog behind development mode so release builds do not show it.

### Fixed
- Fixed Android release builds failing at `:react-native-reanimated:configureCMakeRelWithDebInfo[arm64-v8a]`.
- Fixed Android startup crashes caused by missing `TextDecoder` encoding support.
- Fixed the web TypeScript build issue around React Router component typing.

### Public Source Notes
- Public sync excludes `.env*`, signing keys, certificates, APK/AAB files, release bundles, dependency folders, desktop binaries, and native build caches.
- Android signing still requires private `AMOON_RELEASE_*` values supplied outside this public tree.
