package handler

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"

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

// GetCategories — FR-20: daftar kategori kursus publik.
func (h *Handler) GetCategories(c *fiber.Ctx) error {
	cx, cancel := ctx(c)
	defer cancel()

	rows, err := h.db.Query(cx,
		`SELECT id, name, slug, description, created_at FROM categories ORDER BY name ASC`)
	if err != nil {
		return err
	}
	defer rows.Close()

	cats := make([]models.Category, 0)
	for rows.Next() {
		var cat models.Category
		if err := rows.Scan(&cat.ID, &cat.Name, &cat.Slug, &cat.Description, &cat.CreatedAt); err != nil {
			return err
		}
		cats = append(cats, cat)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	return c.JSON(fiber.Map{"status": "success", "data": cats})
}

// courseFilterParams menampung parameter filter katalog (FR-20).
type courseFilterParams struct {
	Search     string
	CategoryID int
	Level      string
	MinPrice   *float64
	MaxPrice   *float64
	MinRating  *float64
	Limit      int
	Offset     int
}

func buildCourseFilterQuery(p courseFilterParams) (string, []any, int, int, error) {
	conds := []string{"status = 'published'"}
	args := make([]any, 0, 8)
	nextArg := func(v any) string {
		args = append(args, v)
		return fmt.Sprintf("$%d", len(args))
	}

	if q := strings.TrimSpace(p.Search); q != "" {
		ph := nextArg("%" + q + "%")
		conds = append(conds, fmt.Sprintf("(title ILIKE %s OR COALESCE(subtitle, '') ILIKE %s)", ph, ph))
	}
	if p.CategoryID > 0 {
		conds = append(conds, "category_id = "+nextArg(p.CategoryID))
	}
	if p.Level != "" {
		if !validLevels[p.Level] {
			return "", nil, 0, 0, errors.New("Filter level tidak valid")
		}
		conds = append(conds, "level = "+nextArg(p.Level))
	}
	if p.MinPrice != nil {
		if *p.MinPrice < 0 {
			return "", nil, 0, 0, errors.New("min_price tidak boleh negatif")
		}
		conds = append(conds, "price >= "+nextArg(*p.MinPrice))
	}
	if p.MaxPrice != nil {
		if *p.MaxPrice < 0 {
			return "", nil, 0, 0, errors.New("max_price tidak boleh negatif")
		}
		conds = append(conds, "price <= "+nextArg(*p.MaxPrice))
	}
	if p.MinRating != nil {
		if *p.MinRating < 0 || *p.MinRating > 5 {
			return "", nil, 0, 0, errors.New("min_rating harus antara 0 dan 5")
		}
		conds = append(conds, "rating_avg >= "+nextArg(*p.MinRating))
	}

	limit := p.Limit
	if limit < 1 || limit > 100 {
		limit = 20
	}
	offset := p.Offset
	if offset < 0 {
		offset = 0
	}

	limitPH := nextArg(limit)
	offsetPH := nextArg(offset)
	sql := fmt.Sprintf(
		`SELECT %s FROM courses WHERE %s ORDER BY created_at DESC LIMIT %s OFFSET %s`,
		courseColumns, strings.Join(conds, " AND "), limitPH, offsetPH,
	)
	return sql, args, limit, offset, nil
}

func parseOptionalFloat(s string) (*float64, error) {
	if s == "" {
		return nil, nil
	}
	v, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return nil, err
	}
	return &v, nil
}

