package handler

import (
	"bytes"
	"crypto/rand"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/awmorecreative/sinau-backend/internal/config"
	"github.com/awmorecreative/sinau-backend/internal/middleware"
	"github.com/gofiber/fiber/v2"
)

func testHandler(t *testing.T) *Handler {
	t.Helper()
	master := make([]byte, 32)
	if _, err := rand.Read(master); err != nil {
		t.Fatal(err)
	}
	return New(&config.Config{
		JWTSecret:           []byte("test-secret-test-secret-test-secret!"),
		AccessTokenTTL:      time.Minute,
		OfflineKeyMaster:    master,
		MidtransServerKey:   "SB-Mid-server-test",
		XenditCallbackToken: "xendit-test-token",
	})
}

func TestSealOpenKeyRoundTrip(t *testing.T) {
	h := testHandler(t)
	key := []byte("0123456789abcdef0123456789abcdef")
	sealed, err := h.sealKey(key)
	if err != nil {
		t.Fatal(err)
	}
	if len(sealed) > 255 {
		t.Fatalf("sealed key terlalu panjang untuk kolom VARCHAR(255): %d", len(sealed))
	}
	got, err := h.openKey(sealed)
	if err != nil || !bytes.Equal(got, key) {
		t.Fatalf("round trip gagal: %v", err)
	}
}

func TestRegisterValidation(t *testing.T) {
	adult := time.Now().AddDate(-20, 0, 0).Format("2006-01-02")
	child := time.Now().AddDate(-12, 0, 0).Format("2006-01-02")

	cases := []struct {
		name string
		req  registerRequest
		ok   bool
	}{
		{"valid", registerRequest{Email: " Budi@Sinau.id ", Password: "password123", FullName: "Budi", BirthDate: adult}, true},
		{"email salah", registerRequest{Email: "budi", Password: "password123", FullName: "Budi", BirthDate: adult}, false},
		{"password pendek", registerRequest{Email: "a@b.id", Password: "123", FullName: "Budi", BirthDate: adult}, false},
		{"di bawah 13 tahun", registerRequest{Email: "a@b.id", Password: "password123", FullName: "Budi", BirthDate: child}, false},
		{"tanpa tanggal lahir", registerRequest{Email: "a@b.id", Password: "password123", FullName: "Budi"}, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := tc.req.validate()
			if (err == nil) != tc.ok {
				t.Fatalf("ok=%v, err=%v", tc.ok, err)
			}
		})
	}
}

func newTestApp(h *Handler) *fiber.App {
	app := fiber.New(fiber.Config{ErrorHandler: ErrorHandler})
	app.Post("/webhooks/midtrans", h.MidtransWebhook)
	app.Post("/webhooks/xendit", h.XenditWebhook)
	app.Post("/offline/token", middleware.RequireAuth(h.cfg.JWTSecret), h.GenerateOfflineToken)
	return app
}

func TestWebhooksRejectUnsignedRequests(t *testing.T) {
	app := newTestApp(testHandler(t))

	body := `{"order_id":"SINAU-1","status_code":"200","gross_amount":"100000.00","signature_key":"palsu","transaction_status":"settlement"}`
	req := httptest.NewRequest("POST", "/webhooks/midtrans", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	resp, _ := app.Test(req)
	if resp.StatusCode != fiber.StatusUnauthorized {
		t.Fatalf("midtrans: status %d, harusnya 401", resp.StatusCode)
	}

	req = httptest.NewRequest("POST", "/webhooks/xendit", bytes.NewBufferString(`{"external_id":"SINAU-1","status":"PAID"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-callback-token", "salah")
	resp, _ = app.Test(req)
	if resp.StatusCode != fiber.StatusUnauthorized {
		t.Fatalf("xendit: status %d, harusnya 401", resp.StatusCode)
	}
}

func TestProtectedRouteRequiresToken(t *testing.T) {
	app := newTestApp(testHandler(t))
	for _, auth := range []string{"", "Bearer ", "Bearer token.palsu.sekali"} {
		req := httptest.NewRequest("POST", "/offline/token", bytes.NewBufferString(`{}`))
		if auth != "" {
			req.Header.Set("Authorization", auth)
		}
		resp, _ := app.Test(req)
		if resp.StatusCode != fiber.StatusUnauthorized {
			t.Fatalf("auth=%q: status %d, harusnya 401", auth, resp.StatusCode)
		}
	}
}
