package models

import (
	"time"
)

// Role pengguna (sesuai enum user_role di database).
const (
	RoleStudent            = "student"
	RoleInternalInstructor = "internal_instructor"
	RoleExternalInstructor = "external_instructor"
	RoleB2BAdmin           = "b2b_admin"
	RoleCurator            = "curator"
	RoleSuperAdmin         = "super_admin"
)

// Status kursus (alur review FR-72).
const (
	CourseDraft     = "draft"
	CourseSubmitted = "submitted"
	CourseReviewing = "reviewing"
	CoursePublished = "published"
	CourseRejected  = "rejected"
)

type User struct {
	ID                string     `json:"id"`
	Email             string     `json:"email"`
	PasswordHash      string     `json:"-"`
	FullName          string     `json:"full_name"`
	Phone             *string    `json:"phone"`
	Role              string     `json:"role"`
	BirthDate         *time.Time `json:"birth_date"`
	PreferredLanguage string     `json:"preferred_language"`
	IsVerified        bool       `json:"is_verified"`
	CreatedAt         time.Time  `json:"created_at"`
}

type Course struct {
	ID           string    `json:"id"`
	InstructorID *string   `json:"instructor_id"`
	CategoryID   *int      `json:"category_id"`
	Title        string    `json:"title"`
	Slug         string    `json:"slug"`
	Subtitle     *string   `json:"subtitle"`
	Description  *string   `json:"description"`
	ThumbnailURL *string   `json:"thumbnail_url"`
	Price        float64   `json:"price"`
	Level        string    `json:"level"`
	Status       string    `json:"status"`
	RatingAvg    float64   `json:"rating_avg"`
	TotalReviews int       `json:"total_reviews"`
	CreatedAt    time.Time `json:"created_at"`
}

type Transaction struct {
	ID             string     `json:"id"`
	UserID         string     `json:"user_id"`
	CourseID       string     `json:"course_id"`
	Amount         float64    `json:"amount"`
	FinalAmount    float64    `json:"final_amount"`
	PaymentGateway string     `json:"payment_gateway"`
	Status         string     `json:"status"`
	ExternalTxID   string     `json:"external_transaction_id"`
	SnapToken      *string    `json:"snap_token,omitempty"`
	PaidAt         *time.Time `json:"paid_at,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
}

type OfflineTokenRequest struct {
	LessonID          string `json:"lesson_id"`
	DeviceFingerprint string `json:"device_fingerprint"`
}
