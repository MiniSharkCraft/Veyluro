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
[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/G2G11UYLFQ)

</div>

---

## What is AMoon Eclipse?

AMoon Eclipse is a **zero-knowledge, end-to-end encrypted** messaging platform built as a monorepo for web, mobile, and desktop.
The server stores ciphertext and metadata required for delivery, but it does not hold the private keys used to decrypt messages.

- **Web** - React 18 + Vite
- **Mobile** - React Native + Expo
- **Desktop** - Wails v2
- **Backend** - Go + Chi + MySQL/MariaDB + WebSocket hub

Messages are encrypted on the client with **AES-256-GCM**. The per-message session key is wrapped per recipient using **RSA-2048-OAEP**. Private keys stay on the client device.

---

## Support This Project

If you want to support development:

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/G2G11UYLFQ)

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
│  Stores encrypted bundles in MySQL.              │
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

### Key Storage by Platform

| Platform | Storage | Backed by |
|----------|---------|-----------|
| Web | IndexedDB (`idb`) | Browser origin |
| Desktop | IndexedDB | WebView storage |
| Mobile | `expo-secure-store` | Android Keystore / iOS Keychain |

### Server-Side Hardening

- scanner auto-ban for common probe paths
- separate rate limits for auth, API, and WebSocket traffic
- security headers and request size caps
- encrypted email storage and HMAC lookup tokens
- JWT-based auth with protected routes

---

## Monorepo Structure

```text
amoon-eclipse/
├── apps/
│   ├── web/                    # React + Vite web app
│   ├── mobile/                 # legacy Expo client
│   ├── mobile2/                # current Expo client
│   └── desktop/
│       └── wails-app/          # Wails desktop app
│
├── packages/
│   ├── common/                 # shared crypto and types
│   └── server/                 # Go backend
│       ├── cmd/server/main.go
│       └── internal/
│           ├── auth/
│           ├── messages/
│           ├── rooms/
│           ├── friends/
│           ├── users/
│           ├── notes/
│           ├── calls/
│           ├── blocks/
│           ├── moderation/
│           ├── pending/
│           ├── ws/
│           ├── middleware/
│           ├── crypto/
│           ├── db/
│           ├── email/
│           └── config/
│
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
| Web client | ✅ |
| Mobile clients | ✅ |
| Desktop client | ✅ |

---

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9+
- Go 1.23+
- MySQL 8+ or MariaDB 10.6+

### 1. Clone & Install

```bash
git clone https://github.com/your-org/amoon-eclipse
cd amoon-eclipse
pnpm install
```

### 2. Configure the Database

Create a database, then import the schema:

```bash
mysql -u youruser -p yourdb < packages/server/internal/db/schema.sql
```

### 3. Configure the Backend

```bash
cp packages/server/.env.example packages/server/.env
```

Fill in the required values in `packages/server/.env`.

### 4. Run the Backend

```bash
cd packages/server
go run ./cmd/server
```

The API listens on port `8080` by default unless overridden.

### 5. Run the Clients

Web:

```bash
npm run dev:web
```

Legacy mobile app:

```bash
npm run dev:mobile
```

Current mobile app:

```bash
cd apps/mobile2
npx expo start
```

Desktop frontend build:

```bash
cd apps/desktop/wails-app/frontend
npm run build
```

Desktop app build:

```bash
cd apps/desktop/wails-app
wails build
```

---

## Environment Variables

Important backend configuration is documented in:

- `packages/server/.env.example`
- `apps/mobile2/.env.example`

Typical backend values include:

- `DB_DSN`
- `JWT_SECRET`
- `DB_ENCRYPTION_KEY`
- `DB_HMAC_KEY`
- `PORT`
- `ALLOWED_ORIGINS`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `SMTP_*`
- `CF_TURN_*`

Do not commit local `.env` files or deployment secrets.

---

## Project Status

This codebase is still evolving.

- `apps/mobile2` is the main mobile target
- older folders remain for compatibility and migration work
- messaging, auth, crypto, and cross-platform behavior are still actively refined

---

## Contributing

Pull requests are welcome.

Before changing shared crypto or message formats, check the cross-platform impact carefully. The shared logic under `packages/common` must stay compatible across web, mobile, and desktop.

Also read [`AGENTS.md`](./AGENTS.md) before contributing.
