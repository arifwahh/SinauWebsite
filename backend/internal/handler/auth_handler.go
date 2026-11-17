package handler

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"net/mail"
	"net/url"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/awmorecreative/sinau-backend/internal/middleware"
	"github.com/awmorecreative/sinau-backend/internal/models"
	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"
)

const (
	minimumAge  = 13 // NFR-06: pembatasan usia minimal 13 tahun
	userColumns = `id, email, full_name, phone, role::text, birth_date, preferred_language, is_verified, created_at`
)

func scanUser(row pgx.Row, u *models.User) error {
	return row.Scan(&u.ID, &u.Email, &u.FullName, &u.Phone, &u.Role, &u.BirthDate, &u.PreferredLanguage, &u.IsVerified, &u.CreatedAt)
}

func (h *Handler) createUser(cx context.Context, req registerRequest, role string, isVerified bool) (models.User, error) {
	birth, err := req.validate()
	if err != nil {
		return models.User{}, fiber.NewError(fiber.StatusBadRequest, err.Error())
	}

	hashed, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return models.User{}, err
	}

	var phone *string
	if req.Phone != "" {
		phone = &req.Phone
	}

	var u models.User
	err = scanUser(h.db.QueryRow(cx,
		`INSERT INTO users (email, password_hash, full_name, phone, role, birth_date, is_verified)
		 VALUES ($1, $2, $3, $4, $5::user_role, $6, $7)
		 RETURNING `+userColumns,
		req.Email, string(hashed), req.FullName, phone, role, birth, isVerified,
	), &u)
	if err != nil {
		if isUniqueViolation(err) {
			return models.User{}, fiber.NewError(fiber.StatusConflict, "Email sudah terdaftar")
		}
		return models.User{}, err
	}
	return u, nil
}

// dummyHash dipakai saat email tidak ditemukan agar waktu respons login
// tetap konsisten (mencegah enumerasi email lewat timing).
var dummyHash, _ = bcrypt.GenerateFromPassword([]byte("sinau-dummy-password"), bcrypt.DefaultCost)

type registerRequest struct {
	Email     string `json:"email"`
	Password  string `json:"password"`
	FullName  string `json:"full_name"`
	Phone     string `json:"phone"`
	BirthDate string `json:"birth_date"` // format YYYY-MM-DD
}

func (r *registerRequest) validate() (time.Time, error) {
	r.Email = strings.ToLower(strings.TrimSpace(r.Email))
	r.FullName = strings.TrimSpace(r.FullName)
	r.Phone = strings.TrimSpace(r.Phone)

	if addr, err := mail.ParseAddress(r.Email); err != nil || addr.Address != r.Email {
		return time.Time{}, errors.New("Format email tidak valid")
	}
	// bcrypt hanya memproses 72 byte pertama
	if utf8.RuneCountInString(r.Password) < 8 || len(r.Password) > 72 {
		return time.Time{}, errors.New("Password harus 8–72 karakter")
	}
	if r.FullName == "" || utf8.RuneCountInString(r.FullName) > 255 {
		return time.Time{}, errors.New("Nama lengkap wajib diisi (maks. 255 karakter)")
	}
	if len(r.Phone) > 50 {
		return time.Time{}, errors.New("Nomor HP terlalu panjang")
	}

	birth, err := time.Parse("2006-01-02", r.BirthDate)
	if err != nil {
		return time.Time{}, errors.New("Tanggal lahir wajib diisi dengan format YYYY-MM-DD")
	}
	if birth.After(time.Now().AddDate(-minimumAge, 0, 0)) {
		return time.Time{}, errors.New("Usia minimal untuk mendaftar adalah 13 tahun")
	}
	return birth, nil
}

// Register — FR-01 (registrasi email). OTP & Google Sign-In menyusul.
func (h *Handler) Register(c *fiber.Ctx) error {
	var req registerRequest
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Body request tidak valid")
	}

	cx, cancel := ctx(c)
	defer cancel()

	u, err := h.createUser(cx, req, models.RoleStudent, false)
	if err != nil {
		return err
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"status":  "success",
		"message": "Registrasi berhasil",
		"user_id": u.ID,
	})
}

