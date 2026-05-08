
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
