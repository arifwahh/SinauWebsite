export type UserRole =
  | 'student'
  | 'internal_instructor'
  | 'external_instructor'
  | 'b2b_admin'
  | 'curator'
  | 'super_admin';

export type CourseLevel = 'beginner' | 'intermediate' | 'advanced' | 'all_levels';
export type CourseStatus = 'draft' | 'submitted' | 'reviewing' | 'published' | 'rejected';
export type LessonType = 'video' | 'article' | 'pdf' | 'quiz' | 'task' | 'live_class';

export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  phone?: string | null;
  birth_date?: string | null;
  preferred_language?: string;
  is_verified?: boolean;
  created_at?: string;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  description?: string | null;
  created_at: string;
}

export interface Course {
  id: string;
  instructor_id?: string | null;
  category_id?: number | null;
  title: string;
  slug: string;
  subtitle?: string | null;
  description?: string | null;
  thumbnail_url?: string | null;
  price: number;
  level: CourseLevel;
  status: CourseStatus;
  rating_avg: number;
  total_reviews: number;
  created_at: string;
}

export interface Lesson {
  id: string;
  module_id: string;
  title: string;
  lesson_type: LessonType;
  content_url?: string | null;
  duration_seconds: number;
  order_index: number;
  is_free_preview: boolean;
  created_at: string;
}

export interface Module {
  id: string;
  course_id: string;
  title: string;
  order_index: number;
  lessons?: Lesson[];
  created_at: string;
}

export interface CourseWithModules extends Course {
  modules?: Module[];
}

export interface CourseReview {
  id: string;
  user_id: string;
  user_name?: string;
  course_id: string;
  rating: number;
  comment?: string | null;
  created_at: string;
}

export interface Enrollment {
  id: string;
  user_id: string;
  course_id: string;
  course_title?: string;
  thumbnail_url?: string | null;
  progress_percentage: number;
  is_completed: boolean;
  completed_at?: string | null;
  enrolled_at: string;
}

export interface Certificate {
  id: string;
  user_id: string;
  student_name?: string;
  course_id: string;
  course_title?: string;
  certificate_code: string;
  pdf_url: string;
  issued_at: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  course_id: string;
  voucher_id?: string | null;
  amount: number;
  discount: number;
  final_amount: number;
  payment_gateway: string;
  status: string;
  external_transaction_id: string;
  paid_at?: string | null;
  created_at: string;
}

export interface Voucher {
  id: string;
  code: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  max_discount?: number | null;
  min_purchase: number;
  usage_limit?: number | null;
  used_count: number;
  is_active: boolean;
  expires_at?: string | null;
}

export interface QuizQuestion {
  id?: string;
  quiz_id?: string;
  question_text: string;
  question_type: 'multiple_choice' | 'true_false' | 'short_answer';
  options: string[];
  correct_answer?: string;
  points: number;
  order_index?: number;
}

export interface Quiz {
  id: string;
  lesson_id: string;
  title: string;
  passing_score: number;
  time_limit_minutes: number;
  is_final_exam: boolean;
  questions: QuizQuestion[];
}

export interface AdminOverview {
  total_users: number;
  published_courses: number;
  total_enrollments: number;
  completed_courses: number;
  completion_rate: number;
  total_revenue: number;
  total_certificates: number;
}

export interface ApiResponse<T> {
  status: string;
  data: T;
  message?: string;
}

export interface LoginResponse {
  status: string;
  data: {
    access_token: string;
    refresh_token: string;
    token_type: string;
    expires_in: number;
  };
  user: AuthUser;
}

export interface TransactionResult {
  status: string;
  transaction_id?: string;
  external_transaction_id?: string;
  amount: number;
  discount: number;
  final_amount: number;
  payment_gateway?: string;
  payment_url?: string;
  account_created?: boolean;
  message?: string;
}

export interface ProgressResult {
  status: string;
  course_id: string;
  progress_percentage: number;
  is_completed: boolean;
  certificate_code?: string;
}

export interface QuizSubmitResult {
  status: string;
  attempt_id: string;
  score: number;
  passing_score: number;
  is_passed: boolean;
}
