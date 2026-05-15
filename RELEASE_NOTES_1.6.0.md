# Veyluro 1.6.0 Release Notes

## Highlights

- Brand rename: `AMoon Eclipse` -> `Veyluro`
- New visual style: water/dragon tone, đồng bộ giữa desktop và web
- Wails desktop artifacts:
  - `Veyluro` (Linux portable)
  - `Veyluro.exe` (Windows portable)
  - `Veyluro-amd64-installer.exe` (Windows installer)
- Web auth hardening:
  - Google reCAPTCHA v3 cho `register/login/forgot/reset`
  - Chỉ bật cho web request (`X-Client-Platform: web`)
  - Mobile + desktop không bị ép captcha

## Operational Notes

- Server env mới:
  - `RECAPTCHA_SECRET_KEY` (optional, chỉ cần nếu bật captcha web)
- Frontend web env mới:
  - `VITE_RECAPTCHA_SITE_KEY`
- Nếu không set 2 biến trên:
  - web captcha auto bypass
  - app vẫn hoạt động bình thường

## Deployment Checklist

1. Pull source 1.6.0
2. Set env (`RECAPTCHA_SECRET_KEY`, `VITE_RECAPTCHA_SITE_KEY`) nếu dùng captcha
3. Build/deploy server
4. Build/deploy web static `packages/server/cmd/server/web`
5. Publish desktop binaries
