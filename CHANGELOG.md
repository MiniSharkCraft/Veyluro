# Changelog

## 1.6.0 - 2026-05-15

- Rebrand toàn bộ app sang `Veyluro` (desktop + mobile + server-facing naming updates).
- Nâng cấp Wails desktop:
  - đổi app title/output sang `Veyluro`
  - cập nhật UI style theo theme `water + dragon`
  - chuẩn hóa login/footer version hiển thị `v1.6.0`
- Cập nhật mobile RN:
  - đồng bộ UI các tab/chats/settings
  - cải thiện call/group-call components và flow runtime config
  - chuẩn hóa Android release/build config cho pipeline VPS
- Cập nhật server:
  - thêm reCAPTCHA verification cho auth endpoints (web-only)
  - giữ tương thích mobile/desktop bằng phân biệt platform header
  - cập nhật schema/handler liên quan auth, room/user flow
- Đồng bộ web bundle public vào `packages/server/cmd/server/web`.
- Dọn repo public: loại bỏ file nhạy cảm và artifacts build nặng.

## 1.5.x

- Các bản ổn định trước của AMoon Eclipse.
