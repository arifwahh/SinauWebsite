# Sinau — Platform E-Learning (Website & Android)

**Sinau** adalah platform e-learning berbasis website dan aplikasi mobile (Flutter) yang dikembangkan oleh **AW More Creative**. Platform ini dirancang agar ringan, hemat kuota, mendukung pembelian kursus secara satuan (*standalone purchase*), serta memiliki fitur unduhan video offline terenkripsi (`AES-256`) untuk perangkat Android.

---

## ✨ Fitur Utama

- **Pembelian Kursus Satuan & Kode Voucher:** Seluruh kursus dijual secara satuan tanpa sistem langganan, dilengkapi dukungan potongan harga/voucher dan integrasi webhook pembayaran (**Midtrans** & **Xendit**).
- **Manajemen Kurikulum Lengkap:** Struktur materi berlapis (**Kategori → Kursus → Modul/Bab → Pelajaran**) yang mendukung Video HLS, Artikel, PDF, dan Kuis interaktif.
- **Evaluasi & Sertifikat Otomatis:** Pelacakan progres belajar per pelajaran, penilaian kuis/ujian akhir otomatis, serta penerbitan sertifikat kelulusan lengkap dengan kode verifikasi publik.
- **Download Video Offline Terenkripsi (`AES-256`):** Menyediakan token enkripsi terikat perangkat (*device fingerprint*) agar video pelajaran dapat ditonton secara offline di aplikasi Android dengan aman.
- **Keamanan & Multi-Role (RBAC):** Autentikasi berbasis **JWT Access Token** + rotasi **Refresh Token**, *rate limiting*, serta 6 peran pengguna (`student`, `internal_instructor`, `external_instructor`, `b2b_admin`, `curator`, `super_admin`).

---

## 🏗️ Arsitektur & Teknologi

| Komponen | Teknologi |
|---|---|
| **Frontend Website** | Next.js 14 (App Router, TypeScript, Tailwind CSS, `hls.js`, Cloudflare Pages Static Export) |
| **Backend API** | Golang 1.22 (`Fiber v2`, `pgx/v5`, `jwt/v5`, `bcrypt`) |
| **Database & Cache** | PostgreSQL 15 & Redis 7 |
| **Mobile App** | Flutter (Android & iOS) |
| **Containerization** | Docker & Docker Compose |

```text
SinauWebsite/
├── backend/
│   ├── cmd/main.go                 # Entrypoint REST API Server (Go Fiber)
│   ├── internal/
│   │   ├── config/                 # Konfigurasi environment & koneksi DSN
│   │   ├── database/               # Connection pool PostgreSQL (pgxpool)
│   │   ├── handler/                # HTTP Handlers & Unit Tests
│   │   ├── middleware/             # Middleware JWT Auth & RBAC
│   │   └── models/                 # Domain Models
│   ├── Dockerfile                  # Multi-stage Dockerfile untuk produksi
│   └── go.mod                      # Go module dependencies
├── frontend/
│   ├── src/
│   │   ├── app/                    # Halaman Next.js App Router (Katalog, Checkout, Ruang Belajar, Admin)
│   │   ├── components/             # Komponen UI (Navbar, dsb.)
│   │   └── lib/api.ts              # API Client dengan Auto-Refresh JWT Token
│   ├── Dockerfile                  # Static build & Nginx server (port 3000)
│   └── next.config.mjs             # Konfigurasi Static Export (Cloudflare Pages)
├── database/
│   └── schema.sql                  # Skema tabel & seed data PostgreSQL
├── flutter_app/
│   └── pubspec.yaml                # Konfigurasi aplikasi mobile Flutter
├── .env.example                    # Template variabel environment
└── docker-compose.yml              # Orkestrasi container (Postgres, Redis, Backend, Frontend)
```

---

## 🚀 Cara Instalasi & Menjalankan Proyek

### Prasyarat
- **Docker** dan **Docker Compose** sudah terinstal di sistem Anda.
- *(Opsional)* **Go 1.22+** jika ingin menjalankan backend secara langsung tanpa Docker.

### 1. Clone Repositori
```bash
git clone <url-repository-github-anda>
cd SinauWebsite
```

### 2. Konfigurasi Environment (`.env`)
Salin file template `.env.example` menjadi `.env`:
```bash
cp .env.example .env
```
Buat kunci rahasia (`JWT_SECRET` dan `OFFLINE_KEY_MASTER`) menggunakan `openssl`, lalu masukkan ke dalam file `.env` beserta password database Anda:
```bash
# Generate 2 random hex string (64 karakter / 32 byte)
openssl rand -hex 32
openssl rand -hex 32
```
Contoh isi file `.env`:
```env
DB_USER=sinau_admin
DB_PASSWORD=PasswordDatabaseKuat123
DB_NAME=sinau_db

JWT_SECRET=<hasil_openssl_rand_hex_32_pertama>
OFFLINE_KEY_MASTER=<hasil_openssl_rand_hex_32_kedua>

MIDTRANS_SERVER_KEY=
XENDIT_CALLBACK_TOKEN=
CORS_ALLOW_ORIGINS=http://localhost:3000
```

