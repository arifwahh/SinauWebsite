package handler

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/mail"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/awmorecreative/sinau-backend/internal/database"
	"github.com/awmorecreative/sinau-backend/internal/middleware"
	"github.com/awmorecreative/sinau-backend/internal/models"
	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"
)

const minimumAge = 13 // NFR-06: pembatasan usia minimal 13 tahun

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
	birth, err := req.validate()
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}

	hashed, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}

	var phone *string
	if req.Phone != "" {
		phone = &req.Phone
	}

	cx, cancel := ctx(c)
	defer cancel()

	var userID string
	err = database.DB.QueryRow(cx,
		`INSERT INTO users (email, password_hash, full_name, phone, birth_date)
		 VALUES ($1, $2, $3, $4, $5) RETURNING id`,
		req.Email, string(hashed), req.FullName, phone, birth,
	).Scan(&userID)
	if err != nil {
		if isUniqueViolation(err) {
			return fiber.NewError(fiber.StatusConflict, "Email sudah terdaftar")
		}
		return err
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"status":  "success",
		"message": "Registrasi berhasil",
		"user_id": userID,
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
	err := database.DB.QueryRow(cx,
		`SELECT id, email, password_hash, full_name, role FROM users WHERE email = $1`, req.Email,
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

	tokens, err := h.issueTokens(c, database.DB, user.ID, user.Email, user.Role)
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

	tx, err := database.DB.Begin(cx)
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
		`SELECT rt.id, rt.user_id, rt.expires_at, rt.revoked_at, u.email, u.role
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
	tokens, err := h.issueTokens(c, tx, userID, email, role)
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

	if _, err := database.DB.Exec(cx,
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
	err := database.DB.QueryRow(cx,
		`SELECT id, email, full_name, phone, role, birth_date, preferred_language, is_verified, created_at
		 FROM users WHERE id = $1`, middleware.UserID(c),
	).Scan(&u.ID, &u.Email, &u.FullName, &u.Phone, &u.Role, &u.BirthDate, &u.PreferredLanguage, &u.IsVerified, &u.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return fiber.NewError(fiber.StatusNotFound, "Pengguna tidak ditemukan")
	} else if err != nil {
		return err
	}
	return c.JSON(fiber.Map{"status": "success", "data": u})
}

// --- helper token ---

type tokenPair struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	TokenType    string `json:"token_type"`
	ExpiresIn    int    `json:"expires_in"` // detik
}

func (h *Handler) issueTokens(c *fiber.Ctx, db dbExecutor, userID, email, role string) (*tokenPair, error) {
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

	cx, cancel := ctx(c)
	defer cancel()
	if _, err := db.Exec(cx,
		`INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent) VALUES ($1, $2, $3, $4)`,
		userID, hashToken(refresh), now.Add(h.cfg.RefreshTokenTTL), truncate(c.Get(fiber.HeaderUserAgent), 255),
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
