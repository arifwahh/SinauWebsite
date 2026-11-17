package config

import (
	"encoding/hex"
	"fmt"
	"log"
	"net"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

// Config menampung seluruh konfigurasi aplikasi yang dibaca dari environment.
type Config struct {
	Port string

	DBHost     string
	DBPort     string
	DBUser     string
	DBPassword string
	DBName     string
	DBSSLMode  string

	JWTSecret       []byte
	AccessTokenTTL  time.Duration
	RefreshTokenTTL time.Duration

	// Kunci master (32 byte, hex) untuk mengenkripsi kunci AES offline saat disimpan di DB.
	OfflineKeyMaster []byte

	XenditSecretKey     string
	XenditCallbackToken string

	CORSAllowOrigins string

	AppBaseURL string
	SMTPHost   string
	SMTPPort   string
	SMTPUser   string
	SMTPPass   string
	SMTPFrom   string

	GoogleServiceAccountJSON string
	GoogleOAuthClientID      string
	GoogleOAuthClientSecret  string
	GoogleOAuthRedirectURL   string
}

// Load membaca konfigurasi dari environment (dan file .env jika ada).
// Aplikasi akan berhenti jika konfigurasi wajib tidak tersedia.
func Load() *Config {
	_ = godotenv.Load() // opsional: .env untuk development lokal

	cfg := &Config{
		Port:       getEnv("PORT", "8080"),
		DBHost:     getEnv("DB_HOST", "localhost"),
		DBPort:     getEnv("DB_PORT", "5432"),
		DBUser:     getEnv("DB_USER", "sinau_admin"),
		DBPassword: getEnv("DB_PASSWORD", ""),
		DBName:     getEnv("DB_NAME", "sinau_db"),
		DBSSLMode:  getEnv("DB_SSLMODE", "disable"),

		AccessTokenTTL:  time.Duration(getEnvInt("ACCESS_TOKEN_TTL_MINUTES", 15)) * time.Minute,
		RefreshTokenTTL: time.Duration(getEnvInt("REFRESH_TOKEN_TTL_DAYS", 30)) * 24 * time.Hour,

		XenditSecretKey:     getEnv("XENDIT_SECRET_KEY", ""),
		XenditCallbackToken: getEnv("XENDIT_CALLBACK_TOKEN", ""),

		CORSAllowOrigins: getEnv("CORS_ALLOW_ORIGINS", "http://localhost:3000"),

		AppBaseURL: strings.TrimRight(getEnv("APP_BASE_URL", "http://localhost:3000"), "/"),
		SMTPHost:   getEnv("SMTP_HOST", ""),
		SMTPPort:   getEnv("SMTP_PORT", "587"),
		SMTPUser:   getEnv("SMTP_USER", ""),
		SMTPPass:   getEnv("SMTP_PASS", ""),
		SMTPFrom:   getEnv("SMTP_FROM", "no-reply@sinau.id"),

		GoogleOAuthClientID:     getEnv("GOOGLE_OAUTH_CLIENT_ID", ""),
		GoogleOAuthClientSecret: getEnv("GOOGLE_OAUTH_CLIENT_SECRET", ""),
		GoogleOAuthRedirectURL:  getEnv("GOOGLE_OAUTH_REDIRECT_URL", "http://localhost:8080/api/v1/auth/google/callback"),
	}

	if rawSA := strings.TrimSpace(os.Getenv("GOOGLE_SERVICE_ACCOUNT_JSON")); rawSA != "" {
		cfg.GoogleServiceAccountJSON = rawSA
	} else if saFile := strings.TrimSpace(os.Getenv("GOOGLE_SERVICE_ACCOUNT_FILE")); saFile != "" {
		b, err := os.ReadFile(saFile)
		if err != nil {
			log.Fatalf("Gagal membaca GOOGLE_SERVICE_ACCOUNT_FILE (%s): %v", saFile, err)
		}
		cfg.GoogleServiceAccountJSON = string(b)
	}

	secret := os.Getenv("JWT_SECRET")
	if len(secret) < 32 {
		log.Fatal("JWT_SECRET wajib diisi dan minimal 32 karakter")
	}
	cfg.JWTSecret = []byte(secret)

	masterHex := os.Getenv("OFFLINE_KEY_MASTER")
	master, err := decodeHexKey(masterHex)
	if err != nil {
		log.Fatalf("OFFLINE_KEY_MASTER tidak valid: %v (harus 64 karakter hex / 32 byte)", err)
	}
	cfg.OfflineKeyMaster = master

	if cfg.XenditSecretKey == "" {
		log.Println("PERINGATAN: XENDIT_SECRET_KEY kosong — CreateTransaction akan menggunakan URL invoice mock")
	}
	if cfg.XenditCallbackToken == "" {
		log.Println("PERINGATAN: XENDIT_CALLBACK_TOKEN kosong — webhook Xendit akan menolak semua callback")
	}

	return cfg
}

// DSN mengembalikan connection string PostgreSQL dengan URL-encoding aman untuk karakter spesial.
func (c *Config) DSN() string {
	u := &url.URL{
		Scheme:   "postgres",
		User:     url.UserPassword(c.DBUser, c.DBPassword),
		Host:     net.JoinHostPort(c.DBHost, c.DBPort),
		Path:     c.DBName,
		RawQuery: "sslmode=" + url.QueryEscape(c.DBSSLMode),
	}
	return u.String()
}

func decodeHexKey(s string) ([]byte, error) {
	b, err := hex.DecodeString(strings.TrimSpace(s))
	if err != nil {
		return nil, err
	}
	if len(b) != 32 {
		return nil, fmt.Errorf("panjang %d byte", len(b))
	}
	return b, nil
}

func getEnv(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if v, ok := os.LookupEnv(key); ok {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return n
		}
	}
	return fallback
}
