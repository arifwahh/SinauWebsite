-- Sinau E-Learning Database Schema (PostgreSQL)
-- Sesuai SRS v0.2 (16 November 2026)

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enums
CREATE TYPE user_role AS ENUM ('student', 'internal_instructor', 'external_instructor', 'b2b_admin', 'curator', 'super_admin');
CREATE TYPE course_level AS ENUM ('beginner', 'intermediate', 'advanced', 'all_levels');
CREATE TYPE lesson_type AS ENUM ('video', 'article', 'pdf', 'quiz', 'task', 'live_class');
CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'failed', 'expired', 'refunded');
CREATE TYPE course_status AS ENUM ('draft', 'submitted', 'reviewing', 'published', 'rejected');

-- Users Table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    role user_role NOT NULL DEFAULT 'student',
    avatar_url TEXT,
    birth_date DATE NOT NULL, -- NFR-06: verifikasi usia minimal 13 tahun
    preferred_language VARCHAR(2) NOT NULL DEFAULT 'id' CHECK (preferred_language IN ('id', 'en')), -- FR-04
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Refresh Tokens (NFR-05: JWT + refresh token). Disimpan sebagai hash SHA-256.
CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash CHAR(64) UNIQUE NOT NULL,
    user_agent VARCHAR(255),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);

-- Categories Table
CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Courses Table (Semua kursus dijual satuan / standalone)
CREATE TABLE courses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    instructor_id UUID REFERENCES users(id) ON DELETE CASCADE,
    category_id INT REFERENCES categories(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    subtitle VARCHAR(255),
    description TEXT,
    thumbnail_url TEXT,
    price DECIMAL(12, 2) NOT NULL DEFAULT 0.00 CHECK (price >= 0),
    level course_level NOT NULL DEFAULT 'beginner',
    status course_status NOT NULL DEFAULT 'draft',
    rating_avg DECIMAL(3, 2) NOT NULL DEFAULT 0.00,
    total_reviews INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Modules / Chapters Table
CREATE TABLE modules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    order_index INT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Lessons Table
CREATE TABLE lessons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    module_id UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    lesson_type lesson_type NOT NULL,
    content_url TEXT, -- Video HLS URL, PDF URL, or Article body
    duration_seconds INT NOT NULL DEFAULT 0,
    order_index INT NOT NULL,
    is_free_preview BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_modules_course ON modules(course_id, order_index);
CREATE INDEX idx_lessons_module ON lessons(module_id, order_index);

-- Vouchers & Promo Codes (FR-12, FR-91)
CREATE TYPE discount_type AS ENUM ('percentage', 'fixed');

CREATE TABLE vouchers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    discount_type discount_type NOT NULL DEFAULT 'percentage',
    discount_value DECIMAL(12, 2) NOT NULL CHECK (discount_value > 0),
    max_discount DECIMAL(12, 2) CHECK (max_discount IS NULL OR max_discount >= 0),
    min_purchase DECIMAL(12, 2) NOT NULL DEFAULT 0.00 CHECK (min_purchase >= 0),
    usage_limit INT CHECK (usage_limit IS NULL OR usage_limit > 0),
    used_count INT NOT NULL DEFAULT 0 CHECK (used_count >= 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Transactions Table (Pembelian Kursus Satuan & B2B)
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    voucher_id UUID REFERENCES vouchers(id) ON DELETE SET NULL,
    amount DECIMAL(12, 2) NOT NULL,
    discount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    final_amount DECIMAL(12, 2) NOT NULL,
    payment_gateway VARCHAR(50) NOT NULL DEFAULT 'midtrans', -- midtrans / xendit
    payment_method VARCHAR(50), -- va, qris, ewallet, cc
    status payment_status NOT NULL DEFAULT 'pending',
    external_transaction_id VARCHAR(255) UNIQUE NOT NULL,
    snap_token TEXT,
    paid_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_transactions_user ON transactions(user_id, created_at DESC);

-- Enrollments (Akses Kursus yang Telah Dibeli)
CREATE TABLE enrollments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    progress_percentage DECIMAL(5, 2) DEFAULT 0.00,
    is_completed BOOLEAN DEFAULT FALSE,
    completed_at TIMESTAMP WITH TIME ZONE,
    enrolled_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, course_id)
);

-- Lesson Progress
CREATE TABLE lesson_progress (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lesson_id UUID REFERENCES lessons(id) ON DELETE CASCADE,
    is_completed BOOLEAN DEFAULT FALSE,
    last_position_seconds INT DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, lesson_id)
);

-- Offline Download Tokens (FR-24: Video terenkripsi lokal AES-256)
CREATE TABLE offline_download_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lesson_id UUID REFERENCES lessons(id) ON DELETE CASCADE,
    device_fingerprint VARCHAR(255) NOT NULL,
    encryption_key VARCHAR(255) NOT NULL, -- dienkripsi dengan OFFLINE_KEY_MASTER (AES-256-GCM, base64)
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_offline_tokens_lookup ON offline_download_tokens(user_id, lesson_id, device_fingerprint);

-- Certificates (FR-34)
CREATE TABLE certificates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    certificate_code VARCHAR(100) UNIQUE NOT NULL,
    pdf_url TEXT NOT NULL,
    issued_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, course_id)
);

-- Course Reviews & Ratings (FR-26)
CREATE TABLE course_reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, course_id)
);
CREATE INDEX idx_course_reviews_course ON course_reviews(course_id, created_at DESC);

-- Quizzes & Final Exams (FR-31, FR-32)
CREATE TYPE question_type AS ENUM ('multiple_choice', 'true_false', 'short_answer');

CREATE TABLE quizzes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lesson_id UUID UNIQUE NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    passing_score INT NOT NULL DEFAULT 70 CHECK (passing_score >= 0 AND passing_score <= 100),
    time_limit_minutes INT NOT NULL DEFAULT 0 CHECK (time_limit_minutes >= 0),
    is_final_exam BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE quiz_questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    question_type question_type NOT NULL DEFAULT 'multiple_choice',
    options JSONB NOT NULL DEFAULT '[]'::jsonb, -- array string pilihan jawaban
    correct_answer TEXT NOT NULL,
    points INT NOT NULL DEFAULT 10 CHECK (points > 0),
    order_index INT NOT NULL DEFAULT 1
);
CREATE INDEX idx_quiz_questions_quiz ON quiz_questions(quiz_id, order_index);

CREATE TABLE quiz_attempts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    score INT NOT NULL CHECK (score >= 0 AND score <= 100),
    is_passed BOOLEAN NOT NULL DEFAULT FALSE,
    submitted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_quiz_attempts_user ON quiz_attempts(user_id, quiz_id, submitted_at DESC);

-- B2B Companies & Licenses
CREATE TABLE b2b_companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_name VARCHAR(255) NOT NULL,
    contact_email VARCHAR(255) NOT NULL,
    total_licenses INT NOT NULL,
    used_licenses INT DEFAULT 0,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE b2b_employees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES b2b_companies(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(company_id, user_id)
);

-- Seed Initial Categories
INSERT INTO categories (name, slug, description) VALUES
('Pemrograman & Software', 'pemrograman-software', 'Belajar coding, web dev, mobile app, dan DevOps'),
('Bisnis & Keuangan', 'bisnis-keuangan', 'Kewirausahaan, akuntansi, digital marketing, dan manajemen'),
('Keterampilan Pabrik & Teknis', 'keterampilan-pabrik-teknis', 'K3, operator mesin, logistik, dan teknik industri');
