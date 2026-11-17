package handler

import (
	"context"
	"errors"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/awmorecreative/sinau-backend/internal/config"
	"github.com/awmorecreative/sinau-backend/internal/models"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Handler menampung dependensi bersama untuk seluruh HTTP handler.
type Handler struct {
	cfg           *config.Config
	db            *pgxpool.Pool
	httpClient    *http.Client
	driveMu       sync.Mutex
	driveToken    string
	driveTokenExp time.Time
}

func New(cfg *config.Config, db *pgxpool.Pool) *Handler {
	return &Handler{
		cfg:        cfg,
		db:         db,
		httpClient: &http.Client{Timeout: 0}, // streaming video tidak dibatasi timeout pendek
	}
}

// dbExecutor dipenuhi oleh *pgxpool.Pool maupun pgx.Tx.
type dbExecutor interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// ctx membuat context dengan timeout untuk query database per request.
func ctx(c *fiber.Ctx) (context.Context, context.CancelFunc) {
	return context.WithTimeout(c.UserContext(), 10*time.Second)
}

// isEnrolled memeriksa apakah pengguna sudah terdaftar di suatu kursus.
func (h *Handler) isEnrolled(cx context.Context, userID, courseID string) (bool, error) {
	var enrolled bool
	err := h.db.QueryRow(cx,
		`SELECT EXISTS (SELECT 1 FROM enrollments WHERE user_id = $1 AND course_id = $2)`,
		userID, courseID).Scan(&enrolled)
	return enrolled, err
}

// canAccessCourseContent memeriksa apakah pengguna boleh mengakses materi berbayar
// (super_admin, curator, instruktur pemilik kursus, atau pelajar terdaftar).
func (h *Handler) canAccessCourseContent(cx context.Context, role, userID, courseID string, instructorID *string) (bool, error) {
	if role == models.RoleSuperAdmin || role == models.RoleCurator ||
		(instructorID != nil && *instructorID == userID) {
		return true, nil
	}
	return h.isEnrolled(cx, userID, courseID)
}

// isNotFound mendeteksi error tidak ditemukan (ErrNoRows atau format UUID tidak valid 22P02).
func isNotFound(err error) bool {
	return errors.Is(err, pgx.ErrNoRows) || isInvalidInput(err)
}

// isUniqueViolation mendeteksi error PostgreSQL 23505 (unique_violation).
func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}

// isForeignKeyViolation mendeteksi error PostgreSQL 23503 (foreign_key_violation).
func isForeignKeyViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23503"
}

// isInvalidInput mendeteksi error input tidak valid (mis. format UUID salah, 22P02).
func isInvalidInput(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "22P02"
}

// ErrorHandler mengubah seluruh error menjadi respons JSON yang konsisten
// tanpa membocorkan detail internal.
func ErrorHandler(c *fiber.Ctx, err error) error {
	code := fiber.StatusInternalServerError
	msg := "Terjadi kesalahan pada server"

	var fe *fiber.Error
	if errors.As(err, &fe) {
		code = fe.Code
		msg = fe.Message
	} else {
		log.Printf("ERROR %s %s: %v", c.Method(), c.Path(), err)
	}
	return c.Status(code).JSON(fiber.Map{"status": "error", "error": msg})
}