### 3. Jalankan dengan Docker Compose
```bash
sudo docker compose up -d --build
```
- **Website Frontend (Next.js):** **`http://localhost:3000`**
- **Server REST API (Golang):** **`http://localhost:8080/api/v1`**

Untuk memastikan server berjalan normal:
```bash
curl http://localhost:8080/api/v1/health
```

> **Catatan:** Jika Anda melakukan perubahan pada `database/schema.sql` dan ingin memuat ulang tabel dari awal, jalankan:
> ```bash
> sudo docker compose down -v
> sudo docker compose up -d --build
> ```

---

## 🧪 Menjalankan Unit Test

Anda dapat menjalankan seluruh unit test secara langsung menggunakan Docker (tanpa perlu menginstal Go di mesin lokal):

```bash
sudo docker run --rm -v "$(pwd)/backend":/app -w /app golang:1.22-alpine go test -v ./...
```

Atau jika Go 1.22+ sudah terinstal di komputer Anda:
```bash
cd backend
go test -v ./...
```

---

## 📡 Ringkasan Endpoint API (`/api/v1`)

| Kategori | Method & Endpoint | Akses | Deskripsi |
|---|---|---|---|
| **Health** | `GET /health` | Publik | Cek status server API |
| **Auth** | `POST /auth/register` | Publik | Registrasi akun pelajar baru (usia ≥ 13 tahun) |
| | `POST /auth/login` | Publik | Login & dapatkan `access_token` + `refresh_token` |
| | `POST /auth/refresh` | Publik | Rotasi *refresh token* |
| | `POST /auth/logout` | Bearer | Mencabut *refresh token* aktif |
| | `GET /auth/me` | Bearer | Mengambil profil pengguna yang sedang login |
| **Katalog** | `GET /categories` | Publik | Daftar kategori kursus |
| | `GET /courses` | Publik | Katalog kursus (`?q=&category_id=&level=&min_price=&max_price=&min_rating=`) |
| | `GET /courses/:id` | Publik | Detail kursus beserta silabus modul & pelajaran |
| | `GET /courses/:id/reviews` | Publik | Daftar ulasan & rating kursus |
| **Instruktur** | `POST /courses` | Instruktur / Admin | Membuat kursus baru |
| | `POST /courses/:id/modules` | Instruktur / Admin | Menambahkan modul/bab ke kursus |
| | `POST /modules/:id/lessons` | Instruktur / Admin | Menambahkan pelajaran ke modul |
| | `POST /lessons/:id/quiz` | Instruktur / Admin | Membuat kuis & bank soal pada pelajaran |
| **Belajar** | `GET /my-courses` | Bearer | Daftar kursus yang dimiliki beserta persentase progres |
| | `GET /lessons/:id` | Bearer (Enrolled) | Membuka materi pelajaran lengkap |
| | `POST /lessons/:id/progress` | Bearer (Enrolled) | Menyimpan progres belajar & terbitkan sertifikat otomatis saat 100% |
| | `GET /lessons/:id/quiz` | Bearer (Enrolled) | Mengambil soal kuis untuk dikerjakan |
| | `POST /quizzes/:id/submit` | Bearer (Enrolled) | Mengirim jawaban kuis & penilaian otomatis |
| | `POST /courses/:id/reviews` | Bearer (Enrolled) | Memberikan rating (1–5) & ulasan kursus |
| | `GET /certificates/my` | Bearer | Daftar sertifikat kelulusan milik pengguna |
| | `GET /certificates/verify/:code` | Publik | Verifikasi keaslian sertifikat via kode publik |
| | `POST /offline/token` | Bearer (Enrolled) | Generate kunci `AES-256` untuk unduhan video offline |
| **Transaksi** | `POST /transactions` | Bearer | Pembelian kursus satuan (mendukung `voucher_code`) |
| | `GET /transactions` | Bearer | Riwayat transaksi pengguna |
| | `POST /webhooks/midtrans` | Signature SHA-512 | Webhook notifikasi pembayaran Midtrans |
| | `POST /webhooks/xendit` | Callback Token | Webhook callback invoice Xendit |
| **Admin** | `GET /admin/analytics/overview` | Super Admin | Ringkasan metrik pengguna, kelulusan, dan pendapatan |
| | `POST /admin/users` | Super Admin | Membuat akun baru untuk role spesifik |
| | `PATCH /admin/users/:id/role` | Super Admin | Mengubah role pengguna |
| | `POST /admin/vouchers` | Super Admin | Membuat kode promo/voucher diskon |
| | `POST /admin/categories` | Kurator / Admin | Menambahkan kategori kursus baru |
| | `PATCH /admin/courses/:id/status`| Kurator / Admin | Menyetujui atau menolak penerbitan kursus |

---

## 📄 Lisensi & Pengembang

Dikembangkan oleh **AW More Creative**. Seluruh hak cipta dilindungi.
