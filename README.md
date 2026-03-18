# MesSmini

```
███╗   ███╗███████╗███████╗███████╗███╗   ███╗██╗███╗   ██╗██╗
████╗ ████║██╔════╝██╔════╝██╔════╝████╗ ████║██║████╗  ██║██║
██╔████╔██║█████╗  ███████╗███████╗██╔████╔██║██║██╔██╗ ██║██║
██║╚██╔╝██║██╔══╝  ╚════██║╚════██║██║╚██╔╝██║██║██║╚██╗██║██║
██║ ╚═╝ ██║███████╗███████║███████║██║ ╚═╝ ██║██║██║ ╚████║██║
╚═╝     ╚═╝╚══════╝╚══════╝╚══════╝╚═╝     ╚═╝╚═╝╚═╝  ╚═══╝╚═╝
```

> **"Vắt kiệt công nghệ"** — CongMC Dev Team 🐧☝️

A zero-knowledge, end-to-end encrypted multi-platform messenger.
Built on the Cloudflare Free Tier. Runs everywhere. Costs nearly nothing.

---

## Philosophy

> The server is dumb. The client is smart. The key never leaves your device.

MesSmini is built around one constraint: **the server is zero-knowledge**.
Every message is encrypted before it leaves the sender's device.
The Cloudflare Worker stores and relays ciphertext it cannot read.
Your private key lives in **IndexedDB** (Web/Desktop) or **SecureStore** (Android/iOS) — never on a server, never in a database, never in transit.

This is not a feature. This is the architecture.

---

## Tech Stack

### The Ecosystem

| Layer | Technology |
|---|---|
| **Web** | React 18 + Vite 5 + Tailwind CSS (Cyberpunk theme) |
| **Mobile** | React Native + Expo Go + NativeWind |
| **Desktop** | Electron (wraps the Web build) |
| **Backend** | Cloudflare Workers + Hono v4 + Durable Objects (WebSocket) |
| **Database** | Cloudflare D1 (SQLite at the edge) |
| **Storage** | Cloudflare R2 (7-day auto-delete lifecycle) |
| **Rate Limit** | KV-backed sliding-window (60 req/min/IP) |

### Core Crypto — Shared Across All Platforms

```
packages/common/src/crypto-engine.ts
```

| Algorithm | Use |
|---|---|
| **AES-256-GCM** | Message encryption (ephemeral session key per message) |
| **RSA-2048-OAEP** | Session key encapsulation (per recipient) |
| **SHA-256** | Key fingerprint for out-of-band verification |
| **Web Crypto API** | Native on Web/Desktop — polyfilled by `expo-standard-web-crypto` on React Native |

The same `encryptMessage()` / `decryptMessage()` functions run on all three platforms with **zero platform branching**. The polyfill handles the rest.

---

## Monorepo Structure

```
messmini/
├── apps/
│   ├── web/                    # React + Vite + Tailwind
│   │   ├── src/
│   │   │   ├── components/     # Reusable UI
│   │   │   ├── pages/          # LoginPage, ChatPage
│   │   │   ├── hooks/          # useWebSocket, useCrypto
│   │   │   └── stores/         # Zustand (authStore, chatStore)
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   └── tailwind.config.ts
│   │
│   ├── mobile/                 # React Native + Expo
│   │   ├── app/
│   │   │   ├── _layout.tsx     # ← Web Crypto polyfill installed HERE (first import)
│   │   │   ├── (auth)/
│   │   │   │   └── login.tsx
│   │   │   └── (app)/
│   │   │       ├── index.tsx   # Room list
│   │   │       └── [roomId].tsx
│   │   ├── metro.config.js     # Monorepo resolver
│   │   ├── babel.config.js     # NativeWind + Reanimated
│   │   ├── app.json
│   │   └── tailwind.config.js
│   │
│   └── desktop/                # Electron wrapper
│       └── electron/
│           ├── main.js         # BrowserWindow, shortcuts, notifications
│           └── preload.js      # contextBridge (IPC bridge)
│
├── packages/
│   ├── common/                 # Shared across ALL platforms
│   │   └── src/
│   │       ├── crypto-engine.ts  # ★ Core E2EE — AES-GCM + RSA-OAEP
│   │       ├── types.ts          # Shared TypeScript interfaces
│   │       └── index.ts
│   │
│   └── server/                 # Cloudflare Workers backend
│       ├── src/
│       │   ├── index.ts          # Hono router + ChatRoom Durable Object
│       │   ├── middleware/
│       │   │   └── rateLimiter.ts
│       │   └── routes/
│       │       ├── auth.ts       # Register, login, public key exchange
│       │       ├── rooms.ts      # Room CRUD
│       │       ├── messages.ts   # Paginated ciphertext fetch
│       │       └── upload.ts     # R2 encrypted attachment upload
│       ├── schema.sql            # D1 migrations
│       └── wrangler.toml         # ★ Cloudflare config
│
├── docs/
│   └── EXPO_GO_SETUP.md        # Android fast-test guide
│
├── package.json                # pnpm workspaces root
├── pnpm-workspace.yaml
├── turbo.json                  # Turborepo build pipeline
└── tsconfig.base.json          # Shared TS config
```

---

## Security Model

