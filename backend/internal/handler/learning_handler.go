package handler

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strings"

	"github.com/awmorecreative/sinau-backend/internal/database"
	"github.com/awmorecreative/sinau-backend/internal/middleware"
	"github.com/awmorecreative/sinau-backend/internal/models"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
)

// calculateProgressPercentage menghitung persentase penyelesaian kursus (0..100, 2 desimal).
func calculateProgressPercentage(completedLessons, totalLessons int) (float64, bool) {
	if totalLessons <= 0 {
		return 0, false
	}
	if completedLessons >= totalLessons {
		return 100.00, true
	}
	if completedLessons <= 0 {
		return 0, false
	}
	pct := math.Round((float64(completedLessons)/float64(totalLessons))*10000) / 100
	return pct, false
}

// gradeQuizSubmission menghitung skor (0..100) dari jawaban pelajar terhadap daftar soal.
func gradeQuizSubmission(questions []models.QuizQuestion, answers map[string]string, passingScore int) (int, bool) {
	if len(questions) == 0 {
		return 0, false
	}
	totalPoints := 0
	earnedPoints := 0
	for _, q := range questions {
		pts := q.Points
		if pts <= 0 {
			pts = 10
		}
		totalPoints += pts
		submitted := strings.TrimSpace(answers[q.ID])
		expected := strings.TrimSpace(q.CorrectAnswer)
		if submitted != "" && strings.EqualFold(submitted, expected) {
			earnedPoints += pts
		}
	}
	if totalPoints == 0 {
		return 0, false
	}
	score := int(math.Round((float64(earnedPoints) / float64(totalPoints)) * 100))
	return score, score >= passingScore
}

// GetMyEnrollments — FR-30: daftar kursus yang telah dibeli oleh pelajar beserta progresnya.
func (h *Handler) GetMyEnrollments(c *fiber.Ctx) error {
	cx, cancel := ctx(c)
	defer cancel()

	rows, err := database.DB.Query(cx,
		`SELECT e.id, e.user_id, e.course_id, c.title, c.thumbnail_url,
		        e.progress_percentage, e.is_completed, e.completed_at, e.enrolled_at
		 FROM enrollments e JOIN courses c ON c.id = e.course_id
		 WHERE e.user_id = $1 ORDER BY e.enrolled_at DESC`, middleware.UserID(c))
	if err != nil {
		return err
	}
	defer rows.Close()

	list := make([]models.Enrollment, 0)
	for rows.Next() {
		var e models.Enrollment
		if err := rows.Scan(&e.ID, &e.UserID, &e.CourseID, &e.CourseTitle, &e.ThumbnailURL,
			&e.ProgressPercentage, &e.IsCompleted, &e.CompletedAt, &e.EnrolledAt); err != nil {
			return err
		}
		list = append(list, e)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	return c.JSON(fiber.Map{"status": "success", "data": list})
}

// UpdateLessonProgress — FR-30: menyimpan posisi detik terakhir & status selesai pelajaran,
// lalu menghitung ulang progress kursus dan menerbitkan sertifikat jika 100% selesai (FR-34).
func (h *Handler) UpdateLessonProgress(c *fiber.Ctx) error {
	lessonID := c.Params("id")
	userID := middleware.UserID(c)

	var req struct {
		IsCompleted         bool `json:"is_completed"`
		LastPositionSeconds int  `json:"last_position_seconds"`
	}
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Body request tidak valid")
	}
	if req.LastPositionSeconds < 0 {
		return fiber.NewError(fiber.StatusBadRequest, "last_position_seconds tidak boleh negatif")
	}

	cx, cancel := ctx(c)
	defer cancel()

	var courseID string
	err := database.DB.QueryRow(cx,
		`SELECT m.course_id FROM lessons l JOIN modules m ON m.id = l.module_id WHERE l.id = $1`, lessonID,
	).Scan(&courseID)
	if errors.Is(err, pgx.ErrNoRows) || isInvalidInput(err) {
		return fiber.NewError(fiber.StatusNotFound, "Pelajaran tidak ditemukan")
	} else if err != nil {
		return err
	}

	var enrolled bool
	if err := database.DB.QueryRow(cx,
		`SELECT EXISTS (SELECT 1 FROM enrollments WHERE user_id = $1 AND course_id = $2)`,
		userID, courseID).Scan(&enrolled); err != nil {
		return err
	}
	if !enrolled {
		return fiber.NewError(fiber.StatusForbidden, "Anda belum terdaftar di kursus ini")
	}

	var (
		progressPct float64
		isCompleted bool
		certCode    *string
	)
	err = pgx.BeginFunc(cx, database.DB, func(tx pgx.Tx) error {
		if _, err := tx.Exec(cx,
			`INSERT INTO lesson_progress (user_id, lesson_id, is_completed, last_position_seconds, updated_at)
			 VALUES ($1, $2, $3, $4, NOW())
			 ON CONFLICT (user_id, lesson_id)
			 DO UPDATE SET
			   is_completed = lesson_progress.is_completed OR EXCLUDED.is_completed,
			   last_position_seconds = EXCLUDED.last_position_seconds,
			   updated_at = NOW()`,
			userID, lessonID, req.IsCompleted, req.LastPositionSeconds,
		); err != nil {
			return err
		}

		var err error
		progressPct, isCompleted, certCode, err = recalculateCourseEnrollment(cx, tx, userID, courseID)
		return err
	})
	if err != nil {
		return err
	}

	resp := fiber.Map{
		"status":              "success",
		"course_id":           courseID,
		"progress_percentage": progressPct,
		"is_completed":        isCompleted,
	}
	if certCode != nil {
		resp["certificate_code"] = *certCode
	}
	return c.JSON(resp)
}

