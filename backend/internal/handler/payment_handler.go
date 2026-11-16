package handler

import (
	"context"
	"fmt"
	"time"

	"github.com/awmorecreative/sinau-backend/internal/database"
	"github.com/awmorecreative/sinau-backend/internal/models"
	"github.com/gofiber/fiber/v2"
)

func CreateTransaction(c *fiber.Ctx) error {
	var req struct {
		UserID         string  `json:"user_id"`
		CourseID       string  `json:"course_id"`
		PaymentGateway string  `json:"payment_gateway"` // midtrans or xendit
	}

	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	// Fetch course price
	var price float64
	err := database.DB.QueryRow(context.Background(), "SELECT price FROM courses WHERE id = $1", req.CourseID).Scan(&price)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Course not found"})
	}

	// Create transaction record (FR-10: Seluruh kursus dibeli secara satuan)
	var txID string
	externalTxID := fmt.Sprintf("SINAU-%d", time.Now().UnixNano())
	snapToken := "mock_snap_token_midtrans_or_xendit"

	query := `INSERT INTO transactions (user_id, course_id, amount, final_amount, payment_gateway, status, external_transaction_id, snap_token)
	          VALUES ($1, $2, $3, $3, $4, 'pending', $5, $6) RETURNING id`

	err = database.DB.QueryRow(context.Background(), query, req.UserID, req.CourseID, price, req.PaymentGateway, externalTxID, snapToken).Scan(&txID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create transaction"})
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"status":                  "success",
		"transaction_id":          txID,
		"external_transaction_id": externalTxID,
		"snap_token":              snapToken,
		"payment_url":             "https://app.sandbox.midtrans.com/snap/v2/vtweb/" + snapToken,
	})
}

func PaymentWebhook(c *fiber.Ctx) error {
	var webhook struct {
		ExternalTxID string `json:"external_transaction_id"`
		Status       string `json:"status"` // paid, expired, failed
	}

	if err := c.BodyParser(&webhook); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid webhook payload"})
	}

	var userID, courseID string
	var currentStatus string
	err := database.DB.QueryRow(context.Background(),
		"SELECT user_id, course_id, status FROM transactions WHERE external_transaction_id = $1", webhook.ExternalTxID).
		Scan(&userID, &courseID, &currentStatus)

	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Transaction not found"})
	}

	if webhook.Status == "paid" && currentStatus != "paid" {
		// Update transaction status
		_, _ = database.DB.Exec(context.Background(),
			"UPDATE transactions SET status = 'paid', paid_at = CURRENT_TIMESTAMP WHERE external_transaction_id = $1", webhook.ExternalTxID)

		// Grant course enrollment access automatically
		_, _ = database.DB.Exec(context.Background(),
			"INSERT INTO enrollments (user_id, course_id) VALUES ($1, $2) ON CONFLICT (user_id, course_id) DO NOTHING", userID, courseID)
	}

	return c.JSON(fiber.Map{"status": "success", "message": "Webhook processed successfully"})
}
