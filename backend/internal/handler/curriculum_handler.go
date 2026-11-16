package handler

import (
	"context"
	"errors"
	"strings"

	"github.com/awmorecreative/sinau-backend/internal/database"
	"github.com/awmorecreative/sinau-backend/internal/middleware"
	"github.com/awmorecreative/sinau-backend/internal/models"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
)

var validLessonTypes = map[string]bool{
	"video":      true,
	"article":    true,
	"pdf":        true,
	"quiz":       true,
	"task":       true,
	"live_class": true,
}

// verifyCourseOwnership memastikan user adalah pemilik kursus atau super_admin.
func verifyCourseOwnership(cx context.Context, courseID, userID, role string) error {
	var instructorID *string
	err := database.DB.QueryRow(cx, `SELECT instructor_id FROM courses WHERE id = $1`, courseID).Scan(&instructorID)
	if errors.Is(err, pgx.ErrNoRows) || isInvalidInput(err) {
		return fiber.NewError(fiber.StatusNotFound, "Kursus tidak ditemukan")
	} else if err != nil {
		return err
	}
	if role != models.RoleSuperAdmin && (instructorID == nil || *instructorID != userID) {
		return fiber.NewError(fiber.StatusForbidden, "Anda bukan instruktur pemilik kursus ini")
	}
	return nil
}

// CreateModule — FR-21: menambahkan modul/bab ke dalam kursus.
func (h *Handler) CreateModule(c *fiber.Ctx) error {
	courseID := c.Params("id")
	var req struct {
		Title      string `json:"title"`
		OrderIndex int    `json:"order_index"`
	}
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Body request tidak valid")
	}
	req.Title = strings.TrimSpace(req.Title)
	if req.Title == "" || len(req.Title) > 255 {
		return fiber.NewError(fiber.StatusBadRequest, "Judul modul wajib diisi (maks. 255 karakter)")
	}
	if req.OrderIndex < 1 {
		req.OrderIndex = 1
	}

	cx, cancel := ctx(c)
	defer cancel()

	if err := verifyCourseOwnership(cx, courseID, middleware.UserID(c), middleware.Role(c)); err != nil {
		return err
	}

	var mod models.Module
	err := database.DB.QueryRow(cx,
		`INSERT INTO modules (course_id, title, order_index)
		 VALUES ($1, $2, $3) RETURNING id, course_id, title, order_index, created_at`,
		courseID, req.Title, req.OrderIndex,
	).Scan(&mod.ID, &mod.CourseID, &mod.Title, &mod.OrderIndex, &mod.CreatedAt)
	if err != nil {
		return err
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"status": "success", "data": mod})
}

// CreateLesson — FR-21, FR-22: menambahkan pelajaran ke dalam modul.
func (h *Handler) CreateLesson(c *fiber.Ctx) error {
	moduleID := c.Params("id")
	var req struct {
		Title           string  `json:"title"`
		LessonType      string  `json:"lesson_type"`
		ContentURL      *string `json:"content_url"`
		DurationSeconds int     `json:"duration_seconds"`
		OrderIndex      int     `json:"order_index"`
		IsFreePreview   bool    `json:"is_free_preview"`
	}
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Body request tidak valid")
	}
	req.Title = strings.TrimSpace(req.Title)
	if req.Title == "" || len(req.Title) > 255 {
		return fiber.NewError(fiber.StatusBadRequest, "Judul pelajaran wajib diisi (maks. 255 karakter)")
	}
	if !validLessonTypes[req.LessonType] {
		return fiber.NewError(fiber.StatusBadRequest, "lesson_type tidak valid (video, article, pdf, quiz, task, live_class)")
	}
	if req.DurationSeconds < 0 {
		return fiber.NewError(fiber.StatusBadRequest, "duration_seconds tidak boleh negatif")
	}
	if req.OrderIndex < 1 {
		req.OrderIndex = 1
	}

	cx, cancel := ctx(c)
	defer cancel()

	var courseID string
	err := database.DB.QueryRow(cx, `SELECT course_id FROM modules WHERE id = $1`, moduleID).Scan(&courseID)
	if errors.Is(err, pgx.ErrNoRows) || isInvalidInput(err) {
		return fiber.NewError(fiber.StatusNotFound, "Modul tidak ditemukan")
	} else if err != nil {
		return err
	}

	if err := verifyCourseOwnership(cx, courseID, middleware.UserID(c), middleware.Role(c)); err != nil {
		return err
	}

	var lesson models.Lesson
	err = database.DB.QueryRow(cx,
		`INSERT INTO lessons (module_id, title, lesson_type, content_url, duration_seconds, order_index, is_free_preview)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)
		 RETURNING id, module_id, title, lesson_type::text, content_url, duration_seconds, order_index, is_free_preview, created_at`,
		moduleID, req.Title, req.LessonType, req.ContentURL, req.DurationSeconds, req.OrderIndex, req.IsFreePreview,
	).Scan(&lesson.ID, &lesson.ModuleID, &lesson.Title, &lesson.LessonType, &lesson.ContentURL,
		&lesson.DurationSeconds, &lesson.OrderIndex, &lesson.IsFreePreview, &lesson.CreatedAt)
	if err != nil {
		return err
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"status": "success", "data": lesson})
}

