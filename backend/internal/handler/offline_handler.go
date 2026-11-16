package handler

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"time"

	"github.com/awmorecreative/sinau-backend/internal/database"
	"github.com/awmorecreative/sinau-backend/internal/models"
	"github.com/gofiber/fiber/v2"
)

func generateRandomKey(length int) string {
	bytes := make([]byte, length)
	_, _ = rand.Read(bytes)
	return hex.EncodeToString(bytes)
}

func GenerateOfflineToken(c *fiber.Ctx) error {
	var req models.OfflineTokenRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	// Verify if user is enrolled in the course containing this lesson
	var count int
	query := `SELECT COUNT(*) FROM enrollments e
	          JOIN modules m ON m.course_id = e.course_id
	          JOIN lessons l ON l.module_id = m.id
	          WHERE e.user_id = $1 AND l.id = $2`

	_ = database.DB.QueryRow(context.Background(), query, req.UserID, req.LessonID).Scan(&count)
	if count == 0 {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "User is not enrolled in this course or lesson does not exist"})
	}

	encryptionKey := generateRandomKey(32) // AES-256 key
	expiresAt := time.Now().Add(time.Hour * 24 * 7) // Valid for 7 days offline cache

	var tokenID string
	insertQuery := `INSERT INTO offline_download_tokens (user_id, lesson_id, device_fingerprint, encryption_key, expires_at)
	                VALUES ($1, $2, $3, $4, $5) RETURNING id`

	err := database.DB.QueryRow(context.Background(), insertQuery, req.UserID, req.LessonID, req.DeviceFingerprint, encryptionKey, expiresAt).Scan(&tokenID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to generate offline token"})
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"status":         "success",
		"token_id":       tokenID,
		"encryption_key": encryptionKey,
		"expires_at":     expiresAt,
		"message":        "Encrypted offline download token generated successfully. Video secured with local AES-256.",
	})
}
