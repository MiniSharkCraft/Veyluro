package email

import (
	"crypto/tls"
	"fmt"
	"mime"
	"net/smtp"
	"strings"
)

type Sender struct {
	host     string
	port     string
	username string
	password string
	from     string
}

func NewSender(host, port, username, password, from string) *Sender {
	return &Sender{host: host, port: port, username: username, password: password, from: from}
}

func (s *Sender) Send(to, subject, html string) error {
	addr := s.host + ":" + s.port
	auth := smtp.PlainAuth("", s.username, s.password, s.host)

	msg := strings.Join([]string{
		"From: " + s.from,
		"To: " + to,
		"Subject: " + mime.QEncoding.Encode("UTF-8", subject),
		"MIME-Version: 1.0",
		"Content-Type: text/html; charset=UTF-8",
		"",
		html,
	}, "\r\n")

	// Port 465 = implicit TLS, port 587 = STARTTLS
	if s.port == "465" {
		tlsCfg := &tls.Config{ServerName: s.host}
		conn, err := tls.Dial("tcp", addr, tlsCfg)
		if err != nil {
			return fmt.Errorf("smtp tls dial: %w", err)
		}
		defer conn.Close()
		c, err := smtp.NewClient(conn, s.host)
		if err != nil {
			return fmt.Errorf("smtp client: %w", err)
		}
		defer c.Quit()
		if err = c.Auth(auth); err != nil {
			return fmt.Errorf("smtp auth: %w", err)
		}
		if err = c.Mail(s.username); err != nil {
			return err
		}
		if err = c.Rcpt(to); err != nil {
			return err
		}
		w, err := c.Data()
		if err != nil {
			return err
		}
		_, err = fmt.Fprint(w, msg)
		w.Close()
		return err
	}

	// Port 587 STARTTLS
	return smtp.SendMail(addr, auth, s.username, []string{to}, []byte(msg))
}

func (s *Sender) SendOTP(to, otp string) error {
	html := fmt.Sprintf(`
<div style="font-family:sans-serif;max-width:400px;margin:40px auto;background:#0E0E1C;color:#F1F5F9;padding:32px;border-radius:16px;border:1px solid #1E1E30">
  <h2 style="color:#818CF8;margin:0 0 8px">🌙 AMoon Eclipse</h2>
  <p style="color:#64748B;margin:0 0 24px;font-size:13px">Đặt lại mật khẩu</p>
  <p style="margin:0 0 16px">Mã OTP của bạn:</p>
  <div style="background:#1E1B4B;border-radius:12px;padding:20px;text-align:center;letter-spacing:8px;font-size:32px;font-weight:700;color:#818CF8">%s</div>
  <p style="color:#64748B;font-size:12px;margin:16px 0 0">Mã có hiệu lực trong <strong>10 phút</strong>. Nếu bạn không yêu cầu, bỏ qua email này.</p>
</div>`, otp)

	return s.Send(to, "Mã OTP đặt lại mật khẩu — AMoon Eclipse", html)
}
