<div align="center">

```text
 █████╗ ███╗   ███╗ ██████╗  ██████╗ ███╗   ██╗
██╔══██╗████╗ ████║██╔═══██╗██╔═══██╗████╗  ██║
███████║██╔████╔██║██║   ██║██║   ██║██╔██╗ ██║
██╔══██║██║╚██╔╝██║██║   ██║██║   ██║██║╚██╗██║
██║  ██║██║ ╚═╝ ██║╚██████╔╝╚██████╔╝██║ ╚████║
╚═╝  ╚═╝╚═╝     ╚═╝ ╚═════╝  ╚═════╝ ╚═╝  ╚═══╝
         E C L I P S E
```

**End-to-End Encrypted Messenger - Web · Mobile · Desktop**

[![Go](https://img.shields.io/badge/Go-1.23-00ADD8?logo=go)](https://go.dev)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)](https://react.dev)
[![Expo](https://img.shields.io/badge/Expo-51-000020?logo=expo)](https://expo.dev)
[![Wails](https://img.shields.io/badge/Wails-v2-ff6b6b)](https://wails.io)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

</div>

---

## What Is AMoon Eclipse?

AMoon Eclipse is a **zero-knowledge, end-to-end encrypted** messenger built as a monorepo for web, mobile, and desktop.
The server stores encrypted bundles and delivery metadata, but it does not hold the private keys used to decrypt messages.

- **Web** - React 18 + Vite
- **Mobile** - React Native + Expo
- **Desktop** - Wails v2
- **Backend** - Go + Chi + MySQL/MariaDB + WebSocket hub

Messages are encrypted on the client with **AES-256-GCM**. The per-message session key is wrapped per recipient using **RSA-2048-OAEP**. Private keys stay on the client device.

---

## Current State

- `apps/mobile2` is the main mobile target
- `apps/mobile` remains as a legacy client for compatibility
- avatar uploads go to Cloudflare R2
- shared crypto lives under `packages/common`
- server API and realtime delivery live under `packages/server`

---

## Security Architecture

```text
┌──────────────────────────────────────────────────┐
│                  SENDER DEVICE                   │
│                                                  │
│  plaintext -> AES-256-GCM -> ciphertext          │
│                      ^                           │
│           ephemeral session key (random)         │
│                      │                           │
│      RSA-OAEP wrap x N recipients                │
│      sessionKeys = { userId: encryptedKey, ... } │
└─────────────────────┬────────────────────────────┘
                      │  { sessionKeys, payload }
                      ▼
┌──────────────────────────────────────────────────┐
│               GO SERVER (BLIND)                  │
│                                                  │
│  Stores encrypted bundles and metadata.          │
│  Forwards via WebSocket hub.                     │
│  Cannot read message plaintext.                  │
└─────────────────────┬────────────────────────────┘
                      │  same bundle
                      ▼
┌──────────────────────────────────────────────────┐
│                RECIPIENT DEVICE                  │
│                                                  │
│  sessionKeys[myId] -> RSA-OAEP unwrap            │
│                              ▼                   │
│             session key -> AES-256-GCM decrypt   │
│                              ▼                   │
│                        plaintext                 │
└──────────────────────────────────────────────────┘
```

### Key Storage

| Platform | Storage | Backed by |
|----------|---------|-----------|
| Web | IndexedDB (`idb`) | Browser origin |
| Desktop | IndexedDB | WebView storage |
| Mobile | `expo-secure-store` | Android Keystore / iOS Keychain |

---

## Monorepo Structure

```text
amoon-eclipse/
├── apps/
│   ├── web/
│   ├── mobile/
│   ├── mobile2/
│   └── desktop/wails-app/
├── packages/
│   ├── common/
│   └── server/
├── docs/
└── scripts/
```

---

## Features

| Feature | Status |
|---------|--------|
| End-to-end encrypted DM | ✅ |
| End-to-end encrypted group chat | ✅ |
| Realtime WebSocket delivery | ✅ |
| Friend system | ✅ |
| Pending messages | ✅ |
| Notes / ephemeral content | ✅ |
| Google OAuth | ✅ |
| TOTP 2FA | ✅ |
| Passphrase key recovery | ✅ |
| User blocking | ✅ |
| Admin moderation tools | ✅ |
| Avatar upload to R2 | ✅ |
| Web client | ✅ |
| Mobile clients | ✅ |
| Desktop client | ✅ |

---

## Build And Run

Requirements:

- Node.js 20+
- pnpm 9+
- Go 1.23+
- MySQL 8+ or MariaDB 10.6+

Common commands:

```bash
pnpm install
npm run dev:web
npm run dev:mobile
cd apps/mobile2 && npx expo start
cd apps/mobile2 && npm run build:apk
cd apps/desktop/wails-app && wails build
cd packages/server && go run ./cmd/server
```

For release builds, rebuild the server binary and regenerate the mobile APK after any API, crypto, or asset change.

---

## Configuration

See:

- [`packages/server/.env.example`](packages/server/.env.example)
- [`apps/mobile2/.env.example`](apps/mobile2/.env.example)

Typical backend values include:

- `DB_DSN`
- `JWT_SECRET`
- `DB_ENCRYPTION_KEY`
- `DB_HMAC_KEY`
- `PORT`
- `ALLOWED_ORIGINS`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`
- `R2_PUBLIC_BASE_URL`

Do not commit local `.env` files or deployment secrets.

---

## Deployment

- Keep backend secrets on the server or panel only
- Use the public API URL in mobile and desktop runtime config
- Enable Cloudflare image transformations if you want avatar thumbnails
- Rebuild the Android APK and Wails binary after release-side changes

---

## Documentation

- [Changelog](CHANGELOG.md)
- [Terms of Service](TERMS.md)
- [Privacy Policy](PRIVACY.md)
- [Security Policy](SECURITY.md)

---

## Contributing

Pull requests are welcome.

Before changing shared crypto or message formats, check the cross-platform impact carefully. The shared logic under `packages/common` must stay compatible across web, mobile, and desktop.

Also read [`AGENTS.md`](./AGENTS.md) before contributing.
