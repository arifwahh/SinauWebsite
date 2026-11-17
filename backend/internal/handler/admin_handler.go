package handler

import (
	"strings"
	"time"

	"github.com/awmorecreative/sinau-backend/internal/middleware"
	"github.com/awmorecreative/sinau-backend/internal/models"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
)

const voucherColumns = `id, code, discount_type::text, discount_value, max_discount, min_purchase, usage_limit, used_count, is_active, expires_at`

func scanVoucher(row pgx.Row, v *models.Voucher) error {
	return row.Scan(&v.ID, &v.Code, &v.DiscountType, &v.DiscountValue, &v.MaxDiscount,
		&v.MinPurchase, &v.UsageLimit, &v.UsedCount, &v.IsActive, &v.ExpiresAt)
}

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
	err := h.db.QueryRow(cx,
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
	err := scanCourse(h.db.QueryRow(cx,
		`UPDATE courses SET status = $2::course_status, updated_at = NOW()
		 WHERE id = $1 RETURNING `+courseColumns, courseID, req.Status,
	), &course)
	if isNotFound(err) {
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
	err := scanVoucher(h.db.QueryRow(cx,
		`INSERT INTO vouchers (code, discount_type, discount_value, max_discount, min_purchase, usage_limit, expires_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)
		 RETURNING `+voucherColumns,
		req.Code, req.DiscountType, req.DiscountValue, req.MaxDiscount, req.MinPurchase, req.UsageLimit, expiresAt,
	), &v)
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
	if !validRoles[req.Role] {
		return fiber.NewError(fiber.StatusBadRequest, "Role tidak valid (student, internal_instructor, external_instructor, b2b_admin, curator, super_admin)")
	}

	cx, cancel := ctx(c)
	defer cancel()

	u, err := h.createUser(cx, req.registerRequest, req.Role, true)
	if err != nil {
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
	if targetID == middleware.UserID(c) && req.Role != models.RoleSuperAdmin {
		return fiber.NewError(fiber.StatusBadRequest, "Tidak dapat menurunkan role akun sendiri")
	}

	cx, cancel := ctx(c)
	defer cancel()

	var u models.User
	err := scanUser(h.db.QueryRow(cx,
		`UPDATE users SET role = $2::user_role, updated_at = NOW()
		 WHERE id = $1
		 RETURNING `+userColumns,
		targetID, req.Role,
	), &u)
	if isNotFound(err) {
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
	err := h.db.QueryRow(cx, `
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

// GetAdminCourses — daftar kursus beserta modul & pelajaran untuk Instruktur (milik sendiri), Kurator, dan Super Admin.
func (h *Handler) GetAdminCourses(c *fiber.Ctx) error {
	cx, cancel := ctx(c)
	defer cancel()

	role := middleware.Role(c)
	var (
		rows pgx.Rows
		err  error
	)
	if role == models.RoleCurator || role == models.RoleSuperAdmin {
		rows, err = h.db.Query(cx,
			`SELECT `+courseColumns+` FROM courses ORDER BY created_at DESC LIMIT 100`)
	} else {
		rows, err = h.db.Query(cx,
			`SELECT `+courseColumns+` FROM courses WHERE instructor_id = $1 ORDER BY created_at DESC LIMIT 100`,
			middleware.UserID(c))
	}
	if err != nil {
		return err
	}
	defer rows.Close()

	type courseWithCurriculum struct {
		models.Course
		Modules []models.Module `json:"modules"`
	}

	courses := make([]courseWithCurriculum, 0)
	courseIDs := make([]string, 0)
	for rows.Next() {
		var item courseWithCurriculum
		if err := scanCourse(rows, &item.Course); err != nil {
			return err
		}
		item.Modules = make([]models.Module, 0)
		courseIDs = append(courseIDs, item.ID)
		courses = append(courses, item)
	}
	if err := rows.Err(); err != nil {
		return err
	}

	curricula, err := h.loadCourseCurricula(cx, courseIDs, false)
	if err != nil {
		return err
	}
	for i := range courses {
		if mods, ok := curricula[courses[i].ID]; ok {
			courses[i].Modules = mods
		}
	}

	return c.JSON(fiber.Map{"status": "success", "data": courses})
}

// GetAdminUsers — daftar pengguna untuk Super Admin.
func (h *Handler) GetAdminUsers(c *fiber.Ctx) error {
	cx, cancel := ctx(c)
	defer cancel()

	rows, err := h.db.Query(cx,
		`SELECT `+userColumns+` FROM users ORDER BY created_at DESC LIMIT 100`)
	if err != nil {
		return err
	}
	defer rows.Close()

	users := make([]models.User, 0)
	for rows.Next() {
		var u models.User
		if err := scanUser(rows, &u); err != nil {
			return err
		}
		users = append(users, u)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	return c.JSON(fiber.Map{"status": "success", "data": users})
}

// GetAdminVouchers — daftar voucher diskon untuk Super Admin.
func (h *Handler) GetAdminVouchers(c *fiber.Ctx) error {
	cx, cancel := ctx(c)
	defer cancel()

	rows, err := h.db.Query(cx,
		`SELECT `+voucherColumns+` FROM vouchers ORDER BY created_at DESC LIMIT 100`)
	if err != nil {
		return err
	}
	defer rows.Close()

	vouchers := make([]models.Voucher, 0)
	for rows.Next() {
		var v models.Voucher
		if err := scanVoucher(rows, &v); err != nil {
			return err
		}
		vouchers = append(vouchers, v)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	return c.JSON(fiber.Map{"status": "success", "data": vouchers})
}
