package handler

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"log"
	"math"
	"net/http"
	"net/mail"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/awmorecreative/sinau-backend/internal/middleware"
	"github.com/awmorecreative/sinau-backend/internal/models"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
)

// calculateVoucherDiscount adalah fungsi murni untuk memvalidasi syarat voucher
// dan menghitung potongan harga serta harga akhir (FR-12).
func calculateVoucherDiscount(price float64, v models.Voucher, now time.Time) (discount float64, finalAmount float64, err error) {
	if !v.IsActive {
		return 0, price, errors.New("Kode voucher sudah tidak aktif")
	}
	if v.ExpiresAt != nil && now.After(*v.ExpiresAt) {
		return 0, price, errors.New("Kode voucher sudah kedaluwarsa")
	}
	if v.UsageLimit != nil && v.UsedCount >= *v.UsageLimit {
		return 0, price, errors.New("Kuota kode voucher sudah habis")
	}
	if price < v.MinPurchase {
		return 0, price, errors.New("Harga kursus belum memenuhi minimum pembelian voucher")
	}

	switch v.DiscountType {
	case "percentage":
		if v.DiscountValue <= 0 || v.DiscountValue > 100 {
			return 0, price, errors.New("Nilai persentase diskon tidak valid")
		}
		discount = math.Round((price*(v.DiscountValue/100))*100) / 100
		if v.MaxDiscount != nil && discount > *v.MaxDiscount {
			discount = *v.MaxDiscount
		}
	case "fixed":
		discount = v.DiscountValue
	default:
		return 0, price, errors.New("Tipe diskon tidak dikenali")
	}

	if discount > price {
		discount = price
	}
	finalAmount = math.Round((price-discount)*100) / 100
	return discount, finalAmount, nil
}