// GetLessonDetail — FR-22, FR-25: mengambil detail pelajaran beserta content_url
// hanya jika user sudah membeli kursus (enrolled), instruktur pemilik, super_admin, atau is_free_preview.
func (h *Handler) GetLessonDetail(c *fiber.Ctx) error {
	lessonID := c.Params("id")
	userID := middleware.UserID(c)
	role := middleware.Role(c)

	cx, cancel := ctx(c)
	defer cancel()

	var (
		lesson       models.Lesson
		courseID     string
		instructorID *string
	)
	err := database.DB.QueryRow(cx,
		`SELECT l.id, l.module_id, l.title, l.lesson_type::text, l.content_url,
		        l.duration_seconds, l.order_index, l.is_free_preview, l.created_at,
		        c.id, c.instructor_id
		 FROM lessons l
		 JOIN modules m ON m.id = l.module_id
		 JOIN courses c ON c.id = m.course_id
		 WHERE l.id = $1`, lessonID,
	).Scan(&lesson.ID, &lesson.ModuleID, &lesson.Title, &lesson.LessonType, &lesson.ContentURL,
		&lesson.DurationSeconds, &lesson.OrderIndex, &lesson.IsFreePreview, &lesson.CreatedAt,
		&courseID, &instructorID)
	if errors.Is(err, pgx.ErrNoRows) || isInvalidInput(err) {
		return fiber.NewError(fiber.StatusNotFound, "Pelajaran tidak ditemukan")
	} else if err != nil {
		return err
	}

	hasAccess := lesson.IsFreePreview ||
		role == models.RoleSuperAdmin ||
		role == models.RoleCurator ||
		(instructorID != nil && *instructorID == userID)

	if !hasAccess {
		var enrolled bool
		if err := database.DB.QueryRow(cx,
			`SELECT EXISTS (SELECT 1 FROM enrollments WHERE user_id = $1 AND course_id = $2)`,
			userID, courseID).Scan(&enrolled); err != nil {
			return err
		}
		if !enrolled {
			return fiber.NewError(fiber.StatusForbidden, "Anda harus membeli kursus ini untuk mengakses pelajaran")
		}
	}

	return c.JSON(fiber.Map{"status": "success", "data": lesson})
}

// CreateOrUpdateReview — FR-26: ulasan & rating kursus (hanya untuk pelajar yang sudah enrolled).
func (h *Handler) CreateOrUpdateReview(c *fiber.Ctx) error {
	courseID := c.Params("id")
	userID := middleware.UserID(c)

	var req struct {
		Rating  int     `json:"rating"`
		Comment *string `json:"comment"`
	}
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Body request tidak valid")
	}
	if req.Rating < 1 || req.Rating > 5 {
		return fiber.NewError(fiber.StatusBadRequest, "Rating harus antara 1 sampai 5")
	}

	cx, cancel := ctx(c)
	defer cancel()

	var enrolled bool
	if err := database.DB.QueryRow(cx,
		`SELECT EXISTS (SELECT 1 FROM enrollments WHERE user_id = $1 AND course_id = $2)`,
		userID, courseID).Scan(&enrolled); err != nil {
		if isInvalidInput(err) {
			return fiber.NewError(fiber.StatusNotFound, "Kursus tidak ditemukan")
		}
		return err
	}
	if !enrolled {
		return fiber.NewError(fiber.StatusForbidden, "Hanya pelajar terdaftar yang dapat memberikan ulasan")
	}

	var rev models.CourseReview
	err := pgx.BeginFunc(cx, database.DB, func(tx pgx.Tx) error {
		if err := tx.QueryRow(cx,
			`INSERT INTO course_reviews (user_id, course_id, rating, comment)
			 VALUES ($1, $2, $3, $4)
			 ON CONFLICT (user_id, course_id)
			 DO UPDATE SET rating = EXCLUDED.rating, comment = EXCLUDED.comment, updated_at = NOW()
			 RETURNING id, user_id, course_id, rating, comment, created_at`,
			userID, courseID, req.Rating, req.Comment,
		).Scan(&rev.ID, &rev.UserID, &rev.CourseID, &rev.Rating, &rev.Comment, &rev.CreatedAt); err != nil {
			return err
		}

		_, err := tx.Exec(cx,
			`UPDATE courses SET
			   rating_avg = COALESCE((SELECT ROUND(AVG(rating)::numeric, 2) FROM course_reviews WHERE course_id = $1), 0),
			   total_reviews = (SELECT COUNT(*) FROM course_reviews WHERE course_id = $1),
			   updated_at = NOW()
			 WHERE id = $1`, courseID)
		return err
	})
	if err != nil {
		return err
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"status": "success", "data": rev})
}

// GetCourseReviews — FR-26: daftar ulasan kursus publik.
func (h *Handler) GetCourseReviews(c *fiber.Ctx) error {
	courseID := c.Params("id")
	cx, cancel := ctx(c)
	defer cancel()

	rows, err := database.DB.Query(cx,
		`SELECT r.id, r.user_id, u.full_name, r.course_id, r.rating, r.comment, r.created_at
		 FROM course_reviews r JOIN users u ON u.id = r.user_id
		 WHERE r.course_id = $1 ORDER BY r.created_at DESC LIMIT 50`, courseID)
	if err != nil {
		if isInvalidInput(err) {
			return fiber.NewError(fiber.StatusNotFound, "Kursus tidak ditemukan")
		}
		return err
	}
	defer rows.Close()

	reviews := make([]models.CourseReview, 0)
	for rows.Next() {
		var r models.CourseReview
		if err := rows.Scan(&r.ID, &r.UserID, &r.UserName, &r.CourseID, &r.Rating, &r.Comment, &r.CreatedAt); err != nil {
			return err
		}
		reviews = append(reviews, r)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	return c.JSON(fiber.Map{"status": "success", "data": reviews})
}