func recalculateCourseEnrollment(cx context.Context, tx pgx.Tx, userID, courseID string) (float64, bool, *string, error) {
	var totalLessons, completedLessons int
	err := tx.QueryRow(cx,
		`SELECT
		   COUNT(l.id),
		   COUNT(lp.id) FILTER (WHERE lp.is_completed = TRUE)
		 FROM lessons l
		 JOIN modules m ON m.id = l.module_id
		 LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.user_id = $1
		 WHERE m.course_id = $2`,
		userID, courseID,
	).Scan(&totalLessons, &completedLessons)
	if err != nil {
		return 0, false, nil, err
	}

	pct, completed := calculateProgressPercentage(completedLessons, totalLessons)
	if _, err := tx.Exec(cx,
		`UPDATE enrollments SET
		   progress_percentage = $3,
		   is_completed = enrollments.is_completed OR $4,
		   completed_at = CASE WHEN (enrollments.is_completed OR $4) AND completed_at IS NULL THEN NOW() ELSE completed_at END
		 WHERE user_id = $1 AND course_id = $2`,
		userID, courseID, pct, completed,
	); err != nil {
		return 0, false, nil, err
	}

	if !completed {
		return pct, false, nil, nil
	}

	// FR-34: Terbitkan sertifikat otomatis jika kursus sudah 100% selesai.
	code, err := ensureCertificateIssued(cx, tx, userID, courseID)
	if err != nil {
		return 0, false, nil, err
	}
	return pct, true, &code, nil
}

func ensureCertificateIssued(cx context.Context, tx pgx.Tx, userID, courseID string) (string, error) {
	var existing string
	err := tx.QueryRow(cx,
		`SELECT certificate_code FROM certificates WHERE user_id = $1 AND course_id = $2`,
		userID, courseID).Scan(&existing)
	if err == nil {
		return existing, nil
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return "", err
	}

	raw := make([]byte, 6)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	code := "CERT-SINAU-" + strings.ToUpper(hex.EncodeToString(raw))
	pdfURL := fmt.Sprintf("/api/v1/certificates/verify/%s", code)

	if _, err := tx.Exec(cx,
		`INSERT INTO certificates (user_id, course_id, certificate_code, pdf_url)
		 VALUES ($1, $2, $3, $4) ON CONFLICT (user_id, course_id) DO NOTHING`,
		userID, courseID, code, pdfURL); err != nil {
		return "", err
	}
	return code, nil
}