// Login — FR-02. Mengembalikan access token (JWT) dan refresh token (NFR-05).
func (h *Handler) Login(c *fiber.Ctx) error {
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Body request tidak valid")
	}
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))

	cx, cancel := ctx(c)
	defer cancel()

	var user models.User
	err := h.db.QueryRow(cx,
		`SELECT id, email, password_hash, full_name, role::text FROM users WHERE email = $1`, req.Email,
	).Scan(&user.ID, &user.Email, &user.PasswordHash, &user.FullName, &user.Role)

	if errors.Is(err, pgx.ErrNoRows) {
		_ = bcrypt.CompareHashAndPassword(dummyHash, []byte(req.Password))
		return fiber.NewError(fiber.StatusUnauthorized, "Email atau password salah")
	} else if err != nil {
		return err
	}

	if bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)) != nil {
		return fiber.NewError(fiber.StatusUnauthorized, "Email atau password salah")
	}

	tokens, err := h.issueTokens(cx, h.db, user.ID, user.Email, user.Role, c.Get(fiber.HeaderUserAgent))
	if err != nil {
		return err
	}

	return c.JSON(fiber.Map{
		"status": "success",
		"data":   tokens,
		"user": fiber.Map{
			"id":        user.ID,
			"email":     user.Email,
			"full_name": user.FullName,
			"role":      user.Role,
		},
	})
}

// Refresh menukar refresh token lama dengan pasangan token baru (rotasi).
// Jika refresh token yang sudah dicabut dipakai lagi, seluruh sesi user dicabut
// (deteksi pencurian token).
func (h *Handler) Refresh(c *fiber.Ctx) error {
	var req struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := c.BodyParser(&req); err != nil || req.RefreshToken == "" {
		return fiber.NewError(fiber.StatusBadRequest, "refresh_token wajib diisi")
	}

	cx, cancel := ctx(c)
	defer cancel()

	tx, err := h.db.Begin(cx)
	if err != nil {
		return err
	}
	defer tx.Rollback(cx)

	var (
		tokenID, userID, email, role string
		expiresAt                    time.Time
		revokedAt                    *time.Time
	)
	err = tx.QueryRow(cx,
		`SELECT rt.id, rt.user_id, rt.expires_at, rt.revoked_at, u.email, u.role::text
		 FROM refresh_tokens rt JOIN users u ON u.id = rt.user_id
		 WHERE rt.token_hash = $1 FOR UPDATE OF rt`,
		hashToken(req.RefreshToken),
	).Scan(&tokenID, &userID, &expiresAt, &revokedAt, &email, &role)
	if errors.Is(err, pgx.ErrNoRows) {
		return fiber.NewError(fiber.StatusUnauthorized, "Refresh token tidak valid")
	} else if err != nil {
		return err
	}

	if revokedAt != nil {
		// Token lama dipakai ulang → kemungkinan dicuri. Cabut semua sesi.
		if _, err := tx.Exec(cx,
			`UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`, userID); err != nil {
			return err
		}
		if err := tx.Commit(cx); err != nil {
			return err
		}
		return fiber.NewError(fiber.StatusUnauthorized, "Refresh token sudah tidak berlaku, silakan login ulang")
	}
	if time.Now().After(expiresAt) {
		return fiber.NewError(fiber.StatusUnauthorized, "Refresh token kedaluwarsa, silakan login ulang")
	}

	if _, err := tx.Exec(cx, `UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1`, tokenID); err != nil {
		return err
	}
	tokens, err := h.issueTokens(cx, tx, userID, email, role, c.Get(fiber.HeaderUserAgent))
	if err != nil {
		return err
	}
	if err := tx.Commit(cx); err != nil {
		return err
	}

	return c.JSON(fiber.Map{"status": "success", "data": tokens})
}

