package main

import (
	"log"
	"time"

	"github.com/awmorecreative/sinau-backend/internal/config"
	"github.com/awmorecreative/sinau-backend/internal/database"
	"github.com/awmorecreative/sinau-backend/internal/handler"
	"github.com/awmorecreative/sinau-backend/internal/middleware"
	"github.com/awmorecreative/sinau-backend/internal/models"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/limiter"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"
)

func main() {
	cfg := config.Load()
	database.ConnectDB(cfg.DSN())
	defer database.DB.Close()

	h := handler.New(cfg)

	app := fiber.New(fiber.Config{
		AppName:      "Sinau API Server v0.2",
		ErrorHandler: handler.ErrorHandler,
		BodyLimit:    1 * 1024 * 1024, // 1 MB untuk JSON API
	})

	app.Use(recover.New())
	app.Use(logger.New())
	app.Use(cors.New(cors.Config{
		AllowOrigins: cfg.CORSAllowOrigins,
		AllowHeaders: "Origin, Content-Type, Accept, Authorization",
		AllowMethods: "GET,POST,PUT,PATCH,DELETE,OPTIONS",
	}))

	api := app.Group("/api/v1")

	api.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "success", "message": "Sinau Backend API is running"})
	})

	auth := middleware.RequireAuth(cfg.JWTSecret)

	// Auth — rate limit untuk mencegah brute force
	authLimiter := limiter.New(limiter.Config{Max: 10, Expiration: time.Minute})
	api.Post("/auth/register", authLimiter, h.Register)
	api.Post("/auth/login", authLimiter, h.Login)
	api.Post("/auth/refresh", authLimiter, h.Refresh)
	api.Post("/auth/logout", auth, h.Logout)
	api.Get("/auth/me", auth, h.Me)

	// Kursus (pembelian satuan)
	api.Get("/courses", h.GetCourses)
	api.Get("/courses/:id", h.GetCourseDetail)
	api.Post("/courses", auth,
		middleware.RequireRoles(models.RoleInternalInstructor, models.RoleExternalInstructor, models.RoleSuperAdmin),
		h.CreateCourse)

	// Transaksi
	api.Post("/transactions", auth, h.CreateTransaction)
	api.Get("/transactions", auth, h.GetMyTransactions)

	// Webhook payment gateway (diverifikasi signature/token, tanpa JWT)
	api.Post("/webhooks/midtrans", h.MidtransWebhook)
	api.Post("/webhooks/xendit", h.XenditWebhook)

	// Download offline terenkripsi (FR-24)
	api.Post("/offline/token", auth, h.GenerateOfflineToken)

	log.Printf("Sinau Backend berjalan di port %s", cfg.Port)
	log.Fatal(app.Listen(":" + cfg.Port))
}
