# Sinau E-Learning Platform — Implementasi SRS v0.2

Repositori ini berisi implementasi teknis lengkap untuk **Sinau**, platform e-learning berbasis website dan aplikasi Android yang dikembangkan oleh **AW More Creative** berdasarkan dokumen **Software Requirements Specification (SRS) v0.2** tertanggal 16 November 2026.

---

## 🏗️ Struktur Arsitektur Proyek

```
SinauWebsite/
├── docs/
│   └── SRS_Revisi.md               # Spesifikasi Kebutuhan Perangkat Lunak v0.2
├── database/
│   └── schema.sql                  # Skema Database PostgreSQL (Users, Courses, Transactions, Offline Tokens)
├── backend/
│   ├── cmd/
│   │   └── main.go                 # Entrypoint Go Fiber API Server
│   ├── internal/
│   │   ├── config/                 # Konfigurasi aplikasi
│   │   ├── database/               # Koneksi Pool PostgreSQL (pgx)
│   │   ├── handler/                # HTTP Handlers (Auth, Courses, Payments, Offline Download)
│   │   └── models/                 # Struktur Data / Domain Models
│   ├── Dockerfile                  # Dockerfile untuk backend Golang
│   └── go.mod                      # Go Modules & Dependencies
├── flutter_app/
│   └── pubspec.yaml                # Konfigurasi Flutter App (Offline Encrypted Video Support)
└── docker-compose.yml              # Orkestrasi Docker (PostgreSQL, Redis, Backend)
```

---

## 🚀 Fitur Utama Sesuai SRS v0.2

1. **Pembelian Kursus Satuan (FR-10, FR-11):**
   - Seluruh kursus dijual secara satuan (*standalone purchase*), tidak ada sistem langganan/subscription.
   - Integrasi Midtrans / Xendit untuk Virtual Account, E-Wallet, QRIS, dan Kartu Kredit.
2. **Fitur Download Offline Terenkripsi (FR-24):**
   - Mendukung pelajar (terutama buruh pabrik / daerah minim kuota) mengunduh video pelajaran ke perangkat Android dengan enkripsi lokal (`AES-256`) via token verifikasi perangkat.
3. **Backend Berperforma Tinggi (Golang):**
   - Dibangun menggunakan **Go (Fiber v2)** untuk konkurensi tinggi dan efisiensi resource RAM/CPU.
4. **Kepatuhan Kebijakan (NFR-09):**
   - Aplikasi Android (Flutter) tidak memiliki transaksi digital di dalam aplikasi (*in-app purchase*), seluruh transaksi pembayaran diarahkan ke website.

---

## 🛠️ Cara Menjalankan Proyek (Development)

### 1. Menjalankan Backend & Database via Docker Compose
Pastikan Docker dan Docker Compose sudah terinstal di sistem Anda:
```bash
docker-compose up --build
```
Backend API akan berjalan di `http://localhost:8080/api/v1`.

### 2. Menguji Endpoint API
- **Health Check:**
  ```bash
  curl http://localhost:8080/api/v1/health
  ```
- **Registrasi Pengguna:**
  ```bash
  curl -X POST http://localhost:8080/api/v1/auth/register \
    -H "Content-Type: application/json" \
    -d '{"email": "pelajar@sinau.id", "password": "password123", "full_name": "Budi Santoso", "phone": "08123456789"}'
  ```
- **Login:**
  ```bash
  curl -X POST http://localhost:8080/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email": "pelajar@sinau.id", "password": "password123"}'
  ```
- **Lihat Katalog Kursus:**
  ```bash
  curl http://localhost:8080/api/v1/courses
  ```

---

## 📜 Lisensi & Developer
**Developer:** AW More Creative  
**Tanggal Rilis SRS:** 16 November 2026
