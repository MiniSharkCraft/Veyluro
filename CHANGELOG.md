# Changelog

## Unreleased

### Added

- `apps/mobile2` as the current mobile client target
- avatar upload flow backed by Cloudflare R2
- avatar thumbnails through Cloudflare image transformations
- `TERMS.md`, `PRIVACY.md`, and `SECURITY.md` for the public repository
- public-safe release docs and configuration examples

### Changed

- refreshed the public README for the current monorepo layout
- updated build and run notes for web, mobile, desktop, and backend
- cleaned release configuration to avoid committing local secrets and build artifacts
- standardized mobile UI around Phosphor icons and a cleaner dark/light system style

### Fixed

- avatar upload request flow and backend logging for debugging
- public repository sanitization to keep secrets, binaries, and local env files out of git
- mobile and desktop release config drift across the latest refactor

## 0.1.0

- initial public release snapshot
- web, mobile, desktop, and Go backend monorepo layout
- shared client-side E2EE message pipeline
- auth, friends, rooms, notes, calls, moderation, and WebSocket delivery foundations