// CreateQuiz — FR-31, FR-32: instruktur membuat kuis beserta soal-soalnya pada suatu lesson bertipe quiz.
func (h *Handler) CreateQuiz(c *fiber.Ctx) error {
	lessonID := c.Params("id")
	var req struct {
		Title            string                `json:"title"`
		PassingScore     int                   `json:"passing_score"`
		TimeLimitMinutes int                   `json:"time_limit_minutes"`
		IsFinalExam      bool                  `json:"is_final_exam"`
		Questions        []models.QuizQuestion `json:"questions"`
	}
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Body request tidak valid")
	}
	req.Title = strings.TrimSpace(req.Title)
	if req.Title == "" {
		return fiber.NewError(fiber.StatusBadRequest, "Judul kuis wajib diisi")
	}
	if req.PassingScore <= 0 || req.PassingScore > 100 {
		req.PassingScore = 70
	}
	if len(req.Questions) == 0 {
		return fiber.NewError(fiber.StatusBadRequest, "Kuis harus memiliki minimal 1 soal")
	}

	cx, cancel := ctx(c)
	defer cancel()

	var courseID, lessonType string
	err := database.DB.QueryRow(cx,
		`SELECT m.course_id, l.lesson_type::text FROM lessons l JOIN modules m ON m.id = l.module_id WHERE l.id = $1`,
		lessonID).Scan(&courseID, &lessonType)
	if errors.Is(err, pgx.ErrNoRows) || isInvalidInput(err) {
		return fiber.NewError(fiber.StatusNotFound, "Pelajaran tidak ditemukan")
	} else if err != nil {
		return err
	}
	if lessonType != "quiz" {
		return fiber.NewError(fiber.StatusBadRequest, "Pelajaran ini bukan bertipe quiz")
	}
	if err := verifyCourseOwnership(cx, courseID, middleware.UserID(c), middleware.Role(c)); err != nil {
		return err
	}

	var quiz models.Quiz
	err = pgx.BeginFunc(cx, database.DB, func(tx pgx.Tx) error {
		if err := tx.QueryRow(cx,
			`INSERT INTO quizzes (lesson_id, title, passing_score, time_limit_minutes, is_final_exam)
			 VALUES ($1, $2, $3, $4, $5)
			 RETURNING id, lesson_id, title, passing_score, time_limit_minutes, is_final_exam`,
			lessonID, req.Title, req.PassingScore, req.TimeLimitMinutes, req.IsFinalExam,
		).Scan(&quiz.ID, &quiz.LessonID, &quiz.Title, &quiz.PassingScore, &quiz.TimeLimitMinutes, &quiz.IsFinalExam); err != nil {
			if isUniqueViolation(err) {
				return fiber.NewError(fiber.StatusConflict, "Kuis untuk pelajaran ini sudah ada")
			}
			return err
		}

		for i, q := range req.Questions {
			qType := q.QuestionType
			if qType == "" {
				qType = "multiple_choice"
			}
			pts := q.Points
			if pts <= 0 {
				pts = 10
			}
			optsJSON, err := json.Marshal(q.Options)
			if err != nil {
				return fiber.NewError(fiber.StatusBadRequest, "Format options soal tidak valid")
			}
			var saved models.QuizQuestion
			if err := tx.QueryRow(cx,
				`INSERT INTO quiz_questions (quiz_id, question_text, question_type, options, correct_answer, points, order_index)
				 VALUES ($1, $2, $3, $4, $5, $6, $7)
				 RETURNING id, quiz_id, question_text, question_type::text, points, order_index`,
				quiz.ID, strings.TrimSpace(q.QuestionText), qType, optsJSON, strings.TrimSpace(q.CorrectAnswer), pts, i+1,
			).Scan(&saved.ID, &saved.QuizID, &saved.QuestionText, &saved.QuestionType, &saved.Points, &saved.OrderIndex); err != nil {
				return err
			}
			saved.Options = q.Options
			quiz.Questions = append(quiz.Questions, saved)
		}
		return nil
	})
	if err != nil {
		return err
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"status": "success", "data": quiz})
}