// CreateTransaction — FR-10/FR-11/FR-12: pembelian kursus satuan dengan dukungan kode voucher.
// Mendukung pembelian oleh tamu (tanpa akun/login terlebih dahulu) maupun pelajar yang sudah login.
func (h *Handler) CreateTransaction(c *fiber.Ctx) error {
	var req struct {
		CourseID       string `json:"course_id"`
		PaymentGateway string `json:"payment_gateway"` // xendit
		VoucherCode    string `json:"voucher_code"`    // opsional (FR-12)
		Email          string `json:"email"`           // wajib untuk guest checkout
		FullName       string `json:"full_name"`       // wajib untuk guest checkout
		Phone          string `json:"phone"`
		BirthDate      string `json:"birth_date"` // format YYYY-MM-DD, wajib untuk guest checkout
	}
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Body request tidak valid")
	}
	if req.PaymentGateway == "" {
		req.PaymentGateway = "xendit"
	}
	if req.PaymentGateway != "xendit" {
		return fiber.NewError(fiber.StatusBadRequest, "payment_gateway yang didukung hanya 'xendit'")
	}
	req.VoucherCode = strings.ToUpper(strings.TrimSpace(req.VoucherCode))
	userID := middleware.UserID(c)

	var (
		buyerEmail     *string
		buyerName      *string
		buyerPhone     *string
		buyerBirthDate *time.Time
		userIDArg      *string
	)

	cx, cancel := ctx(c)
	defer cancel()

	if userID != "" {
		userIDArg = &userID
	} else {
		email := strings.ToLower(strings.TrimSpace(req.Email))
		name := strings.TrimSpace(req.FullName)
		phone := strings.TrimSpace(req.Phone)

		if addr, err := mail.ParseAddress(email); err != nil || addr.Address != email {
			return fiber.NewError(fiber.StatusBadRequest, "Format email tidak valid")
		}
		if name == "" || utf8.RuneCountInString(name) > 255 {
			return fiber.NewError(fiber.StatusBadRequest, "Nama lengkap wajib diisi (maks. 255 karakter)")
		}
		if phone == "" || len(phone) > 50 {
			return fiber.NewError(fiber.StatusBadRequest, "Nomor HP / WhatsApp wajib diisi (maks. 50 karakter)")
		}
		birth, err := time.Parse("2006-01-02", req.BirthDate)
		if err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Tanggal lahir wajib diisi dengan format YYYY-MM-DD")
		}
		if birth.After(time.Now().AddDate(-minimumAge, 0, 0)) {
			return fiber.NewError(fiber.StatusBadRequest, "Usia minimal untuk mendaftar adalah 13 tahun")
		}
		buyerEmail = &email
		buyerName = &name
		if phone != "" {
			buyerPhone = &phone
		}
		buyerBirthDate = &birth

		var existingID string
		err = h.db.QueryRow(cx, `SELECT id FROM users WHERE email = $1`, email).Scan(&existingID)
		if err == nil {
			return fiber.NewError(fiber.StatusConflict, "Akun sudah terdaftar, silakan login untuk melakukan pembelian kursus")
		} else if !errors.Is(err, pgx.ErrNoRows) {
			return err
		}
	}

	var (
		courseTitle string
		price       float64
	)
	err := h.db.QueryRow(cx,
		`SELECT title, price FROM courses WHERE id = $1 AND status = 'published'`, req.CourseID).Scan(&courseTitle, &price)
	if isNotFound(err) {
		return fiber.NewError(fiber.StatusNotFound, "Kursus tidak ditemukan")
	} else if err != nil {
		return err
	}

	if userIDArg != nil {
		enrolled, err := h.isEnrolled(cx, *userIDArg, req.CourseID)
		if err != nil {
			return err
		}
		if enrolled {
			return fiber.NewError(fiber.StatusConflict, "Anda sudah memiliki kursus ini")
		}
	}

	var (
		voucherID   *string
		discount    float64
		finalAmount = price
	)

	if req.VoucherCode != "" {
		var v models.Voucher
		err := scanVoucher(h.db.QueryRow(cx,
			`SELECT `+voucherColumns+` FROM vouchers WHERE code = $1`, req.VoucherCode,
		), &v)
		if errors.Is(err, pgx.ErrNoRows) {
			return fiber.NewError(fiber.StatusBadRequest, "Kode voucher tidak ditemukan")
		} else if err != nil {
			return err
		}

		discount, finalAmount, err = calculateVoucherDiscount(price, v, time.Now())
		if err != nil {
			return fiber.NewError(fiber.StatusBadRequest, err.Error())
		}
		voucherID = &v.ID
	}

	// Kursus gratis atau diskon 100%: langsung didaftarkan tanpa payment gateway.
	if finalAmount == 0 {
		var setupToken, notifyEmail, notifyName string
		err := pgx.BeginFunc(cx, h.db, func(tx pgx.Tx) error {
			if voucherID != nil {
				if err := consumeVoucher(cx, tx, *voucherID); err != nil {
					return err
				}
			}
			resolvedUID := userIDArg
			if resolvedUID == nil {
				uid, tok, err := ensureGuestUser(cx, tx, *buyerEmail, *buyerName, buyerPhone, *buyerBirthDate)
				if err != nil {
					return err
				}
				resolvedUID = &uid
				setupToken = tok
				notifyEmail = *buyerEmail
				notifyName = *buyerName
			}
			_, err := tx.Exec(cx,
				`INSERT INTO enrollments (user_id, course_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
				*resolvedUID, req.CourseID)
			return err
		})
		if err != nil {
			return err
		}
		if notifyEmail != "" {
			h.sendWelcomeEmail(notifyEmail, notifyName, courseTitle, setupToken)
		}
		return c.Status(fiber.StatusCreated).JSON(fiber.Map{
			"status":          "success",
			"amount":          price,
			"discount":        discount,
			"final_amount":    0,
			"account_created": setupToken != "",
			"message":         "Berhasil terdaftar di kursus",
		})
	}

	externalTxID, err := newOrderID()
	if err != nil {
		return err
	}

	payerEmail := ""
	if buyerEmail != nil {
		payerEmail = *buyerEmail
	} else if userIDArg != nil {
		_ = h.db.QueryRow(cx, `SELECT email FROM users WHERE id = $1`, *userIDArg).Scan(&payerEmail)
	}

	paymentURL := "https://checkout-staging.xendit.co/web/mock-" + externalTxID
	if h.cfg.XenditSecretKey != "" {
		invoiceURL, err := h.createXenditInvoice(cx, externalTxID, finalAmount, payerEmail, "Pembelian Kursus: "+courseTitle)
		if err != nil {
			return err
		}
		paymentURL = invoiceURL
	}

	var txID string
	err = h.db.QueryRow(cx,
		`INSERT INTO transactions (user_id, course_id, voucher_id, buyer_email, buyer_name, buyer_phone, buyer_birth_date, amount, discount, final_amount, payment_gateway, status, external_transaction_id)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'xendit', 'pending', $11) RETURNING id`,
		userIDArg, req.CourseID, voucherID, buyerEmail, buyerName, buyerPhone, buyerBirthDate,
		price, discount, finalAmount, externalTxID,
	).Scan(&txID)
	if err != nil {
		return err
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"status":                  "success",
		"transaction_id":          txID,
		"external_transaction_id": externalTxID,
		"amount":                  price,
		"discount":                discount,
		"final_amount":            finalAmount,
		"payment_gateway":         "xendit",
		"payment_url":             paymentURL,
	})
}

func (h *Handler) createXenditInvoice(cx context.Context, externalID string, amount float64, payerEmail, description string) (string, error) {
	payload := map[string]any{
		"external_id":          externalID,
		"amount":               amount,
		"description":          description,
		"currency":             "IDR",
		"success_redirect_url": h.cfg.AppBaseURL + "/payment/success",
		"failure_redirect_url": h.cfg.AppBaseURL + "/?payment=failed",
	}
	if payerEmail != "" {
		payload["payer_email"] = payerEmail
	}
	bodyBytes, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}

	req, err := http.NewRequestWithContext(cx, http.MethodPost, "https://api.xendit.co/v2/invoices", bytes.NewReader(bodyBytes))
	if err != nil {
		return "", err
	}
	req.SetBasicAuth(h.cfg.XenditSecretKey, "")
	req.Header.Set("Content-Type", "application/json")

	resp, err := (&http.Client{Timeout: 10 * time.Second}).Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		errBody, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		log.Printf("Xendit create invoice gagal (%d): %s", resp.StatusCode, string(errBody))
		return "", fiber.NewError(fiber.StatusBadGateway, "Gagal membuat invoice Xendit")
	}

	var res struct {
		InvoiceURL string `json:"invoice_url"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil || res.InvoiceURL == "" {
		return "", fiber.NewError(fiber.StatusBadGateway, "Respons invoice Xendit tidak valid")
	}
	return res.InvoiceURL, nil
}

// GetMyTransactions — FR-12: riwayat transaksi milik pengguna yang login.
func (h *Handler) GetMyTransactions(c *fiber.Ctx) error {
	cx, cancel := ctx(c)
	defer cancel()

	rows, err := h.db.Query(cx,
		`SELECT id, user_id, course_id, voucher_id, amount, discount, final_amount, payment_gateway, status,
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
		if err := rows.Scan(&t.ID, &t.UserID, &t.CourseID, &t.VoucherID, &t.Amount, &t.Discount,
			&t.FinalAmount, &t.PaymentGateway, &t.Status, &t.ExternalTxID, &t.PaidAt, &t.CreatedAt); err != nil {
			return err
		}
		list = append(list, t)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	return c.JSON(fiber.Map{"status": "success", "data": list})
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

	// Payload dummy dari tombol "Tes dan simpan" di Dashboard Xendit
	if n.ExternalID == "invoice_123124123" {
		return c.JSON(fiber.Map{"status": "success", "message": "Webhook test diterima"})
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

type paymentEmailNotice struct {
	email, fullName, courseTitle, setupToken string
}

// applyPaymentStatus memperbarui status transaksi secara atomik dan idempoten.
// Hanya transaksi berstatus 'pending' yang dapat berubah; jika dibayar,
// akun pelajar dibuat (jika guest) dan akses kursus diberikan dalam DB transaction yang sama.
func (h *Handler) applyPaymentStatus(c *fiber.Ctx, externalTxID, newStatus string, amount float64, method string) error {
	cx, cancel := ctx(c)
	defer cancel()

	var notice *paymentEmailNotice
	err := pgx.BeginFunc(cx, h.db, func(tx pgx.Tx) error {
		var err error
		notice, err = updateTransaction(cx, tx, externalTxID, newStatus, amount, method)
		return err
	})
	if err != nil {
		return err
	}
	if notice != nil {
		h.sendWelcomeEmail(notice.email, notice.fullName, notice.courseTitle, notice.setupToken)
	}
	return c.JSON(fiber.Map{"status": "success", "message": "Webhook diproses"})
}

func updateTransaction(cx context.Context, tx pgx.Tx, externalTxID, newStatus string, amount float64, method string) (*paymentEmailNotice, error) {
	var (
		txID, courseID, current, courseTitle            string
		userID, voucherID, buyerEmail, buyerName, phone *string
		buyerBirth                                      *time.Time
		finalAmount                                     float64
	)
	err := tx.QueryRow(cx,
		`SELECT t.id, t.user_id, t.course_id, t.voucher_id, t.buyer_email, t.buyer_name,
		        t.buyer_phone, t.buyer_birth_date, t.status, t.final_amount, c.title
		 FROM transactions t
		 JOIN courses c ON c.id = t.course_id
		 WHERE t.external_transaction_id = $1 FOR UPDATE OF t`, externalTxID,
	).Scan(&txID, &userID, &courseID, &voucherID, &buyerEmail, &buyerName,
		&phone, &buyerBirth, &current, &finalAmount, &courseTitle)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, fiber.NewError(fiber.StatusNotFound, "Transaksi tidak ditemukan")
	} else if err != nil {
		return nil, err
	}

	if current != "pending" {
		return nil, nil // sudah diproses sebelumnya (idempoten)
	}

	if newStatus == "paid" && math.Abs(amount-finalAmount) > 0.01 {
		log.Printf("PERINGATAN: nominal pembayaran tidak cocok untuk %s (diharapkan %.2f, diterima %.2f)",
			externalTxID, finalAmount, amount)
		return nil, fiber.NewError(fiber.StatusBadRequest, "Nominal pembayaran tidak sesuai")
	}

	var methodArg *string
	if method != "" {
		methodArg = &method
	}

	if newStatus == "paid" {
		var resolvedUID string
		var setupToken string
		if userID != nil {
			resolvedUID = *userID
		} else if buyerEmail != nil && buyerName != nil {
			birth := time.Date(2000, 1, 1, 0, 0, 0, 0, time.UTC)
			if buyerBirth != nil {
				birth = *buyerBirth
			}
			resolvedUID, setupToken, err = ensureGuestUser(cx, tx, *buyerEmail, *buyerName, phone, birth)
			if err != nil {
				return nil, err
			}
		} else {
			return nil, errors.New("transaksi tidak memiliki user_id maupun buyer_email")
		}

		if _, err := tx.Exec(cx,
			`UPDATE transactions SET user_id = $2, status = 'paid', paid_at = NOW(), payment_method = COALESCE($3, payment_method)
			 WHERE id = $1`, txID, resolvedUID, methodArg); err != nil {
			return nil, err
		}
		if voucherID != nil {
			if err := consumeVoucher(cx, tx, *voucherID); err != nil {
				return nil, err
			}
		}
		if _, err := tx.Exec(cx,
			`INSERT INTO enrollments (user_id, course_id) VALUES ($1, $2) ON CONFLICT (user_id, course_id) DO NOTHING`,
			resolvedUID, courseID); err != nil {
			return nil, err
		}
		if buyerEmail != nil && buyerName != nil {
			return &paymentEmailNotice{
				email:       *buyerEmail,
				fullName:    *buyerName,
				courseTitle: courseTitle,
				setupToken:  setupToken,
			}, nil
		}
		return nil, nil
	}

	_, err = tx.Exec(cx,
		`UPDATE transactions SET status = $2::payment_status, payment_method = COALESCE($3, payment_method)
		 WHERE id = $1`, txID, newStatus, methodArg)
	return nil, err
}

func ensureGuestUser(cx context.Context, tx pgx.Tx, email, fullName string, phone *string, birthDate time.Time) (userID string, setupToken string, err error) {
	err = tx.QueryRow(cx, `SELECT id FROM users WHERE email = $1`, email).Scan(&userID)
	if err == nil {
		return userID, "", nil
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return "", "", err
	}

	hashed, err := generateRandomPasswordHash()
	if err != nil {
		return "", "", err
	}

	err = tx.QueryRow(cx,
		`INSERT INTO users (email, password_hash, full_name, phone, role, birth_date, is_verified)
		 VALUES ($1, $2, $3, $4, 'student', $5, TRUE) RETURNING id`,
		email, hashed, fullName, phone, birthDate,
	).Scan(&userID)
	if err != nil {
		return "", "", err
	}

	setupToken, err = createPasswordSetupToken(cx, tx, userID)
	if err != nil {
		return "", "", err
	}
	return userID, setupToken, nil
}

func consumeVoucher(cx context.Context, tx pgx.Tx, voucherID string) error {
	tag, err := tx.Exec(cx,
		`UPDATE vouchers SET used_count = used_count + 1
		 WHERE id = $1 AND (usage_limit IS NULL OR used_count < usage_limit)`, voucherID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fiber.NewError(fiber.StatusConflict, "Kuota kode voucher sudah habis")
	}
	return nil
}

func newOrderID() (string, error) {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return "SINAU-" + strings.ToUpper(hex.EncodeToString(b)), nil
}
