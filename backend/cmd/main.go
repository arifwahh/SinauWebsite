package main

import (
	"log"
	"os"

	"github.com/awmorecreative/sinau-backend/internal/database"
	"github.com/awmorecreative/sinau-backend/internal/handler"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"
)

func main() {
	// Initialize database connection
	database.ConnectDB()

	app := fiber.New(fiber.Config{
		AppName: "Sinau API Server v0.2",
	})

	// Middlewares
	app.Use(logger.New())
	app.Use(recover.New())

	// API Versioning Group
	api := app.Group("/api/v1")

	// Health check
	api.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"status":  "success",
			"message": "Sinau Backend API is running smoothly",
		})
	})

	// Auth Routes
	api.Post("/auth/register", handler.Register)
	api.Post("/auth/login", handler.Login)

	// Course Routes (Standalone Purchase Model)
	api.Get("/courses", handler.GetCourses)
	api.Get("/courses/:id", handler.GetCourseDetail)
	api.Post("/courses", handler.CreateCourse) // Protected in real impl

	// Payment / Transaction Routes (Midtrans / Xendit integration)
	api.Post("/transactions/buy", handler.CreateTransaction)
	api.Post("/webhook/payment", handler.PaymentWebhook)

	// Offline Encrypted Video Download (FR-24)
	api.Post("/offline/token", handler.GenerateOfflineToken)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Sinau Backend starting on port %s...", port)
	log.Fatal(app.Listen(":" + port))
}