// GetLessonQuiz — FR-31: mengambil daftar soal kuis (tanpa kunci jawaban) untuk dikerjakan pelajar.
func (h *Handler) GetLessonQuiz(c *fiber.Ctx) error {
	lessonID := c.Params("id")
	userID := middleware.UserID(c)

	cx, cancel := ctx(c)
	defer cancel()

	var quiz models.Quiz
	var courseID string
	err := database.DB.QueryRow(cx,
		`SELECT q.id, q.lesson_id, q.title, q.passing_score, q.time_limit_minutes, q.is_final_exam, m.course_id
		 FROM quizzes q
		 JOIN lessons l ON l.id = q.lesson_id
		 JOIN modules m ON m.id = l.module_id
		 WHERE q.lesson_id = $1`, lessonID,
	).Scan(&quiz.ID, &quiz.LessonID, &quiz.Title, &quiz.PassingScore, &quiz.TimeLimitMinutes, &quiz.IsFinalExam, &courseID)
	if errors.Is(err, pgx.ErrNoRows) || isInvalidInput(err) {
		return fiber.NewError(fiber.StatusNotFound, "Kuis tidak ditemukan")
	} else if err != nil {
		return err
	}

	var enrolled bool
	if err := database.DB.QueryRow(cx,
		`SELECT EXISTS (SELECT 1 FROM enrollments WHERE user_id = $1 AND course_id = $2)`,
		userID, courseID).Scan(&enrolled); err != nil {
		return err
	}
	if !enrolled && middleware.Role(c) != models.RoleSuperAdmin {
		return fiber.NewError(fiber.StatusForbidden, "Anda belum terdaftar di kursus ini")
	}

	qRows, err := database.DB.Query(cx,
		`SELECT id, quiz_id, question_text, question_type::text, options, points, order_index
		 FROM quiz_questions WHERE quiz_id = $1 ORDER BY order_index ASC`, quiz.ID)
	if err != nil {
		return err
	}
	defer qRows.Close()

	quiz.Questions = make([]models.QuizQuestion, 0)
	for qRows.Next() {
		var q models.QuizQuestion
		var optsRaw []byte
		if err := qRows.Scan(&q.ID, &q.QuizID, &q.QuestionText, &q.QuestionType, &optsRaw, &q.Points, &q.OrderIndex); err != nil {
			return err
		}
		_ = json.Unmarshal(optsRaw, &q.Options)
		quiz.Questions = append(quiz.Questions, q)
	}
	if err := qRows.Err(); err != nil {
		return err
	}

	return c.JSON(fiber.Map{"status": "success", "data": quiz})
}

// SubmitQuiz — FR-31, FR-32: pelajar mengirim jawaban kuis; sistem menilai otomatis.
// Jika lulus (score >= passing_score), pelajaran ditandai selesai dan progres kursus diperbarui.
func (h *Handler) SubmitQuiz(c *fiber.Ctx) error {
	quizID := c.Params("id")
	userID := middleware.UserID(c)

	var req struct {
		Answers map[string]string `json:"answers"` // map[question_id]jawaban
	}
	if err := c.BodyParser(&req); err != nil || len(req.Answers) == 0 {
		return fiber.NewError(fiber.StatusBadRequest, "Jawaban kuis wajib diisi")
	}

	cx, cancel := ctx(c)
	defer cancel()

	var (
		lessonID, courseID string
		passingScore       int
	)
	err := database.DB.QueryRow(cx,
		`SELECT q.lesson_id, q.passing_score, m.course_id
		 FROM quizzes q
		 JOIN lessons l ON l.id = q.lesson_id
		 JOIN modules m ON m.id = l.module_id
		 WHERE q.id = $1`, quizID,
	).Scan(&lessonID, &passingScore, &courseID)
	if errors.Is(err, pgx.ErrNoRows) || isInvalidInput(err) {
		return fiber.NewError(fiber.StatusNotFound, "Kuis tidak ditemukan")
	} else if err != nil {
		return err
	}

	var enrolled bool
	if err := database.DB.QueryRow(cx,
		`SELECT EXISTS (SELECT 1 FROM enrollments WHERE user_id = $1 AND course_id = $2)`,
		userID, courseID).Scan(&enrolled); err != nil {
		return err
	}
	if !enrolled {
		return fiber.NewError(fiber.StatusForbidden, "Anda belum terdaftar di kursus ini")
	}

	qRows, err := database.DB.Query(cx,
		`SELECT id, correct_answer, points FROM quiz_questions WHERE quiz_id = $1`, quizID)
	if err != nil {
		return err
	}
	defer qRows.Close()

	var questions []models.QuizQuestion
	for qRows.Next() {
		var q models.QuizQuestion
		if err := qRows.Scan(&q.ID, &q.CorrectAnswer, &q.Points); err != nil {
			return err
		}
		questions = append(questions, q)
	}
	if err := qRows.Err(); err != nil {
		return err
	}

	score, passed := gradeQuizSubmission(questions, req.Answers, passingScore)

	var attemptID string
	err = pgx.BeginFunc(cx, database.DB, func(tx pgx.Tx) error {
		if err := tx.QueryRow(cx,
			`INSERT INTO quiz_attempts (user_id, quiz_id, score, is_passed)
			 VALUES ($1, $2, $3, $4) RETURNING id`,
			userID, quizID, score, passed,
		).Scan(&attemptID); err != nil {
			return err
		}

		if passed {
			if _, err := tx.Exec(cx,
				`INSERT INTO lesson_progress (user_id, lesson_id, is_completed, updated_at)
				 VALUES ($1, $2, TRUE, NOW())
				 ON CONFLICT (user_id, lesson_id)
				 DO UPDATE SET is_completed = TRUE, updated_at = NOW()`,
				userID, lessonID); err != nil {
				return err
			}
			_, _, _, err := recalculateCourseEnrollment(cx, tx, userID, courseID)
			return err
		}
		return nil
	})
	if err != nil {
		return err
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"status":        "success",
		"attempt_id":    attemptID,
		"score":         score,
		"passing_score": passingScore,
		"is_passed":     passed,
	})
}

