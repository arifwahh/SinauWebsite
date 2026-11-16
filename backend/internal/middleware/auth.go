package middleware

import (
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
)

// Kunci context (c.Locals) yang diisi oleh RequireAuth.
const (
	LocalUserID = "user_id"
	LocalRole   = "role"
	LocalEmail  = "email"
)

// AccessClaims adalah isi JWT access token.
type AccessClaims struct {
	UserID string `json:"user_id"`
	Email  string `json:"email"`
	Role   string `json:"role"`
	jwt.RegisteredClaims
}

// RequireAuth memverifikasi header "Authorization: Bearer <token>".
func RequireAuth(secret []byte) fiber.Handler {
	return func(c *fiber.Ctx) error {
		header := c.Get(fiber.HeaderAuthorization)
		tokenStr, ok := strings.CutPrefix(header, "Bearer ")
		if !ok || tokenStr == "" {
			return fiber.NewError(fiber.StatusUnauthorized, "Token akses tidak ditemukan")
		}

		claims := &AccessClaims{}
		token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
			return secret, nil
		}, jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}), jwt.WithExpirationRequired())
		if err != nil || !token.Valid || claims.UserID == "" {
			return fiber.NewError(fiber.StatusUnauthorized, "Token akses tidak valid atau kedaluwarsa")
		}

		c.Locals(LocalUserID, claims.UserID)
		c.Locals(LocalEmail, claims.Email)
		c.Locals(LocalRole, claims.Role)
		return c.Next()
	}
}

// RequireRoles membatasi akses hanya untuk role tertentu (RBAC, NFR-05).
// Harus dipasang setelah RequireAuth.
func RequireRoles(roles ...string) fiber.Handler {
	allowed := make(map[string]struct{}, len(roles))
	for _, r := range roles {
		allowed[r] = struct{}{}
	}
	return func(c *fiber.Ctx) error {
		role, _ := c.Locals(LocalRole).(string)
		if _, ok := allowed[role]; !ok {
			return fiber.NewError(fiber.StatusForbidden, "Anda tidak memiliki akses ke resource ini")
		}
		return c.Next()
	}
}

// UserID mengambil ID pengguna yang sudah terautentikasi.
func UserID(c *fiber.Ctx) string {
	id, _ := c.Locals(LocalUserID).(string)
	return id
}

// Role mengambil role pengguna yang sudah terautentikasi.
func Role(c *fiber.Ctx) string {
	r, _ := c.Locals(LocalRole).(string)
	return r
}
