# Veyluro

<div align="center">

```text
██╗   ██╗███████╗██╗   ██╗██╗     ██╗   ██╗██████╗  ██████╗
██║   ██║██╔════╝╚██╗ ██╔╝██║     ██║   ██║██╔══██╗██╔═══██╗
██║   ██║█████╗   ╚████╔╝ ██║     ██║   ██║██████╔╝██║   ██║
╚██╗ ██╔╝██╔══╝    ╚██╔╝  ██║     ██║   ██║██╔══██╗██║   ██║
 ╚████╔╝ ███████╗   ██║   ███████╗╚██████╔╝██║  ██║╚██████╔╝
  ╚═══╝  ╚══════╝   ╚═╝   ╚══════╝ ╚═════╝ ╚═╝  ╚═╝ ╚═════╝
           V E Y L U R O   ·   W A T E R   &   D R A G O N
```

> **Slogan:** Veil your privacy. Let the dragon flow.

**End-to-End Encrypted Messenger - Mobile · Desktop · Server Web**

[![Go](https://img.shields.io/badge/Go-1.23-00ADD8?logo=go)](https://go.dev)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)](https://react.dev)
[![Expo](https://img.shields.io/badge/Expo-54-000020?logo=expo)](https://expo.dev)
[![Wails](https://img.shields.io/badge/Wails-v2-ff6b6b)](https://wails.io)

</div>

---

## What Is Veyluro?

Veyluro là nền tảng nhắn tin **zero-knowledge, end-to-end encrypted** cho mobile + desktop.
Server chỉ lưu encrypted bundle và metadata giao vận, không giữ private key để đọc nội dung tin nhắn.

- **Mobile** - React Native + Expo
- **Desktop** - Wails v2
- **Backend** - Go + Chi + MySQL/MariaDB + WebSocket hub
- **Web runtime** - static bundle được serve từ `packages/server/cmd/server/web`

Messages được mã hóa client-side bằng **AES-256-GCM**. Session key mỗi tin nhắn được wrap theo từng recipient bằng **RSA-2048-OAEP**.

---

## Current State

- `apps/mobile` là mobile app chính
- `apps/desktop/wails-app` là desktop app chính
- `apps/android-native` là hướng native song song (work-in-progress)
- shared crypto/types nằm ở `packages/common`
- server API + realtime nằm ở `packages/server`

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
| Web bundle runtime | IndexedDB (`idb`) | Browser origin |
| Desktop (Wails) | IndexedDB | WebView storage |
| Mobile | `expo-secure-store` | Android Keystore / iOS Keychain |

---

## Monorepo Structure

```text
veyluro/
├── apps/
│   ├── mobile/
│   ├── desktop/wails-app/
│   └── android-native/
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
| Avatar upload to Cloudflare R2 | ✅ |
| Mobile client | ✅ |
| Desktop client | ✅ |

---

## Build And Run

Requirements:

- Node.js 20+
- pnpm 9+
- Go 1.23+
- MySQL 8+ hoặc MariaDB 10.6+

Common commands:

```bash
pnpm install
npm run dev:mobile
cd apps/desktop/wails-app && /home/congmc/go/bin/wails dev
cd packages/server && go run ./cmd/server
```

Release examples:

```bash
# Android
cd apps/mobile/android && ./gradlew clean assembleRelease

# Wails Linux
cd apps/desktop/wails-app && /home/congmc/go/bin/wails build

# Wails Windows portable + installer
/home/congmc/go/bin/wails build -platform windows/amd64
/home/congmc/go/bin/wails build -platform windows/amd64 -nsis
```

---

## Web reCAPTCHA (web-only)

reCAPTCHA chỉ áp dụng cho auth flow của web runtime:

- `register`
- `login`
- `forgot-password`
- `reset-password`

Bản mobile/desktop không bị ép captcha.

Env cần set:

- Server: `RECAPTCHA_SECRET_KEY`
- Frontend web: `VITE_RECAPTCHA_SITE_KEY`

---

## Configuration

Xem các file template:

- `packages/server/.env.example`
- `apps/mobile/.env.example`
- `apps/desktop/wails-app/frontend/.env.example`

Không commit `.env` runtime secrets hoặc keystore vào public repo.

---

## Documentation

- [Changelog](CHANGELOG.md)
- [Release Notes 1.6.0](RELEASE_NOTES_1.6.0.md)
- [Public Env Audit](PUBLIC_ENV_AUDIT.md)

