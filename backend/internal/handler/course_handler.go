package handler

import (
	"context"

	"github.com/awmorecreative/sinau-backend/internal/database"
	"github.com/awmorecreative/sinau-backend/internal/models"
	"github.com/gofiber/fiber/v2"
)

func GetCourses(c *fiber.Ctx) error {
	rows, err := database.DB.Query(context.Background(), `SELECT id, instructor_id, category_id, title, slug, subtitle, description, thumbnail_url, price, level, status, rating_avg, total_reviews, created_at FROM courses WHERE status = 'published'`)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch courses"})
	}
	defer rows.Close()

	var courses []models.Course
	for rows.Next() {
		var course models.Course
		if err := rows.Scan(&course.ID, &course.InstructorID, &course.CategoryID, &course.Title, &course.Slug, &course.Subtitle, &course.Description, &course.ThumbnailURL, &course.Price, &course.Level, &course.Status, &course.RatingAvg, &course.TotalReviews, &course.CreatedAt); err != nil {
			continue
		}
		courses = append(courses, course)
	}

	return c.JSON(fiber.Map{
		"status": "success",
		"data":   courses,
	})
}

func GetCourseDetail(c *fiber.Ctx) error {
	id := c.Params("id")
	var course models.Course
	err := database.DB.QueryRow(context.Background(), `SELECT id, instructor_id, category_id, title, slug, subtitle, description, thumbnail_url, price, level, status, rating_avg, total_reviews, created_at FROM courses WHERE id = $1`, id).
		Scan(&course.ID, &course.InstructorID, &course.CategoryID, &course.Title, &course.Slug, &course.Subtitle, &course.Description, &course.ThumbnailURL, &course.Price, &course.Level, &course.Status, &course.RatingAvg, &course.TotalReviews, &course.CreatedAt)

	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Course not found"})
	}

	return c.JSON(fiber.Map{
		"status": "success",
		"data":   course,
	})
}

func CreateCourse(c *fiber.Ctx) error {
	var course models.Course
	if err := c.BodyParser(&course); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	query := `INSERT INTO courses (instructor_id, category_id, title, slug, subtitle, description, thumbnail_url, price, level, status)
	          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`

	err := database.DB.QueryRow(context.Background(), query,
		course.InstructorID, course.CategoryID, course.Title, course.Slug, course.Subtitle,
		course.Description, course.ThumbnailURL, course.Price, course.Level, "published",
	).Scan(&course.ID)

	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Failed to create course: " + err.Error()})
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"status": "success",
		"data":   course,
	})
}
