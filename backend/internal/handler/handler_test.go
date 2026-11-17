package handler

import (
	"bytes"
	"crypto/rand"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/awmorecreative/sinau-backend/internal/config"
	"github.com/awmorecreative/sinau-backend/internal/middleware"
	"github.com/awmorecreative/sinau-backend/internal/models"
	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
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
		XenditCallbackToken: "xendit-test-token",
	}, nil)
}

func makeTestJWT(t *testing.T, secret []byte, userID, role string) string {
	t.Helper()
	claims := middleware.AccessClaims{
		UserID: userID,
		Email:  "user@sinau.id",
		Role:   role,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID,
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(15 * time.Minute)),
		},
	}
	tok, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(secret)
	if err != nil {
		t.Fatal(err)
	}
	return tok
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
	if err := bcrypt.CompareHashAndPassword([]byte("$2a$10$2qoRM9I2ydYnnbXpFe03LO5lJ8I8UC/h.y00oC6ZHGl4PW96BKH3q"), []byte("password123")); err != nil {
		t.Fatalf("hash seed schema.sql tidak cocok dengan password123: %v", err)
	}
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

func TestBuildCourseFilterQuery(t *testing.T) {
	minP := 50000.0
	maxP := 250000.0
	minR := 4.5

	sql, args, limit, offset, err := buildCourseFilterQuery(courseFilterParams{
		Search:     "golang",
		CategoryID: 1,
		Level:      "beginner",
		MinPrice:   &minP,
		MaxPrice:   &maxP,
		MinRating:  &minR,
		Limit:      10,
		Offset:     5,
	})
	if err != nil {
		t.Fatalf("seharusnya valid, dapat error: %v", err)
	}
	if limit != 10 || offset != 5 {
		t.Fatalf("limit=%d offset=%d, seharusnya 10 dan 5", limit, offset)
	}
	if !strings.Contains(sql, "title ILIKE $1") || !strings.Contains(sql, "category_id = $2") || !strings.Contains(sql, "level = $3") {
		t.Fatalf("query SQL tidak sesuai ekspektasi: %s", sql)
	}
	if len(args) != 8 {
		t.Fatalf("jumlah argumen = %d, seharusnya 8", len(args))
	}

	// Level tidak valid harus ditolak
	_, _, _, _, err = buildCourseFilterQuery(courseFilterParams{Level: "expert_sekali"})
	if err == nil {
		t.Fatal("seharusnya gagal untuk level tidak valid")
	}

	// Rating di luar batas 0..5 harus ditolak
	badRating := 6.0
	_, _, _, _, err = buildCourseFilterQuery(courseFilterParams{MinRating: &badRating})
	if err == nil {
		t.Fatal("seharusnya gagal untuk min_rating > 5")
	}
}

func TestCalculateVoucherDiscount(t *testing.T) {
	now := time.Now()
	future := now.Add(24 * time.Hour)
	past := now.Add(-24 * time.Hour)
	maxDisc := 30000.0
	limit := 10

	tests := []struct {
		name        string
		price       float64
		voucher     models.Voucher
		wantDisc    float64
		wantFinal   float64
		expectError bool
	}{
		{
			name:  "persentase dengan batas maksimum diskon",
			price: 200000,
			voucher: models.Voucher{
				DiscountType:  "percentage",
				DiscountValue: 25, // 25% dari 200rb = 50rb, tapi dibatasi 30rb
				MaxDiscount:   &maxDisc,
				MinPurchase:   100000,
				IsActive:      true,
				ExpiresAt:     &future,
			},
			wantDisc:  30000,
			wantFinal: 170000,
		},
		{
			name:  "potongan tetap (fixed) melebihi harga menjadi gratis",
			price: 50000,
			voucher: models.Voucher{
				DiscountType:  "fixed",
				DiscountValue: 75000,
				IsActive:      true,
			},
			wantDisc:  50000,
			wantFinal: 0,
		},
		{
			name:  "voucher sudah kedaluwarsa",
			price: 100000,
			voucher: models.Voucher{
				DiscountType:  "percentage",
				DiscountValue: 10,
				IsActive:      true,
				ExpiresAt:     &past,
			},
			expectError: true,
		},
		{
			name:  "kuota voucher habis",
			price: 100000,
			voucher: models.Voucher{
				DiscountType:  "fixed",
				DiscountValue: 10000,
				UsageLimit:    &limit,
				UsedCount:     10,
				IsActive:      true,
			},
			expectError: true,
		},
		{
			name:  "harga di bawah minimum pembelian",
			price: 40000,
			voucher: models.Voucher{
				DiscountType:  "fixed",
				DiscountValue: 10000,
				MinPurchase:   50000,
				IsActive:      true,
			},
			expectError: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			disc, final, err := calculateVoucherDiscount(tc.price, tc.voucher, now)
			if tc.expectError {
				if err == nil {
					t.Fatal("diharapkan error tetapi berhasil")
				}
				return
			}
			if err != nil {
				t.Fatalf("error tidak terduga: %v", err)
			}
			if disc != tc.wantDisc || final != tc.wantFinal {
				t.Fatalf("dapat (disc=%.2f, final=%.2f), ingin (disc=%.2f, final=%.2f)",
					disc, final, tc.wantDisc, tc.wantFinal)
			}
		})
	}
}

