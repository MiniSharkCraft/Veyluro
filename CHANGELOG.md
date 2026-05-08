
# Changelog

## 1.3.2
### Added

- Added end-to-end account deletion support across backend, mobile, and desktop clients
  - added `DELETE /api/users/me` backend endpoint
  - added Delete Account option in Mobile2 Settings
  - added Delete Account option in Desktop Settings
  - added two-step confirmation flow before destructive actions
  - automatically clears local session data and returns users to login after deletion

- Improved desktop profile and avatar management
  - added avatar upload support
  - added avatar removal support
  - added instant avatar refresh in sidebar/profile views after updates

### Changed

- synchronized `1.3.2` release metadata across Mobile2 and desktop projects
- improved mobile safe-area handling to reduce status bar and navigation bar overlap
- improved chat bubble layout stability for mixed text and image messages
- stabilized the Android mobile release pipeline after Expo prebuild regeneration

### Fixed

- fixed Android release build failures caused by stale CMake autolinking/codegen cache (`missing .../codegen/jni`)
- fixed release inconsistencies introduced during recent mobile refactors
- fixed upload/session cleanup edge cases after account deletion
- fixed avatar refresh inconsistencies on desktop clients

### Backend Notes

- account deletion now uses transactional cleanup logic
- authored messages are deleted before removing users to avoid foreign key conflicts on `messages.sender_id`
- Cloudflare R2 avatar objects are automatically cleaned up during account deletion

### Build Artifacts

#### Android

- `AMoonEclipse-1.3.2-release.apk`

#### PC

- PC builds remain on the `1.3.1` release branch for this mobile-focused hotfix cycle

## 1.4.0

### Added

- Windows Setup installer and portable release package
- Linux amd64 release binary
- avatar thumbnails and fallback rendering across mobile, desktop, and web clients
- group management actions for add member, remove member, delete group, and leave group
- image attachment sending with larger upload limits

### Changed

- cleaned the public repository to keep local secrets, binaries, and build artifacts out of source control
- refined desktop chat behavior so Enter sends a message and keeps the input ready for the next draft
- removed the desktop notes rail from the chat list to keep the layout tighter
- synced public client config to use safe placeholder API/WS endpoints

### Fixed

- missing avatar rendering in DM and group chat lists
- group admin actions not showing for some valid group rooms
- mobile session persistence and login flow regressions
- message send and reload flow issues on PC and mobile
- release folder cleanup so old artifacts do not mix with new builds

## Unreleased