// GetMyCertificates — FR-34: daftar sertifikat milik pengguna yang sedang login.
func (h *Handler) GetMyCertificates(c *fiber.Ctx) error {
	cx, cancel := ctx(c)
	defer cancel()

	rows, err := database.DB.Query(cx,
		`SELECT cert.id, cert.user_id, u.full_name, cert.course_id, c.title,
		        cert.certificate_code, cert.pdf_url, cert.issued_at
		 FROM certificates cert
		 JOIN users u ON u.id = cert.user_id
		 JOIN courses c ON c.id = cert.course_id
		 WHERE cert.user_id = $1 ORDER BY cert.issued_at DESC`, middleware.UserID(c))
	if err != nil {
		return err
	}
	defer rows.Close()

	certs := make([]models.Certificate, 0)
	for rows.Next() {
		var cert models.Certificate
		if err := rows.Scan(&cert.ID, &cert.UserID, &cert.StudentName, &cert.CourseID, &cert.CourseTitle,
			&cert.CertificateCode, &cert.PDFURL, &cert.IssuedAt); err != nil {
			return err
		}
		certs = append(certs, cert)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	return c.JSON(fiber.Map{"status": "success", "data": certs})
}

// VerifyCertificate — FR-34: endpoint publik untuk memverifikasi keaslian kode/QR sertifikat.
func (h *Handler) VerifyCertificate(c *fiber.Ctx) error {
	code := strings.ToUpper(strings.TrimSpace(c.Params("code")))
	cx, cancel := ctx(c)
	defer cancel()

	var cert models.Certificate
	err := database.DB.QueryRow(cx,
		`SELECT cert.id, cert.user_id, u.full_name, cert.course_id, c.title,
		        cert.certificate_code, cert.pdf_url, cert.issued_at
		 FROM certificates cert
		 JOIN users u ON u.id = cert.user_id
		 JOIN courses c ON c.id = cert.course_id
		 WHERE cert.certificate_code = $1`, code,
	).Scan(&cert.ID, &cert.UserID, &cert.StudentName, &cert.CourseID, &cert.CourseTitle,
		&cert.CertificateCode, &cert.PDFURL, &cert.IssuedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return fiber.NewError(fiber.StatusNotFound, "Sertifikat tidak ditemukan atau tidak valid")
	} else if err != nil {
		return err
	}

	return c.JSON(fiber.Map{
		"status":   "success",
		"is_valid": true,
		"data":     cert,
	})
}
