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

type Category struct {
	ID          int       `json:"id"`
	Name        string    `json:"name"`
	Slug        string    `json:"slug"`
	Description *string   `json:"description"`
	CreatedAt   time.Time `json:"created_at"`
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

type Module struct {
	ID         string    `json:"id"`
	CourseID   string    `json:"course_id"`
	Title      string    `json:"title"`
	OrderIndex int       `json:"order_index"`
	Lessons    []Lesson  `json:"lessons,omitempty"`
	CreatedAt  time.Time `json:"created_at"`
}

type Lesson struct {
	ID              string    `json:"id"`
	ModuleID        string    `json:"module_id"`
	Title           string    `json:"title"`
	LessonType      string    `json:"lesson_type"`
	ContentURL      *string   `json:"content_url,omitempty"`
	DurationSeconds int       `json:"duration_seconds"`
	OrderIndex      int       `json:"order_index"`
	IsFreePreview   bool      `json:"is_free_preview"`
	CreatedAt       time.Time `json:"created_at"`
}

type CourseReview struct {
	ID        string    `json:"id"`
	UserID    string    `json:"user_id"`
	UserName  string    `json:"user_name,omitempty"`
	CourseID  string    `json:"course_id"`
	Rating    int       `json:"rating"`
	Comment   *string   `json:"comment"`
	CreatedAt time.Time `json:"created_at"`
}

type Voucher struct {
	ID            string     `json:"id"`
	Code          string     `json:"code"`
	DiscountType  string     `json:"discount_type"` // percentage | fixed
	DiscountValue float64    `json:"discount_value"`
	MaxDiscount   *float64   `json:"max_discount"`
	MinPurchase   float64    `json:"min_purchase"`
	UsageLimit    *int       `json:"usage_limit"`
	UsedCount     int        `json:"used_count"`
	IsActive      bool       `json:"is_active"`
	ExpiresAt     *time.Time `json:"expires_at"`
}

type Transaction struct {
	ID             string     `json:"id"`
	UserID         string     `json:"user_id"`
	CourseID       string     `json:"course_id"`
	VoucherID      *string    `json:"voucher_id,omitempty"`
	Amount         float64    `json:"amount"`
	Discount       float64    `json:"discount"`
	FinalAmount    float64    `json:"final_amount"`
	PaymentGateway string     `json:"payment_gateway"`
	Status         string     `json:"status"`
	ExternalTxID   string     `json:"external_transaction_id"`
	SnapToken      *string    `json:"snap_token,omitempty"`
	PaidAt         *time.Time `json:"paid_at,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
}

type Enrollment struct {
	ID                 string     `json:"id"`
	UserID             string     `json:"user_id"`
	CourseID           string     `json:"course_id"`
	CourseTitle        string     `json:"course_title,omitempty"`
	ThumbnailURL       *string    `json:"thumbnail_url,omitempty"`
	ProgressPercentage float64    `json:"progress_percentage"`
	IsCompleted        bool       `json:"is_completed"`
	CompletedAt        *time.Time `json:"completed_at,omitempty"`
	EnrolledAt         time.Time  `json:"enrolled_at"`
}

type Quiz struct {
	ID               string         `json:"id"`
	LessonID         string         `json:"lesson_id"`
	Title            string         `json:"title"`
	PassingScore     int            `json:"passing_score"`
	TimeLimitMinutes int            `json:"time_limit_minutes"`
	IsFinalExam      bool           `json:"is_final_exam"`
	Questions        []QuizQuestion `json:"questions,omitempty"`
}

type QuizQuestion struct {
	ID            string   `json:"id"`
	QuizID        string   `json:"quiz_id"`
	QuestionText  string   `json:"question_text"`
	QuestionType  string   `json:"question_type"`
	Options       []string `json:"options"`
	CorrectAnswer string   `json:"correct_answer,omitempty"` // disembunyikan saat dikirim ke pelajar
	Points        int      `json:"points"`
	OrderIndex    int      `json:"order_index"`
}

type Certificate struct {
	ID              string    `json:"id"`
	UserID          string    `json:"user_id"`
	StudentName     string    `json:"student_name,omitempty"`
	CourseID        string    `json:"course_id"`
	CourseTitle     string    `json:"course_title,omitempty"`
	CertificateCode string    `json:"certificate_code"`
	PDFURL          string    `json:"pdf_url"`
	IssuedAt        time.Time `json:"issued_at"`
}

type OfflineTokenRequest struct {
	LessonID          string `json:"lesson_id"`
	DeviceFingerprint string `json:"device_fingerprint"`
}
