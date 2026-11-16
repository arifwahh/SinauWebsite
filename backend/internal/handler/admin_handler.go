package handler

import (
	"errors"
	"strings"
	"time"

	"github.com/awmorecreative/sinau-backend/internal/database"
	"github.com/awmorecreative/sinau-backend/internal/models"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"
)

var validCourseStatuses = map[string]bool{
	models.CourseDraft:     true,
	models.CourseSubmitted: true,
	models.CourseReviewing: true,
	models.CoursePublished: true,
	models.CourseRejected:  true,
}

var validRoles = map[string]bool{
	models.RoleStudent:            true,
	models.RoleInternalInstructor: true,
	models.RoleExternalInstructor: true,
	models.RoleB2BAdmin:           true,
	models.RoleCurator:            true,
	models.RoleSuperAdmin:         true,
}

// CreateCategory — FR-90: kurator / super_admin membuat kategori kursus baru.
func (h *Handler) CreateCategory(c *fiber.Ctx) error {
	var req struct {
		Name        string  `json:"name"`
		Slug        string  `json:"slug"`
		Description *string `json:"description"`
	}
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Body request tidak valid")
	}
	req.Name = strings.TrimSpace(req.Name)
	req.Slug = strings.TrimSpace(req.Slug)
	if req.Name == "" || len(req.Name) > 100 {
		return fiber.NewError(fiber.StatusBadRequest, "Nama kategori wajib diisi (maks. 100 karakter)")
	}
	if !slugPattern.MatchString(req.Slug) || len(req.Slug) > 100 {
		return fiber.NewError(fiber.StatusBadRequest, "Slug kategori tidak valid")
	}

	cx, cancel := ctx(c)
	defer cancel()

	var cat models.Category
	err := database.DB.QueryRow(cx,
		`INSERT INTO categories (name, slug, description) VALUES ($1, $2, $3)
		 RETURNING id, name, slug, description, created_at`,
		req.Name, req.Slug, req.Description,
	).Scan(&cat.ID, &cat.Name, &cat.Slug, &cat.Description, &cat.CreatedAt)
	if err != nil {
		if isUniqueViolation(err) {
			return fiber.NewError(fiber.StatusConflict, "Slug kategori sudah digunakan")
		}
		return err
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"status": "success", "data": cat})
}

// ReviewCourseStatus — FR-72, FR-90: kurator / super_admin mengubah status kursus
// (draft -> submitted -> reviewing -> published / rejected).
func (h *Handler) ReviewCourseStatus(c *fiber.Ctx) error {
	courseID := c.Params("id")
	var req struct {
		Status string `json:"status"`
	}
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Body request tidak valid")
	}
	if !validCourseStatuses[req.Status] {
		return fiber.NewError(fiber.StatusBadRequest, "Status kursus tidak valid")
	}

	cx, cancel := ctx(c)
	defer cancel()

	var course models.Course
	err := scanCourse(database.DB.QueryRow(cx,
		`UPDATE courses SET status = $2::course_status, updated_at = NOW()
		 WHERE id = $1 RETURNING `+courseColumns, courseID, req.Status,
	), &course)
	if errors.Is(err, pgx.ErrNoRows) || isInvalidInput(err) {
		return fiber.NewError(fiber.StatusNotFound, "Kursus tidak ditemukan")
	} else if err != nil {
		return err
	}
	return c.JSON(fiber.Map{"status": "success", "data": course})
}

// CreateVoucher — FR-12, FR-91: super_admin membuat kode voucher diskon.
func (h *Handler) CreateVoucher(c *fiber.Ctx) error {
	var req struct {
		Code          string   `json:"code"`
		DiscountType  string   `json:"discount_type"` // percentage | fixed
		DiscountValue float64  `json:"discount_value"`
		MaxDiscount   *float64 `json:"max_discount"`
		MinPurchase   float64  `json:"min_purchase"`
		UsageLimit    *int     `json:"usage_limit"`
		ExpiresAt     *string  `json:"expires_at"` // RFC3339 opsional
	}
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Body request tidak valid")
	}
	req.Code = strings.ToUpper(strings.TrimSpace(req.Code))
	if len(req.Code) < 3 || len(req.Code) > 50 {
		return fiber.NewError(fiber.StatusBadRequest, "Kode voucher harus 3–50 karakter")
	}
	if req.DiscountType == "" {
		req.DiscountType = "percentage"
	}
	if req.DiscountType != "percentage" && req.DiscountType != "fixed" {
		return fiber.NewError(fiber.StatusBadRequest, "discount_type harus 'percentage' atau 'fixed'")
	}
	if req.DiscountValue <= 0 || (req.DiscountType == "percentage" && req.DiscountValue > 100) {
		return fiber.NewError(fiber.StatusBadRequest, "Nilai diskon tidak valid")
	}
	if req.MinPurchase < 0 {
		return fiber.NewError(fiber.StatusBadRequest, "min_purchase tidak boleh negatif")
	}

	var expiresAt *time.Time
	if req.ExpiresAt != nil && *req.ExpiresAt != "" {
		t, err := time.Parse(time.RFC3339, *req.ExpiresAt)
		if err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "Format expires_at harus RFC3339 (contoh: 2027-01-31T23:59:59Z)")
		}
		expiresAt = &t
	}

	cx, cancel := ctx(c)
	defer cancel()

	var v models.Voucher
	err := database.DB.QueryRow(cx,
		`INSERT INTO vouchers (code, discount_type, discount_value, max_discount, min_purchase, usage_limit, expires_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)
		 RETURNING id, code, discount_type::text, discount_value, max_discount, min_purchase, usage_limit, used_count, is_active, expires_at`,
		req.Code, req.DiscountType, req.DiscountValue, req.MaxDiscount, req.MinPurchase, req.UsageLimit, expiresAt,
	).Scan(&v.ID, &v.Code, &v.DiscountType, &v.DiscountValue, &v.MaxDiscount, &v.MinPurchase,
		&v.UsageLimit, &v.UsedCount, &v.IsActive, &v.ExpiresAt)
	if err != nil {
		if isUniqueViolation(err) {
			return fiber.NewError(fiber.StatusConflict, "Kode voucher sudah digunakan")
		}
		return err
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"status": "success", "data": v})
}