// Logout mencabut refresh token yang diberikan.
func (h *Handler) Logout(c *fiber.Ctx) error {
	var req struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := c.BodyParser(&req); err != nil || req.RefreshToken == "" {
		return fiber.NewError(fiber.StatusBadRequest, "refresh_token wajib diisi")
	}

	cx, cancel := ctx(c)
	defer cancel()

	if _, err := h.db.Exec(cx,
		`UPDATE refresh_tokens SET revoked_at = NOW()
		 WHERE token_hash = $1 AND user_id = $2 AND revoked_at IS NULL`,
		hashToken(req.RefreshToken), middleware.UserID(c)); err != nil {
		return err
	}
	return c.JSON(fiber.Map{"status": "success", "message": "Logout berhasil"})
}

// Me mengembalikan profil pengguna yang sedang login (FR-04).
func (h *Handler) Me(c *fiber.Ctx) error {
	cx, cancel := ctx(c)
	defer cancel()

	var u models.User
	err := scanUser(h.db.QueryRow(cx,
		`SELECT `+userColumns+` FROM users WHERE id = $1`, middleware.UserID(c),
	), &u)
	if errors.Is(err, pgx.ErrNoRows) {
		return fiber.NewError(fiber.StatusNotFound, "Pengguna tidak ditemukan")
	} else if err != nil {
		return err
	}
	return c.JSON(fiber.Map{"status": "success", "data": u})
}

// SetPassword memperbarui password akun menggunakan token satu kali dari email pasca-pembelian,
// lalu langsung menerbitkan sesi login (JWT + refresh token) agar user otomatis masuk ke dashboard.
func (h *Handler) SetPassword(c *fiber.Ctx) error {
	var req struct {
		Token       string `json:"token"`
		NewPassword string `json:"new_password"`
	}
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Body request tidak valid")
	}
	req.Token = strings.TrimSpace(req.Token)
	if req.Token == "" {
		return fiber.NewError(fiber.StatusBadRequest, "Token wajib diisi")
	}
	if utf8.RuneCountInString(req.NewPassword) < 8 || len(req.NewPassword) > 72 {
		return fiber.NewError(fiber.StatusBadRequest, "Password baru harus 8–72 karakter")
	}

	hashed, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}

	cx, cancel := ctx(c)
	defer cancel()

	var (
		user   models.User
		tokens *tokenPair
	)
	err = pgx.BeginFunc(cx, h.db, func(tx pgx.Tx) error {
		var (
			tokenID, userID string
			expiresAt       time.Time
			usedAt          *time.Time
		)
		err := tx.QueryRow(cx,
			`SELECT id, user_id, expires_at, used_at FROM password_reset_tokens
			 WHERE token_hash = $1 FOR UPDATE`, hashToken(req.Token),
		).Scan(&tokenID, &userID, &expiresAt, &usedAt)
		if errors.Is(err, pgx.ErrNoRows) {
			return fiber.NewError(fiber.StatusBadRequest, "Token tidak valid")
		} else if err != nil {
			return err
		}
		if usedAt != nil || time.Now().After(expiresAt) {
			return fiber.NewError(fiber.StatusBadRequest, "Token sudah digunakan atau kedaluwarsa")
		}

		if err := scanUser(tx.QueryRow(cx,
			`UPDATE users SET password_hash = $2, is_verified = TRUE, updated_at = NOW()
			 WHERE id = $1 RETURNING `+userColumns,
			userID, string(hashed)), &user); err != nil {
			return err
		}
		if _, err := tx.Exec(cx,
			`UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1`, tokenID); err != nil {
			return err
		}

		tokens, err = h.issueTokens(cx, tx, user.ID, user.Email, user.Role, c.Get(fiber.HeaderUserAgent))
		return err
	})
	if err != nil {
		return err
	}

	return c.JSON(fiber.Map{
		"status":  "success",
		"message": "Password berhasil disimpan",
		"data":    tokens,
		"user": fiber.Map{
			"id":        user.ID,
			"email":     user.Email,
			"full_name": user.FullName,
			"role":      user.Role,
		},
	})
}

const oauthStateCookie = "sinau_oauth_state"

