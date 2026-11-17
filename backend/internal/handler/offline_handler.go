package handler

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"github.com/awmorecreative/sinau-backend/internal/middleware"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
)

const offlineTokenTTL = 7 * 24 * time.Hour

type offlineTokenRequest struct {
	LessonID          string `json:"lesson_id"`
	DeviceFingerprint string `json:"device_fingerprint"`
}

// GenerateOfflineToken — FR-24: token & kunci AES-256 untuk video offline.
// Kunci yang sama dikembalikan untuk kombinasi user + pelajaran + perangkat
// selama token masih berlaku, sehingga file yang sudah diunduh tetap bisa diputar.
func (h *Handler) GenerateOfflineToken(c *fiber.Ctx) error {
	var req offlineTokenRequest
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Body request tidak valid")
	}
	req.DeviceFingerprint = strings.TrimSpace(req.DeviceFingerprint)
	if len(req.DeviceFingerprint) < 8 || len(req.DeviceFingerprint) > 255 {
		return fiber.NewError(fiber.StatusBadRequest, "device_fingerprint tidak valid")
	}
	userID := middleware.UserID(c)

	cx, cancel := ctx(c)
	defer cancel()

	// Pelajaran harus berupa video dan pengguna harus terdaftar di kursusnya.
	var lessonType string
	err := h.db.QueryRow(cx,
		`SELECT l.lesson_type::text FROM lessons l
		 JOIN modules m ON m.id = l.module_id
		 JOIN enrollments e ON e.course_id = m.course_id AND e.user_id = $1
		 WHERE l.id = $2`, userID, req.LessonID,
	).Scan(&lessonType)
	if isNotFound(err) {
		return fiber.NewError(fiber.StatusForbidden, "Anda belum terdaftar di kursus ini atau pelajaran tidak ditemukan")
	} else if err != nil {
		return err
	}
	if lessonType != "video" {
		return fiber.NewError(fiber.StatusBadRequest, "Hanya pelajaran video yang dapat diunduh offline")
	}

	// Gunakan ulang token aktif untuk perangkat yang sama.
	var (
		tokenID, sealedKey string
		expiresAt          time.Time
	)
	err = h.db.QueryRow(cx,
		`SELECT id, encryption_key, expires_at FROM offline_download_tokens
		 WHERE user_id = $1 AND lesson_id = $2 AND device_fingerprint = $3 AND expires_at > NOW()
		 ORDER BY expires_at DESC LIMIT 1`, userID, req.LessonID, req.DeviceFingerprint,
	).Scan(&tokenID, &sealedKey, &expiresAt)

	var keyHex string
	switch {
	case err == nil:
		key, err := h.openKey(sealedKey)
		if err != nil {
			return err
		}
		keyHex = hex.EncodeToString(key)
	case errors.Is(err, pgx.ErrNoRows):
		key := make([]byte, 32) // AES-256
		if _, err := rand.Read(key); err != nil {
			return err
		}
		sealed, err := h.sealKey(key)
		if err != nil {
			return err
		}
		expiresAt = time.Now().Add(offlineTokenTTL)
		if err := h.db.QueryRow(cx,
			`INSERT INTO offline_download_tokens (user_id, lesson_id, device_fingerprint, encryption_key, expires_at)
			 VALUES ($1, $2, $3, $4, $5) RETURNING id`,
			userID, req.LessonID, req.DeviceFingerprint, sealed, expiresAt,
		).Scan(&tokenID); err != nil {
			return err
		}
		keyHex = hex.EncodeToString(key)
	default:
		return err
	}

	c.Set(fiber.HeaderCacheControl, "no-store")
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"status":         "success",
		"token_id":       tokenID,
		"encryption_key": keyHex,
		"expires_at":     expiresAt,
	})
}

// sealKey mengenkripsi kunci offline dengan kunci master (AES-256-GCM)
// sebelum disimpan, agar kebocoran DB tidak membocorkan kunci video.
func (h *Handler) sealKey(key []byte) (string, error) {
	gcm, err := h.offlineGCM()
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(gcm.Seal(nonce, nonce, key, nil)), nil
}

func (h *Handler) openKey(sealed string) ([]byte, error) {
	data, err := base64.StdEncoding.DecodeString(sealed)
	if err != nil {
		return nil, err
	}
	gcm, err := h.offlineGCM()
	if err != nil {
		return nil, err
	}
	if len(data) < gcm.NonceSize() {
		return nil, errors.New("kunci offline tersimpan rusak")
	}
	return gcm.Open(nil, data[:gcm.NonceSize()], data[gcm.NonceSize():], nil)
}

func (h *Handler) offlineGCM() (cipher.AEAD, error) {
	block, err := aes.NewCipher(h.cfg.OfflineKeyMaster)
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}