// CreateUserWithRole — FR-90: super_admin membuat akun baru dengan role tertentu secara langsung.
func (h *Handler) CreateUserWithRole(c *fiber.Ctx) error {
	var req struct {
		registerRequest
		Role string `json:"role"`
	}
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Body request tidak valid")
	}
	birth, err := req.validate()
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	if !validRoles[req.Role] {
		return fiber.NewError(fiber.StatusBadRequest, "Role tidak valid (student, internal_instructor, external_instructor, b2b_admin, curator, super_admin)")
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

	var u models.User
	err = database.DB.QueryRow(cx,
		`INSERT INTO users (email, password_hash, full_name, phone, role, birth_date, is_verified)
		 VALUES ($1, $2, $3, $4, $5::user_role, $6, TRUE)
		 RETURNING id, email, full_name, phone, role::text, birth_date, preferred_language, is_verified, created_at`,
		req.Email, string(hashed), req.FullName, phone, req.Role, birth,
	).Scan(&u.ID, &u.Email, &u.FullName, &u.Phone, &u.Role, &u.BirthDate, &u.PreferredLanguage, &u.IsVerified, &u.CreatedAt)
	if err != nil {
		if isUniqueViolation(err) {
			return fiber.NewError(fiber.StatusConflict, "Email sudah terdaftar")
		}
		return err
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"status":  "success",
		"message": "Pengguna dengan role " + u.Role + " berhasil dibuat",
		"data":    u,
	})
}

// UpdateUserRole — FR-90: super_admin mengubah role pengguna (mis. mengangkat instruktur / kurator).
func (h *Handler) UpdateUserRole(c *fiber.Ctx) error {
	targetID := c.Params("id")
	var req struct {
		Role string `json:"role"`
	}
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Body request tidak valid")
	}
	if !validRoles[req.Role] {
		return fiber.NewError(fiber.StatusBadRequest, "Role tidak valid")
	}

	cx, cancel := ctx(c)
	defer cancel()

	var u models.User
	err := database.DB.QueryRow(cx,
		`UPDATE users SET role = $2::user_role, updated_at = NOW()
		 WHERE id = $1
		 RETURNING id, email, full_name, phone, role::text, birth_date, preferred_language, is_verified, created_at`,
		targetID, req.Role,
	).Scan(&u.ID, &u.Email, &u.FullName, &u.Phone, &u.Role, &u.BirthDate, &u.PreferredLanguage, &u.IsVerified, &u.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) || isInvalidInput(err) {
		return fiber.NewError(fiber.StatusNotFound, "Pengguna tidak ditemukan")
	} else if err != nil {
		return err
	}
	return c.JSON(fiber.Map{"status": "success", "data": u})
}

// GetAdminOverview — FR-91, FR-92: analitik ringkas untuk Admin Panel
// (total pengguna, kursus terbit, total enrollment, completion rate, dan total pendapatan).
func (h *Handler) GetAdminOverview(c *fiber.Ctx) error {
	cx, cancel := ctx(c)
	defer cancel()

	var (
		totalUsers        int
		publishedCourses  int
		totalEnrollments  int
		completedEnroll   int
		totalRevenue      float64
		totalCertificates int
	)
	err := database.DB.QueryRow(cx, `
		SELECT
		  (SELECT COUNT(*) FROM users),
		  (SELECT COUNT(*) FROM courses WHERE status = 'published'),
		  (SELECT COUNT(*) FROM enrollments),
		  (SELECT COUNT(*) FROM enrollments WHERE is_completed = TRUE),
		  COALESCE((SELECT SUM(final_amount) FROM transactions WHERE status = 'paid'), 0),
		  (SELECT COUNT(*) FROM certificates)
	`).Scan(&totalUsers, &publishedCourses, &totalEnrollments, &completedEnroll, &totalRevenue, &totalCertificates)
	if err != nil {
		return err
	}

	completionRate := 0.0
	if totalEnrollments > 0 {
		completionRate = float64(completedEnroll) / float64(totalEnrollments) * 100
	}

	return c.JSON(fiber.Map{
		"status": "success",
		"data": fiber.Map{
			"total_users":        totalUsers,
			"published_courses":  publishedCourses,
			"total_enrollments":  totalEnrollments,
			"completed_courses":  completedEnroll,
			"completion_rate":    completionRate,
			"total_revenue":      totalRevenue,
			"total_certificates": totalCertificates,
		},
	})
}