// GoogleOAuthStart mengarahkan pengguna ke halaman login Google OAuth 2.0.
func (h *Handler) GoogleOAuthStart(c *fiber.Ctx) error {
	if h.cfg.GoogleOAuthClientID == "" || h.cfg.GoogleOAuthClientSecret == "" {
		return fiber.NewError(fiber.StatusServiceUnavailable, "Google OAuth belum dikonfigurasi di server")
	}

	raw := make([]byte, 16)
	if _, err := rand.Read(raw); err != nil {
		return err
	}
	state := hex.EncodeToString(raw)

	c.Cookie(&fiber.Cookie{
		Name:     oauthStateCookie,
		Value:    state,
		HTTPOnly: true,
		SameSite: "Lax",
		MaxAge:   600,
		Path:     "/",
	})

	params := url.Values{
		"client_id":     {h.cfg.GoogleOAuthClientID},
		"redirect_uri":  {h.cfg.GoogleOAuthRedirectURL},
		"response_type": {"code"},
		"scope":         {"openid email profile"},
		"state":         {state},
		"prompt":        {"select_account"},
	}
	return c.Redirect("https://accounts.google.com/o/oauth2/v2/auth?"+params.Encode(), fiber.StatusTemporaryRedirect)
}

// GoogleOAuthCallback menukar authorization code dengan profil Google,
// membuat/memuat akun student, lalu mengarahkan ke frontend dengan sesi JWT.
func (h *Handler) GoogleOAuthCallback(c *fiber.Ctx) error {
	if h.cfg.GoogleOAuthClientID == "" || h.cfg.GoogleOAuthClientSecret == "" {
		return fiber.NewError(fiber.StatusServiceUnavailable, "Google OAuth belum dikonfigurasi di server")
	}

	state := c.Query("state")
	cookieState := c.Cookies(oauthStateCookie)
	c.ClearCookie(oauthStateCookie)
	if state == "" || cookieState == "" || state != cookieState {
		return c.Redirect(h.cfg.AppBaseURL+"/login?oauth_error=state_invalid", fiber.StatusTemporaryRedirect)
	}

	code := c.Query("code")
	if code == "" {
		return c.Redirect(h.cfg.AppBaseURL+"/login?oauth_error=access_denied", fiber.StatusTemporaryRedirect)
	}

	cx, cancel := ctx(c)
	defer cancel()

	// Tukar code -> Google access_token
	form := url.Values{
		"code":          {code},
		"client_id":     {h.cfg.GoogleOAuthClientID},
		"client_secret": {h.cfg.GoogleOAuthClientSecret},
		"redirect_uri":  {h.cfg.GoogleOAuthRedirectURL},
		"grant_type":    {"authorization_code"},
	}
	tokReq, err := http.NewRequestWithContext(cx, http.MethodPost, "https://oauth2.googleapis.com/token", strings.NewReader(form.Encode()))
	if err != nil {
		return err
	}
	tokReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	client := &http.Client{Timeout: 10 * time.Second}
	tokResp, err := client.Do(tokReq)
	if err != nil {
		return c.Redirect(h.cfg.AppBaseURL+"/login?oauth_error=google_unreachable", fiber.StatusTemporaryRedirect)
	}
	defer tokResp.Body.Close()

	var tokData struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.NewDecoder(tokResp.Body).Decode(&tokData); err != nil || tokData.AccessToken == "" {
		return c.Redirect(h.cfg.AppBaseURL+"/login?oauth_error=token_exchange_failed", fiber.StatusTemporaryRedirect)
	}

	// Ambil profil email Google
	infoReq, err := http.NewRequestWithContext(cx, http.MethodGet, "https://www.googleapis.com/oauth2/v2/userinfo", nil)
	if err != nil {
		return err
	}
	infoReq.Header.Set("Authorization", "Bearer "+tokData.AccessToken)
	infoResp, err := client.Do(infoReq)
	if err != nil {
		return c.Redirect(h.cfg.AppBaseURL+"/login?oauth_error=userinfo_failed", fiber.StatusTemporaryRedirect)
	}
	defer infoResp.Body.Close()

	var profile struct {
		Email         string `json:"email"`
		VerifiedEmail bool   `json:"verified_email"`
		Name          string `json:"name"`
	}
	if err := json.NewDecoder(infoResp.Body).Decode(&profile); err != nil || profile.Email == "" || !profile.VerifiedEmail {
		return c.Redirect(h.cfg.AppBaseURL+"/login?oauth_error=email_unverified", fiber.StatusTemporaryRedirect)
	}

	email := strings.ToLower(strings.TrimSpace(profile.Email))
	fullName := strings.TrimSpace(profile.Name)
	if fullName == "" {
		fullName = email
	}

	var user models.User
	err = scanUser(h.db.QueryRow(cx, `SELECT `+userColumns+` FROM users WHERE email = $1`, email), &user)
	if errors.Is(err, pgx.ErrNoRows) {
		hashed, err := generateRandomPasswordHash()
		if err != nil {
			return err
		}
		if err := scanUser(h.db.QueryRow(cx,
			`INSERT INTO users (email, password_hash, full_name, role, birth_date, is_verified)
			 VALUES ($1, $2, $3, 'student', '2000-01-01', TRUE)
			 RETURNING `+userColumns,
			email, hashed, fullName), &user); err != nil {
			return err
		}
	} else if err != nil {
		return err
	} else if !user.IsVerified {
		_, _ = h.db.Exec(cx, `UPDATE users SET is_verified = TRUE, updated_at = NOW() WHERE id = $1`, user.ID)
	}

	tokens, err := h.issueTokens(cx, h.db, user.ID, user.Email, user.Role, c.Get(fiber.HeaderUserAgent))
	if err != nil {
		return err
	}

	frag := url.Values{
		"access_token":  {tokens.AccessToken},
		"refresh_token": {tokens.RefreshToken},
	}.Encode()
	return c.Redirect(h.cfg.AppBaseURL+"/auth/google/callback#"+frag, fiber.StatusTemporaryRedirect)
}

