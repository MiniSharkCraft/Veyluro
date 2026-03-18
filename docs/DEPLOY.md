# Hướng dẫn Deploy — AMoon Eclipse

> CongMC Dev Team 🐧☝️

---

## Bước 0 — Chuẩn bị secrets

### Lấy Google OAuth credentials

1. Vào [console.cloud.google.com](https://console.cloud.google.com)
2. Tạo project mới → **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**
3. Tạo **3 client ID**:
   - **Web** (dùng cho Expo proxy trong dev): Authorized redirect URIs → `https://auth.expo.io/@your_expo_username/amoon-eclipse`
   - **Android**: Package name = `dev.congmc.amoon`, SHA-1 fingerprint (xem bên dưới)
4. Bật API: **Google+ API** hoặc **People API**

Lấy SHA-1 fingerprint cho Android (debug):
```bash
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android | grep SHA1
```

### Lấy Facebook App ID

1. Vào [developers.facebook.com](https://developers.facebook.com) → **My Apps → Create App**
2. Chọn **Consumer** → điền tên app
3. Vào **Settings → Basic** → copy **App ID**
4. Thêm platform **Android**: Package name = `dev.congmc.amoon`

---

## Bước 1 — Deploy Backend (Cloudflare Workers)

```bash
cd packages/server

# 1. Login Cloudflare
npx wrangler login

# 2. Tạo các resources
npx wrangler d1 create amoon-eclipse-db
# → Copy database_id vào wrangler.toml

npx wrangler r2 bucket create amoon-eclipse-attachments

npx wrangler kv namespace create RATE_LIMIT_KV
# → Copy id vào wrangler.toml

# 3. Chỉnh wrangler.toml — thay REPLACE_WITH_... bằng IDs thật

# 4. Set secrets (KHÔNG bao giờ commit vào git!)

# Tạo keys ngẫu nhiên trước:
openssl rand -base64 32   # → dùng cho JWT_SECRET
openssl rand -hex 32      # → dùng cho DB_ENCRYPTION_KEY
openssl rand -hex 32      # → dùng cho DB_HMAC_KEY (key KHÁC với DB_ENCRYPTION_KEY)

npx wrangler secret put JWT_SECRET          # HS256 signing key
npx wrangler secret put DB_ENCRYPTION_KEY   # AES-256-GCM key — mã hóa email trong D1
npx wrangler secret put DB_HMAC_KEY         # HMAC-SHA256 key — email search token
npx wrangler secret put ALLOWED_ORIGINS     # vd: https://amoon.pages.dev,amoon://

# 5. Chạy migration DB
npx wrangler d1 execute amoon-eclipse-db --file=./schema.sql

# 6. Deploy
npx wrangler deploy
```

**Worker URL sẽ là**: `https://amoon-eclipse.YOUR_SUBDOMAIN.workers.dev`

---

## Bước 2 — Build Android APK

### Cài EAS CLI

```bash
npm install -g eas-cli
eas login  # Cần tài khoản expo.dev (miễn phí)
```

### Cấu hình project

```bash
cd apps/mobile

# Tạo file env
cp .env.example .env.local
# → Điền EXPO_PUBLIC_API_URL, EXPO_PUBLIC_GOOGLE_CLIENT_ID, v.v.

# Link project với EAS
eas project:init
# → Copy projectId vào app.json → extra.eas.projectId
```

### Build APK

```bash
# Preview APK (test nội bộ, không cần ký production key)
eas build --platform android --profile preview

# Theo dõi build (EAS cloud build ~10-15 phút)
# → Xong sẽ có link tải APK .apk trực tiếp
```

**Hoặc build local** (cần Android SDK):
```bash
cd apps/mobile
npx expo run:android --variant release
# APK output: android/app/build/outputs/apk/release/app-release.apk
```

---

## Bước 3 — Build AppImage (ArchLinux)

```bash
# Bước 3a — Build web app trước
pnpm --filter @messmini/web build
# Output: apps/web/dist/

# Bước 3b — Build Electron + đóng gói AppImage
cd apps/desktop
pnpm install
pnpm build:linux
# Output: apps/desktop/dist-electron/AMoon Eclipse-0.1.0.AppImage
```

Cài AppImage trên Arch:
```bash
chmod +x "AMoon Eclipse-0.1.0.AppImage"
./"AMoon Eclipse-0.1.0.AppImage"

# Hoặc integrate vào desktop:
./"AMoon Eclipse-0.1.0.AppImage" --appimage-extract
sudo mv squashfs-root /opt/amoon-eclipse
sudo ln -s /opt/amoon-eclipse/AppRun /usr/local/bin/amoon-eclipse
```

---

## Bước 4 — Cấu hình R2 Lifecycle (xóa file sau 7 ngày)

1. Cloudflare Dashboard → **R2 → amoon-eclipse-attachments → Settings**
2. **Object Lifecycle → Add rule**:
   - Rule name: `auto-delete-7d`
   - Prefix: `attachments/`
   - **Expire current version of objects after**: 7 days
3. Save

---

## Checklist trước khi go live

- [ ] `JWT_SECRET` đã set (random ≥ 32 chars)
- [ ] `ALLOWED_ORIGINS` đúng domain
- [ ] D1 migration đã chạy
- [ ] R2 lifecycle đã cấu hình
- [ ] Google OAuth redirect URI đúng
- [ ] Facebook App đã submit review (nếu muốn public)
- [ ] `app.json` → `extra.eas.projectId` đã điền
- [ ] `.env.local` không commit vào git

---

## Tính năng sẽ làm sau

- [ ] Story ảnh/video (R2 upload + 24h lifecycle)
- [ ] Gửi file/ảnh/video trong chat
- [ ] Push notification thật sự (FCM)
- [ ] Desktop: system tray

---

> Server không đọc được tin nhắn. Private key không bao giờ rời khỏi thiết bị. 🔐
