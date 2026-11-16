package handler

import (
	"errors"
	"regexp"
	"strings"

	"github.com/awmorecreative/sinau-backend/internal/database"
	"github.com/awmorecreative/sinau-backend/internal/middleware"
	"github.com/awmorecreative/sinau-backend/internal/models"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
)

const courseColumns = `id, instructor_id, category_id, title, slug, subtitle, description,
	thumbnail_url, price, level, status, rating_avg, total_reviews, created_at`

var (
	slugPattern = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)
	validLevels = map[string]bool{"beginner": true, "intermediate": true, "advanced": true, "all_levels": true}
)

func scanCourse(row pgx.Row, course *models.Course) error {
	return row.Scan(&course.ID, &course.InstructorID, &course.CategoryID, &course.Title, &course.Slug,
		&course.Subtitle, &course.Description, &course.ThumbnailURL, &course.Price, &course.Level,
		&course.Status, &course.RatingAvg, &course.TotalReviews, &course.CreatedAt)
}

// GetCourses — katalog publik, hanya kursus berstatus published.
func (h *Handler) GetCourses(c *fiber.Ctx) error {
	limit := c.QueryInt("limit", 20)
	if limit < 1 || limit > 100 {
		limit = 20
	}
	offset := c.QueryInt("offset", 0)
	if offset < 0 {
		offset = 0
	}

	cx, cancel := ctx(c)
	defer cancel()

	rows, err := database.DB.Query(cx,
		`SELECT `+courseColumns+` FROM courses WHERE status = 'published'
		 ORDER BY created_at DESC LIMIT $1 OFFSET $2`, limit, offset)
	if err != nil {
		return err
	}
	defer rows.Close()

	courses := make([]models.Course, 0)
	for rows.Next() {
		var course models.Course
		if err := scanCourse(rows, &course); err != nil {
			return err
		}
		courses = append(courses, course)
	}
	if err := rows.Err(); err != nil {
		return err
	}

	return c.JSON(fiber.Map{
		"status": "success",
		"data":   courses,
		"meta":   fiber.Map{"limit": limit, "offset": offset},
	})
}

// GetCourseDetail — detail kursus publik (hanya yang sudah published).
func (h *Handler) GetCourseDetail(c *fiber.Ctx) error {
	cx, cancel := ctx(c)
	defer cancel()

	var course models.Course
	err := scanCourse(database.DB.QueryRow(cx,
		`SELECT `+courseColumns+` FROM courses WHERE id = $1 AND status = 'published'`, c.Params("id")), &course)
	if errors.Is(err, pgx.ErrNoRows) || isInvalidInput(err) {
		return fiber.NewError(fiber.StatusNotFound, "Kursus tidak ditemukan")
	} else if err != nil {
		return err
	}

	return c.JSON(fiber.Map{"status": "success", "data": course})
}

type createCourseRequest struct {
	CategoryID   *int    `json:"category_id"`
	Title        string  `json:"title"`
	Slug         string  `json:"slug"`
	Subtitle     *string `json:"subtitle"`
	Description  *string `json:"description"`
	ThumbnailURL *string `json:"thumbnail_url"`
	Price        float64 `json:"price"`
	Level        string  `json:"level"`
}

// CreateCourse — hanya instruktur & super admin. instructor_id diambil dari token.
// Kursus instruktur eksternal selalu dimulai sebagai draft dan wajib melalui
// review kurator (FR-72); kursus internal Sinau langsung terbit.
func (h *Handler) CreateCourse(c *fiber.Ctx) error {
	var req createCourseRequest
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Body request tidak valid")
	}

	req.Title = strings.TrimSpace(req.Title)
	req.Slug = strings.TrimSpace(req.Slug)
	if req.Level == "" {
		req.Level = "beginner"
	}
	switch {
	case req.Title == "" || len(req.Title) > 255:
		return fiber.NewError(fiber.StatusBadRequest, "Judul kursus wajib diisi (maks. 255 karakter)")
	case !slugPattern.MatchString(req.Slug) || len(req.Slug) > 255:
		return fiber.NewError(fiber.StatusBadRequest, "Slug hanya boleh huruf kecil, angka, dan tanda hubung")
	case req.Price < 0:
		return fiber.NewError(fiber.StatusBadRequest, "Harga tidak boleh negatif")
	case !validLevels[req.Level]:
		return fiber.NewError(fiber.StatusBadRequest, "Level tidak valid")
	}

	status := models.CourseDraft
	if r := middleware.Role(c); r == models.RoleInternalInstructor || r == models.RoleSuperAdmin {
		status = models.CoursePublished
	}

	cx, cancel := ctx(c)
	defer cancel()

	var course models.Course
	err := scanCourse(database.DB.QueryRow(cx,
		`INSERT INTO courses (instructor_id, category_id, title, slug, subtitle, description, thumbnail_url, price, level, status)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		 RETURNING `+courseColumns,
		middleware.UserID(c), req.CategoryID, req.Title, req.Slug, req.Subtitle,
		req.Description, req.ThumbnailURL, req.Price, req.Level, status,
	), &course)
	if err != nil {
		switch {
		case isUniqueViolation(err):
			return fiber.NewError(fiber.StatusConflict, "Slug sudah digunakan")
		case isForeignKeyViolation(err):
			return fiber.NewError(fiber.StatusBadRequest, "Kategori tidak ditemukan")
		}
		return err
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"status": "success", "data": course})
}
