package handler

import (
	"context"
	"crypto/rand"
	"crypto/sha512"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"log"
	"math"
	"strconv"
	"strings"

	"github.com/awmorecreative/sinau-backend/internal/database"
	"github.com/awmorecreative/sinau-backend/internal/middleware"
	"github.com/awmorecreative/sinau-backend/internal/models"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
)

// CreateTransaction — FR-10/FR-11: pembelian kursus satuan.
// user_id SELALU diambil dari token, bukan dari body request.
func (h *Handler) CreateTransaction(c *fiber.Ctx) error {
	var req struct {
		CourseID       string `json:"course_id"`
		PaymentGateway string `json:"payment_gateway"` // midtrans | xendit
	}
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Body request tidak valid")
	}
	if req.PaymentGateway == "" {
		req.PaymentGateway = "midtrans"
	}
	if req.PaymentGateway != "midtrans" && req.PaymentGateway != "xendit" {
		return fiber.NewError(fiber.StatusBadRequest, "payment_gateway harus 'midtrans' atau 'xendit'")
	}
	userID := middleware.UserID(c)

	cx, cancel := ctx(c)
	defer cancel()

	var price float64
	err := database.DB.QueryRow(cx,
		`SELECT price FROM courses WHERE id = $1 AND status = 'published'`, req.CourseID).Scan(&price)
	if errors.Is(err, pgx.ErrNoRows) || isInvalidInput(err) {
		return fiber.NewError(fiber.StatusNotFound, "Kursus tidak ditemukan")
	} else if err != nil {
		return err
	}

	var enrolled bool
	if err := database.DB.QueryRow(cx,
		`SELECT EXISTS (SELECT 1 FROM enrollments WHERE user_id = $1 AND course_id = $2)`,
		userID, req.CourseID).Scan(&enrolled); err != nil {
		return err
	}
	if enrolled {
		return fiber.NewError(fiber.StatusConflict, "Anda sudah memiliki kursus ini")
	}

	// Kursus gratis: langsung didaftarkan tanpa payment gateway.
	if price == 0 {
		if _, err := database.DB.Exec(cx,
			`INSERT INTO enrollments (user_id, course_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
			userID, req.CourseID); err != nil {
			return err
		}
		return c.Status(fiber.StatusCreated).JSON(fiber.Map{"status": "success", "message": "Berhasil terdaftar di kursus gratis"})
	}

	externalTxID, err := newOrderID()
	if err != nil {
		return err
	}

	// TODO(FR-11): panggil Midtrans Snap API / Xendit Invoice API sungguhan.
	// Saat ini token & URL pembayaran masih mock.
	snapToken := "mock-" + externalTxID

	var txID string
	err = database.DB.QueryRow(cx,
		`INSERT INTO transactions (user_id, course_id, amount, final_amount, payment_gateway, status, external_transaction_id, snap_token)
		 VALUES ($1, $2, $3, $3, $4, 'pending', $5, $6) RETURNING id`,
		userID, req.CourseID, price, req.PaymentGateway, externalTxID, snapToken,
	).Scan(&txID)
	if err != nil {
		return err
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"status":                  "success",
		"transaction_id":          txID,
		"external_transaction_id": externalTxID,
		"amount":                  price,
		"snap_token":              snapToken,
		"payment_url":             "https://app.sandbox.midtrans.com/snap/v2/vtweb/" + snapToken,
	})
}

// GetMyTransactions — FR-12: riwayat transaksi milik pengguna yang login.
func (h *Handler) GetMyTransactions(c *fiber.Ctx) error {
	cx, cancel := ctx(c)
	defer cancel()

	rows, err := database.DB.Query(cx,
		`SELECT id, user_id, course_id, amount, final_amount, payment_gateway, status,
		        external_transaction_id, paid_at, created_at
		 FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
		middleware.UserID(c))
	if err != nil {
		return err
	}
	defer rows.Close()

	list := make([]models.Transaction, 0)
	for rows.Next() {
		var t models.Transaction
		if err := rows.Scan(&t.ID, &t.UserID, &t.CourseID, &t.Amount, &t.FinalAmount, &t.PaymentGateway,
			&t.Status, &t.ExternalTxID, &t.PaidAt, &t.CreatedAt); err != nil {
			return err
		}
		list = append(list, t)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	return c.JSON(fiber.Map{"status": "success", "data": list})
}

// MidtransWebhook menerima HTTP Notification dari Midtrans.
// Signature diverifikasi: SHA512(order_id + status_code + gross_amount + ServerKey).
func (h *Handler) MidtransWebhook(c *fiber.Ctx) error {
	if h.cfg.MidtransServerKey == "" {
		return fiber.NewError(fiber.StatusServiceUnavailable, "Webhook Midtrans belum dikonfigurasi")
	}

	var n struct {
		OrderID           string `json:"order_id"`
		StatusCode        string `json:"status_code"`
		GrossAmount       string `json:"gross_amount"`
		SignatureKey      string `json:"signature_key"`
		TransactionStatus string `json:"transaction_status"`
		FraudStatus       string `json:"fraud_status"`
		PaymentType       string `json:"payment_type"`
	}
	if err := c.BodyParser(&n); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Payload tidak valid")
	}

	sum := sha512.Sum512([]byte(n.OrderID + n.StatusCode + n.GrossAmount + h.cfg.MidtransServerKey))
	expected := hex.EncodeToString(sum[:])
	if subtle.ConstantTimeCompare([]byte(expected), []byte(strings.ToLower(n.SignatureKey))) != 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "Signature tidak valid")
	}

	var newStatus string
	switch n.TransactionStatus {
	case "settlement":
		newStatus = "paid"
	case "capture":
		if n.FraudStatus == "accept" || n.FraudStatus == "" {
			newStatus = "paid"
		}
	case "deny", "cancel", "failure":
		newStatus = "failed"
	case "expire":
		newStatus = "expired"
	}
	if newStatus == "" {
		// pending / challenge / status lain: tidak ada perubahan.
		return c.JSON(fiber.Map{"status": "success", "message": "Diabaikan"})
	}

	amount, err := strconv.ParseFloat(n.GrossAmount, 64)
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "gross_amount tidak valid")
	}

	return h.applyPaymentStatus(c, n.OrderID, newStatus, amount, n.PaymentType)
}