func TestCalculateProgressPercentage(t *testing.T) {
	pct, done := calculateProgressPercentage(0, 5)
	if pct != 0 || done {
		t.Fatalf("0/5 seharusnya 0%% dan belum selesai, dapat %.2f %v", pct, done)
	}

	pct, done = calculateProgressPercentage(1, 3)
	if pct != 33.33 || done {
		t.Fatalf("1/3 seharusnya 33.33%%, dapat %.2f", pct)
	}

	pct, done = calculateProgressPercentage(4, 4)
	if pct != 100 || !done {
		t.Fatalf("4/4 seharusnya 100%% dan selesai, dapat %.2f %v", pct, done)
	}
}

func TestGradeQuizSubmission(t *testing.T) {
	questions := []models.QuizQuestion{
		{ID: "q1", CorrectAnswer: "A", Points: 20},
		{ID: "q2", CorrectAnswer: "benar", Points: 30},
		{ID: "q3", CorrectAnswer: "goroutine", Points: 50},
	}

	// Jawab q1 & q3 benar -> 70 poin dari 100 -> lulus (passing 70)
	score, passed := gradeQuizSubmission(questions, map[string]string{
		"q1": " a ",
		"q2": "salah",
		"q3": "Goroutine",
	}, 70)
	if score != 70 || !passed {
		t.Fatalf("diharapkan skor 70 & lulus, dapat score=%d passed=%v", score, passed)
	}

	// Hanya jawab q1 benar -> 20 poin -> tidak lulus
	score, passed = gradeQuizSubmission(questions, map[string]string{"q1": "A"}, 70)
	if score != 20 || passed {
		t.Fatalf("diharapkan skor 20 & gagal, dapat score=%d passed=%v", score, passed)
	}
}

func newTestApp(h *Handler) *fiber.App {
	app := fiber.New(fiber.Config{ErrorHandler: ErrorHandler})
	auth := middleware.RequireAuth(h.cfg.JWTSecret)
	superAdminOnly := middleware.RequireRoles(models.RoleSuperAdmin)
	curatorOrAdmin := middleware.RequireRoles(models.RoleCurator, models.RoleSuperAdmin)

	app.Post("/webhooks/xendit", h.XenditWebhook)
	app.Post("/offline/token", auth, h.GenerateOfflineToken)
	app.Post("/admin/vouchers", auth, superAdminOnly, h.CreateVoucher)
	app.Patch("/admin/courses/:id/status", auth, curatorOrAdmin, h.ReviewCourseStatus)
	return app
}

func doRequest(t *testing.T, app *fiber.App, method, path, body, token string) *http.Response {
	t.Helper()
	req := httptest.NewRequest(method, path, bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("%s %s error: %v", method, path, err)
	}
	return resp
}

func TestWebhooksRejectUnsignedRequests(t *testing.T) {
	app := newTestApp(testHandler(t))

	req := httptest.NewRequest("POST", "/webhooks/xendit", bytes.NewBufferString(`{"external_id":"SINAU-1","status":"PAID"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-callback-token", "salah")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("xendit error: %v", err)
	}
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
		resp, err := app.Test(req)
		if err != nil {
			t.Fatalf("auth=%q error: %v", auth, err)
		}
		if resp.StatusCode != fiber.StatusUnauthorized {
			t.Fatalf("auth=%q: status %d, harusnya 401", auth, resp.StatusCode)
		}
	}
}

func TestRBACBlocksUnauthorizedRoles(t *testing.T) {
	h := testHandler(t)
	app := newTestApp(h)

	studentToken := makeTestJWT(t, h.cfg.JWTSecret, "user-1", models.RoleStudent)
	curatorToken := makeTestJWT(t, h.cfg.JWTSecret, "user-2", models.RoleCurator)

	// Pelajar mencoba akses endpoint Super Admin (/admin/vouchers) -> harus 403 Forbidden
	resp := doRequest(t, app, "POST", "/admin/vouchers", `{"code":"HEMAT50"}`, studentToken)
	if resp.StatusCode != fiber.StatusForbidden {
		t.Fatalf("student ke /admin/vouchers: status %d, seharusnya 403", resp.StatusCode)
	}

	// Kurator mencoba akses endpoint khusus Super Admin (/admin/vouchers) -> harus 403 Forbidden
	resp = doRequest(t, app, "POST", "/admin/vouchers", `{"code":"HEMAT50"}`, curatorToken)
	if resp.StatusCode != fiber.StatusForbidden {
		t.Fatalf("curator ke /admin/vouchers: status %d, seharusnya 403", resp.StatusCode)
	}

	// Kurator mengakses endpoint review kursus dengan status tidak valid -> lolos RBAC (400 Bad Request, bukan 403)
	resp = doRequest(t, app, "PATCH", "/admin/courses/123/status", `{"status":"status_ngawur"}`, curatorToken)
	if resp.StatusCode != fiber.StatusBadRequest {
		t.Fatalf("curator ke /admin/courses/:id/status: status %d, seharusnya 400", resp.StatusCode)
	}
}
