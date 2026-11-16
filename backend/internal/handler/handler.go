package handler

import (
	"context"
	"errors"
	"log"
	"time"

	"github.com/awmorecreative/sinau-backend/internal/config"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// Handler menampung dependensi bersama untuk seluruh HTTP handler.
type Handler struct {
	cfg *config.Config
}

func New(cfg *config.Config) *Handler {
	return &Handler{cfg: cfg}
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