// XenditWebhook menerima callback Invoice dari Xendit.
// Diverifikasi dengan header x-callback-token.
func (h *Handler) XenditWebhook(c *fiber.Ctx) error {
	if h.cfg.XenditCallbackToken == "" {
		return fiber.NewError(fiber.StatusServiceUnavailable, "Webhook Xendit belum dikonfigurasi")
	}
	token := c.Get("x-callback-token")
	if subtle.ConstantTimeCompare([]byte(token), []byte(h.cfg.XenditCallbackToken)) != 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "Callback token tidak valid")
	}

	var n struct {
		ExternalID    string  `json:"external_id"`
		Status        string  `json:"status"`
		PaidAmount    float64 `json:"paid_amount"`
		Amount        float64 `json:"amount"`
		PaymentMethod string  `json:"payment_method"`
	}
	if err := c.BodyParser(&n); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Payload tidak valid")
	}

	var newStatus string
	amount := n.PaidAmount
	switch n.Status {
	case "PAID", "SETTLED":
		newStatus = "paid"
	case "EXPIRED":
		newStatus = "expired"
		amount = n.Amount
	default:
		return c.JSON(fiber.Map{"status": "success", "message": "Diabaikan"})
	}

	return h.applyPaymentStatus(c, n.ExternalID, newStatus, amount, n.PaymentMethod)
}

// applyPaymentStatus memperbarui status transaksi secara atomik dan idempoten.
// Hanya transaksi berstatus 'pending' yang dapat berubah; jika dibayar,
// akses kursus (enrollment) diberikan dalam DB transaction yang sama.
func (h *Handler) applyPaymentStatus(c *fiber.Ctx, externalTxID, newStatus string, amount float64, method string) error {
	cx, cancel := ctx(c)
	defer cancel()

	err := pgx.BeginFunc(cx, database.DB, func(tx pgx.Tx) error {
		return updateTransaction(cx, tx, externalTxID, newStatus, amount, method)
	})
	if err != nil {
		return err
	}
	return c.JSON(fiber.Map{"status": "success", "message": "Webhook diproses"})
}

func updateTransaction(cx context.Context, tx pgx.Tx, externalTxID, newStatus string, amount float64, method string) error {
	var (
		txID, userID, courseID, current string
		finalAmount                     float64
	)
	err := tx.QueryRow(cx,
		`SELECT id, user_id, course_id, status, final_amount FROM transactions
		 WHERE external_transaction_id = $1 FOR UPDATE`, externalTxID,
	).Scan(&txID, &userID, &courseID, &current, &finalAmount)
	if errors.Is(err, pgx.ErrNoRows) {
		return fiber.NewError(fiber.StatusNotFound, "Transaksi tidak ditemukan")
	} else if err != nil {
		return err
	}

	if current != "pending" {
		return nil // sudah diproses sebelumnya (idempoten)
	}

	if newStatus == "paid" && math.Abs(amount-finalAmount) > 0.01 {
		log.Printf("PERINGATAN: nominal pembayaran tidak cocok untuk %s (diharapkan %.2f, diterima %.2f)",
			externalTxID, finalAmount, amount)
		return fiber.NewError(fiber.StatusBadRequest, "Nominal pembayaran tidak sesuai")
	}

	var methodArg *string
	if method != "" {
		methodArg = &method
	}

	if newStatus == "paid" {
		if _, err := tx.Exec(cx,
			`UPDATE transactions SET status = 'paid', paid_at = NOW(), payment_method = COALESCE($2, payment_method)
			 WHERE id = $1`, txID, methodArg); err != nil {
			return err
		}
		_, err := tx.Exec(cx,
			`INSERT INTO enrollments (user_id, course_id) VALUES ($1, $2) ON CONFLICT (user_id, course_id) DO NOTHING`,
			userID, courseID)
		return err
	}

	_, err = tx.Exec(cx,
		`UPDATE transactions SET status = $2::payment_status, payment_method = COALESCE($3, payment_method)
		 WHERE id = $1`, txID, newStatus, methodArg)
	return err
}

func newOrderID() (string, error) {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return "SINAU-" + strings.ToUpper(hex.EncodeToString(b)), nil
}
