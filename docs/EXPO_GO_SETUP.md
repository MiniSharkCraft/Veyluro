# Expo Go — Android Fast-Test Guide

> Get MesSmini running on your Android device in < 5 minutes. No USB, no emulator.

## Prerequisites

| Item | Version |
|------|---------|
| Node.js | ≥ 20 |
| pnpm | ≥ 9 |
| Android phone | Android 10+ (API 29+) |
| Same Wi-Fi network | Phone + dev machine on LAN |

---

## Step 1 — Install Expo Go on Android

Open **Google Play Store** → search **"Expo Go"** → Install.

Or use direct APK from: `https://expo.dev/go`

---

## Step 2 — Install dependencies

```bash
# From monorepo root
pnpm install

# Build the shared common package first
pnpm --filter @messmini/common build 2>/dev/null || true
```

---

## Step 3 — Configure API URL

Create `apps/mobile/.env.local`:

```env
EXPO_PUBLIC_API_URL=https://messmini-server.YOUR_SUBDOMAIN.workers.dev
```

For local backend testing, use your machine's **LAN IP** (not localhost — the phone needs to reach your machine):

```env
EXPO_PUBLIC_API_URL=http://192.168.x.x:8787
```

Find your LAN IP:
- Linux/Mac: `ip addr show | grep 'inet ' | grep -v 127`
- Windows: `ipconfig | findstr IPv4`

---

## Step 4 — Start the dev server

```bash
pnpm --filter @messmini/mobile start
# or: cd apps/mobile && npx expo start
```

You will see a **QR code** in your terminal.

---

## Step 5 — Connect your phone

1. Open **Expo Go** on your Android
2. Tap **"Scan QR code"**
3. Point camera at the QR code in terminal
4. App loads over LAN via Metro bundler (~10-30 seconds first time)

**No USB cable needed. No Play Store submission. No build step.**

---

## Step 6 — Hot Reload

Edit any file in `apps/mobile/` → changes appear on the device instantly.

- **`r`** in terminal → reload manually
- **`m`** in terminal → toggle dev menu on device

---

## Troubleshooting

### "Network request failed" on crypto operations

The polyfill must be the **first import** in `app/_layout.tsx`:

```ts
import 'expo-standard-web-crypto'  // ← must be line 1
// then everything else
```

### QR code doesn't connect

The phone and laptop must be on the **same Wi-Fi**. Hotspot tethering also works.

Switch to **tunnel mode** if LAN fails:

```bash
npx expo start --tunnel
```

(Requires `@expo/ngrok` — installs automatically on first use.)

### SecureStore not available in Expo Go

`expo-secure-store` works in Expo Go on real devices (uses Android Keystore).
It does NOT work on the web target of Expo Go — test on a real Android device.

---

## Metro + Monorepo: resolver config

`apps/mobile/metro.config.js` must be present so Metro can resolve `@messmini/common`:

```js
const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')
const { withNativeWind } = require('nativewind/metro')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '../..')

const config = getDefaultConfig(projectRoot)

// Watch all workspace packages
config.watchFolders = [workspaceRoot]

// Resolve from workspace root first, then project
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
]

// Allow symlinked workspace packages
config.resolver.disableHierarchicalLookup = false

module.exports = withNativeWind(config, { input: './global.css' })
```

---

## Build for production (EAS Build)

When ready to distribute beyond Expo Go:

```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo account
eas login

# Configure build profiles
eas build:configure

# Build Android APK (free tier — queued builds)
eas build --platform android --profile preview

# Build Android AAB for Play Store
eas build --platform android --profile production
```

---

> CongMC Dev Team — "Vắt kiệt công nghệ" 🐧☝️