```
┌─────────────────────────────────────────────────────────────┐
│                        SENDER DEVICE                        │
│                                                             │
│  plaintext ──► AES-256-GCM encrypt ──► ciphertext          │
│                       ▲                                     │
│              ephemeral session key                          │
│                       │                                     │
│        RSA-OAEP wrap (per recipient public key)             │
│                       │                                     │
│              encrypted session keys                         │
└────────────────────────┬────────────────────────────────────┘
                         │  MessageBundle (JSON)
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    CLOUDFLARE WORKER                        │
│                                                             │
│   Stores bundle as opaque TEXT in D1.                       │
│   Relays via WebSocket (Durable Object).                    │
│   NEVER decrypts. NEVER has private keys.                   │
│   Zero-Knowledge by design.                                 │
└────────────────────────┬────────────────────────────────────┘
                         │  MessageBundle (same JSON)
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                     RECIPIENT DEVICE                        │
│                                                             │
│  encrypted session key ──► RSA-OAEP unwrap (private key)   │
│                                  ▼                          │
│              session key ──► AES-256-GCM decrypt            │
│                                  ▼                          │
│                           plaintext ✓                       │
└─────────────────────────────────────────────────────────────┘
```

### Key Storage

| Platform | Storage | Notes |
|---|---|---|
| Web | IndexedDB (idb) | Browser origin-scoped |
| Desktop | IndexedDB (Electron) | Same as Web — Electron uses Chromium's storage |
| Mobile | `expo-secure-store` | Android Keystore / iOS Keychain |

---

## Cloudflare Free Tier Strategy

| Resource | Free Limit | MesSmini Usage |
|---|---|---|
| Workers | 100k req/day | Rate limited at 60 req/min/IP |
| D1 | 5M rows read/day | Paginated queries, indexed |
| R2 | 10 GB storage | 7-day lifecycle auto-delete |
| R2 Class A ops | 1M/month | Upload-only endpoint |
| R2 Class B ops | 10M/month | Download-only endpoint |
| Durable Objects | 100k req/day | One DO per chat room |
| KV | 100k reads/day | Rate limiter counters (TTL 60s) |

**R2 Lifecycle Policy** (set in Dashboard → R2 → messmini-attachments → Lifecycle):
→ Expire objects after **7 days** → removes stale attachments automatically → stays within free storage.

---

## Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/CongMC-Dev/messmini
cd messmini
pnpm install
```

### 2. Provision Cloudflare Resources

```bash
cd packages/server

# Create D1 database
wrangler d1 create messmini-db
# Copy the database_id into wrangler.toml

# Create R2 bucket
wrangler r2 bucket create messmini-attachments

# Create KV namespace
wrangler kv namespace create RATE_LIMIT_KV
# Copy the id into wrangler.toml

# Set secrets
wrangler secret put JWT_SECRET
wrangler secret put ALLOWED_ORIGINS   # e.g., https://messmini.pages.dev

# Run DB migrations
wrangler d1 execute messmini-db --file=./schema.sql
```

### 3. Deploy Backend

```bash
pnpm --filter @messmini/server deploy
```

### 4. Run Web

```bash
# Update VITE_API_URL in apps/web/.env.local
echo "VITE_API_URL=https://messmini-server.YOUR.workers.dev" > apps/web/.env.local

pnpm dev:web
# → http://localhost:3000
```

### 5. Run Mobile (Expo Go)

See [`docs/EXPO_GO_SETUP.md`](docs/EXPO_GO_SETUP.md) for the full guide.

```bash
pnpm dev:mobile   # starts Expo → scan QR → runs on phone in 30s
```

### 6. Run Desktop

```bash
pnpm dev:desktop  # Starts Vite dev server + Electron simultaneously
```

---

## Development Commands

```bash
# All apps in parallel (requires Turborepo)
pnpm build

# Individual
pnpm dev:web
pnpm dev:mobile
pnpm dev:desktop
pnpm dev:server

# Type check everything
pnpm type-check

# Deploy backend
pnpm --filter @messmini/server deploy
```

---

## Cyberpunk Design System

All platforms share the same visual language:

| Token | Value | Usage |
|---|---|---|
| `neon-cyan` | `#00FFFF` | Primary UI, borders, text |
| `neon-magenta` | `#FF00FF` | Accents, mode indicators |
| `neon-green` | `#39FF14` | Success, online status |
| `neon-yellow` | `#FFE600` | Warnings |
| `dark-900` | `#050508` | Background |
| `dark-800` | `#0D0D14` | Panels |
| Font | JetBrains Mono | All text, all platforms |

**Web/Desktop**: Tailwind CSS with custom cyberpunk utilities (`.cyber-panel`, `.cyber-input`, `.cyber-btn`, `.scan-overlay`)

**Mobile**: NativeWind v4 with the same Tailwind config — same class names, native rendering.

---

## Roadmap

- [ ] Message search (client-side, decrypted in memory)
- [ ] File attachments (encrypted R2 upload)
- [ ] Group rooms (multi-recipient key wrapping — already supported in `encryptMessage()`)
- [ ] Push notifications (Expo + FCM)
- [ ] Desktop: system tray + unread badge
- [ ] Self-destructing messages (TTL in D1)
- [ ] Key rotation
- [ ] Wails alternative for Desktop (Go binary, lighter than Electron)

---

## License

MIT — CongMC Dev Team

---

*Built with the philosophy that free tiers are not limitations — they are constraints that force elegant engineering.*
*Every byte optimized. Every API call justified. The Cloudflare stack, fully vắt kiệt.* 🐧☝️