// GetCourses — FR-20: katalog publik dengan pencarian & filter (q, category_id, level, min_price, max_price, min_rating).
func (h *Handler) GetCourses(c *fiber.Ctx) error {
	minPrice, err := parseOptionalFloat(c.Query("min_price"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Parameter min_price tidak valid")
	}
	maxPrice, err := parseOptionalFloat(c.Query("max_price"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Parameter max_price tidak valid")
	}
	minRating, err := parseOptionalFloat(c.Query("min_rating"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Parameter min_rating tidak valid")
	}

	params := courseFilterParams{
		Search:     c.Query("q"),
		CategoryID: c.QueryInt("category_id", 0),
		Level:      c.Query("level"),
		MinPrice:   minPrice,
		MaxPrice:   maxPrice,
		MinRating:  minRating,
		Limit:      c.QueryInt("limit", 20),
		Offset:     c.QueryInt("offset", 0),
	}
	sql, args, limit, offset, err := buildCourseFilterQuery(params)
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}

	cx, cancel := ctx(c)
	defer cancel()

	rows, err := h.db.Query(cx, sql, args...)
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

// loadCourseCurricula memuat modul & pelajaran untuk sekumpulan course_id sekaligus
// tanpa memuat seluruh tabel di database.
func (h *Handler) loadCourseCurricula(cx context.Context, courseIDs []string, hidePaidContent bool) (map[string][]models.Module, error) {
	result := make(map[string][]models.Module, len(courseIDs))
	if len(courseIDs) == 0 {
		return result, nil
	}

	modRows, err := h.db.Query(cx,
		`SELECT id, course_id, title, order_index, created_at
		 FROM modules WHERE course_id = ANY($1::uuid[]) ORDER BY order_index ASC`, courseIDs)
	if err != nil {
		return nil, err
	}
	defer modRows.Close()

	type modRef struct {
		courseID string
		modPos   int
	}
	modMap := make(map[string]modRef)
	for modRows.Next() {
		var m models.Module
		if err := modRows.Scan(&m.ID, &m.CourseID, &m.Title, &m.OrderIndex, &m.CreatedAt); err != nil {
			return nil, err
		}
		m.Lessons = make([]models.Lesson, 0)
		pos := len(result[m.CourseID])
		result[m.CourseID] = append(result[m.CourseID], m)
		modMap[m.ID] = modRef{courseID: m.CourseID, modPos: pos}
	}
	if err := modRows.Err(); err != nil {
		return nil, err
	}

	if len(modMap) == 0 {
		return result, nil
	}

	lesRows, err := h.db.Query(cx,
		`SELECT l.id, l.module_id, l.title, l.lesson_type::text, l.content_url,
		        l.duration_seconds, l.order_index, l.is_free_preview, l.created_at
		 FROM lessons l JOIN modules m ON m.id = l.module_id
		 WHERE m.course_id = ANY($1::uuid[]) ORDER BY l.order_index ASC`, courseIDs)
	if err != nil {
		return nil, err
	}
	defer lesRows.Close()

	for lesRows.Next() {
		var l models.Lesson
		if err := scanLesson(lesRows, &l); err != nil {
			return nil, err
		}
		if hidePaidContent {
			if !l.IsFreePreview {
				l.ContentURL = nil // sembunyikan URL materi berbayar di endpoint katalog publik
			} else {
				l.ContentURL = h.rewriteLessonStreamURL(l.ID, "", true, l.ContentURL)
			}
		}
		if ref, ok := modMap[l.ModuleID]; ok {
			mods := result[ref.courseID]
			mods[ref.modPos].Lessons = append(mods[ref.modPos].Lessons, l)
		}
	}
	if err := lesRows.Err(); err != nil {
		return nil, err
	}
	return result, nil
}

// GetCourseDetail — detail kursus publik beserta daftar modul & pelajaran (silabus).
// content_url pelajaran disembunyikan kecuali is_free_preview = true.
func (h *Handler) GetCourseDetail(c *fiber.Ctx) error {
	cx, cancel := ctx(c)
	defer cancel()

	var course models.Course
	err := scanCourse(h.db.QueryRow(cx,
		`SELECT `+courseColumns+` FROM courses WHERE id = $1 AND status = 'published'`, c.Params("id")), &course)
	if isNotFound(err) {
		return fiber.NewError(fiber.StatusNotFound, "Kursus tidak ditemukan")
	} else if err != nil {
		return err
	}

	curricula, err := h.loadCourseCurricula(cx, []string{course.ID}, true)
	if err != nil {
		return err
	}
	modules := curricula[course.ID]
	if modules == nil {
		modules = make([]models.Module, 0)
	}

	return c.JSON(fiber.Map{
		"status": "success",
		"data": fiber.Map{
			"course":  course,
			"modules": modules,
		},
	})
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
	err := scanCourse(h.db.QueryRow(cx,
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