func generateRandomPasswordHash() (string, error) {
	rawPass := make([]byte, 24)
	if _, err := rand.Read(rawPass); err != nil {
		return "", err
	}
	hashed, err := bcrypt.GenerateFromPassword([]byte(hex.EncodeToString(rawPass)), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(hashed), nil
}

func createPasswordSetupToken(cx context.Context, db dbExecutor, userID string) (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	token := hex.EncodeToString(raw)
	if _, err := db.Exec(cx,
		`INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
		 VALUES ($1, $2, $3)`,
		userID, hashToken(token), time.Now().Add(24*time.Hour),
	); err != nil {
		return "", err
	}
	return token, nil
}

// --- helper token ---

type tokenPair struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	TokenType    string `json:"token_type"`
	ExpiresIn    int    `json:"expires_in"` // detik
}

func (h *Handler) issueTokens(cx context.Context, db dbExecutor, userID, email, role, userAgent string) (*tokenPair, error) {
	now := time.Now()
	claims := middleware.AccessClaims{
		UserID: userID,
		Email:  email,
		Role:   role,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(h.cfg.AccessTokenTTL)),
			Issuer:    "sinau-api",
		},
	}
	access, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(h.cfg.JWTSecret)
	if err != nil {
		return nil, err
	}

	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return nil, err
	}
	refresh := hex.EncodeToString(raw)

	if _, err := db.Exec(cx,
		`INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent) VALUES ($1, $2, $3, $4)`,
		userID, hashToken(refresh), now.Add(h.cfg.RefreshTokenTTL), truncate(userAgent, 255),
	); err != nil {
		return nil, err
	}

	return &tokenPair{
		AccessToken:  access,
		RefreshToken: refresh,
		TokenType:    "Bearer",
		ExpiresIn:    int(h.cfg.AccessTokenTTL.Seconds()),
	}, nil
}

// Refresh token disimpan sebagai hash SHA-256 agar kebocoran DB tidak
// langsung memberi akses sesi.
func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return strings.ToValidUTF8(s[:max], "")
}
