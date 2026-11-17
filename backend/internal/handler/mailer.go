package handler

import (
	"fmt"
	"html"
	"log"
	"net/smtp"
)

// sendWelcomeEmail mengirimkan email HTML berisi tombol Login ke sistem (pilihan Google OAuth
// atau Login Directly dengan pengaturan password) setelah pembayaran berhasil.
func (h *Handler) sendWelcomeEmail(toEmail, fullName, courseTitle, setupToken string) {
	actionURL := h.cfg.AppBaseURL + "/login"
	if setupToken != "" {
		actionURL = h.cfg.AppBaseURL + "/activate?token=" + setupToken
	}

	subject := "Pembayaran Berhasil — Akses Kursus Sinau Anda"
	safeName := html.EscapeString(fullName)
	safeCourse := html.EscapeString(courseTitle)
	safeURL := html.EscapeString(actionURL)

	htmlBody := fmt.Sprintf(`<!DOCTYPE html>
<html lang="id">
<body style="font-family:sans-serif;background:#f8fafc;padding:24px;color:#0f172a;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:28px;">
    <h2 style="margin:0 0 8px;color:#1e3a8a;">Pembelian Kursus Berhasil!</h2>
    <p style="font-size:14px;line-height:1.6;">Halo <strong>%s</strong>,</p>
    <p style="font-size:14px;line-height:1.6;">
      Pembayaran Anda untuk kursus <strong>%s</strong> telah berhasil dikonfirmasi.
      Klik tombol di bawah ini untuk masuk ke portal belajar Anda (tersedia pilihan <strong>Login dengan Google</strong> atau <strong>Login Directly</strong> untuk mengatur password):
    </p>
    <p style="margin:24px 0;text-align:center;">
      <a href="%s" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 24px;border-radius:10px;">
        Login ke Akun Sinau →
      </a>
    </p>
    <p style="font-size:12px;color:#64748b;">
      Jika tombol tidak berfungsi, salin tautan berikut ke browser:<br/>
      <a href="%s" style="color:#2563eb;">%s</a>
    </p>
  </div>
</body>
</html>`, safeName, safeCourse, safeURL, safeURL, safeURL)

	if h.cfg.SMTPHost == "" {
		log.Printf("[EMAIL-DEV] Kepada: %s | Subjek: %s | Link Login: %s", toEmail, subject, actionURL)
		return
	}

	msg := fmt.Sprintf(
		"From: %s\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n%s",
		h.cfg.SMTPFrom, toEmail, subject, htmlBody,
	)

	var auth smtp.Auth
	if h.cfg.SMTPUser != "" {
		auth = smtp.PlainAuth("", h.cfg.SMTPUser, h.cfg.SMTPPass, h.cfg.SMTPHost)
	}
	addr := h.cfg.SMTPHost + ":" + h.cfg.SMTPPort
	if err := smtp.SendMail(addr, auth, h.cfg.SMTPFrom, []string{toEmail}, []byte(msg)); err != nil {
		log.Printf("PERINGATAN: gagal mengirim email ke %s: %v", toEmail, err)
	}
}
