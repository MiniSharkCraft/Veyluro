# Changelog

## Unreleased

### Added

- `apps/mobile2` as the current mobile client target
- image attachment upload pipeline for chat rooms
- attachment uploads backed by Cloudflare R2 storage
- room membership validation before attachment uploads
- attachment size limit set to 50MB
- supported attachment formats: JPEG, PNG, GIF, WEBP, HEIC, and HEIF
- attachment object structure using scoped room/user storage keys
- optimistic image previews in the mobile chat experience
- encrypted attachment metadata inside E2EE message bundles
- avatar upload flow backed by Cloudflare R2
- avatar thumbnails through Cloudflare image transformations
- `TERMS.md`, `PRIVACY.md`, and `SECURITY.md` for the public repository
- public-safe release docs and configuration examples

### Changed

- refreshed the public README for the current monorepo layout
- updated build and run notes for web, mobile, desktop, and backend
- increased backend and storage upload timeout limits to 120 seconds
- cleaned release configuration to avoid committing local secrets and build artifacts
- standardized mobile UI around Phosphor icons and a cleaner dark/light system style
- improved attachment upload handling for slower or unstable mobile networks

### Fixed

- avatar upload request flow and backend logging for debugging
- avatar rendering and cache refresh inconsistencies across clients
- public repository sanitization to keep secrets, binaries, and local env files out of git
- mobile and desktop release config drift across the latest refactor
- upload edge cases causing failed transfers on weak connections
- attachment preview synchronization during optimistic message sends

## 0.1.0

- initial public release snapshot
- web, mobile, desktop, and Go backend monorepo layout
- shared client-side E2EE message pipeline
- auth, friends, rooms, notes, calls, moderation, and WebSocket delivery foundations
