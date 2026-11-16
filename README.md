# Sinau E-Learning Platform — Implementasi SRS v0.2

> [!IMPORTANT]
> ## ✅ Yang Harus Anda Lakukan Sekarang
>
> **1. Review & commit perubahan terbaru** (perbaikan build + keamanan backend, belum di-commit):
> ```bash
> git status
> git diff
> git add -A && git commit -m "fix: build errors, JWT/RBAC, refresh token, webhook signature, env config"
> ```
>
> **2. Buat file `.env`** (wajib — backend menolak start tanpa secret):
> ```bash
> cp .env.example .env
> openssl rand -hex 32   # tempel ke JWT_SECRET
> openssl rand -hex 32   # tempel ke OFFLINE_KEY_MASTER
> ```
> Isi juga `DB_PASSWORD` dengan password yang kuat.
>
> **3. Jalankan Docker** (daemon Docker harus aktif):
> ```bash
> sudo systemctl start docker
> docker compose down -v      # hanya jika sebelumnya pernah dijalankan (skema DB berubah)
> docker compose up --build
> ```
>
> **4. Uji cepat** — pastikan semua berhasil:
> ```bash
> curl http://localhost:8080/api/v1/health
> curl -X POST http://localhost:8080/api/v1/auth/register -H "Content-Type: application/json" \
>   -d '{"email":"pelajar@sinau.id","password":"password123","full_name":"Budi","birth_date":"2005-04-12"}'
> curl -X POST http://localhost:8080/api/v1/auth/login -H "Content-Type: application/json" \
>   -d '{"email":"pelajar@sinau.id","password":"password123"}'
> curl http://localhost:8080/api/v1/auth/me -H "Authorization: Bearer <access_token dari login>"
> ```
>
> **5. Siapkan payment gateway (sandbox):**
> - Ambil **Server Key** dari dashboard Midtrans Sandbox → isi `MIDTRANS_SERVER_KEY` di `.env`.
> - Ambil **Callback Verification Token** dari dashboard Xendit → isi `XENDIT_CALLBACK_TOKEN`.
> - Daftarkan URL notifikasi di dashboard: `https://<domain>/api/v1/webhooks/midtrans` dan `https://<domain>/api/v1/webhooks/xendit`.
>
> **6. Putuskan & kabari developer:**
> - Apakah kursus **instruktur internal** juga wajib review kurator? (Saat ini langsung terbit; hanya instruktur eksternal yang masuk `draft`.)
>
> **7. (Opsional) Pasang Go 1.22+** untuk development lokal, lalu jalankan `cd backend && go test ./...`.
>
> ⚠️ **Perubahan API (breaking):** `/transactions/buy` → `/transactions`; `/webhook/payment` → `/webhooks/midtrans` & `/webhooks/xendit`; login kini mengembalikan `data.access_token` + `data.refresh_token`; register wajib `birth_date`.
>
> 🔜 **Belum dikerjakan:** integrasi Snap/Invoice gateway sungguhan (masih mock), katalog + filter, modul/pelajaran, progress, kuis, sertifikat, admin panel, website frontend, kode aplikasi Flutter.

---

Repositori ini berisi kerangka awal implementasi teknis untuk **Sinau**, platform e-learning berbasis website dan aplikasi Android yang dikembangkan oleh **AW More Creative** berdasarkan dokumen **Software Requirements Specification (SRS) v0.2** tertanggal 16 November 2026.

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
│   │   ├── config/                 # Konfigurasi dari environment
│   │   ├── database/               # Koneksi Pool PostgreSQL (pgx)
│   │   ├── handler/                # HTTP Handlers (Auth, Courses, Payments, Offline Download)
│   │   ├── middleware/             # JWT auth & RBAC
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

### 1. Siapkan Environment
```bash
cp .env.example .env
# isi DB_PASSWORD, lalu generate secret:
openssl rand -hex 32   # → JWT_SECRET
openssl rand -hex 32   # → OFFLINE_KEY_MASTER
```

### 2. Menjalankan Backend & Database via Docker Compose
```bash
docker compose up --build
```
Backend API akan berjalan di `http://localhost:8080/api/v1`.

> Skema database hanya dijalankan saat volume Postgres pertama kali dibuat.
> Jika `database/schema.sql` berubah, reset dengan `docker compose down -v`.

### 3. Endpoint API

| Method | Path | Auth | Keterangan |
|---|---|---|---|
| GET | `/health` | – | Health check |
| POST | `/auth/register` | – | Registrasi (wajib `birth_date`, usia ≥ 13) |
| POST | `/auth/login` | – | Mengembalikan `access_token` + `refresh_token` |
| POST | `/auth/refresh` | – | Rotasi refresh token |
| POST | `/auth/logout` | Bearer | Mencabut refresh token |
| GET | `/auth/me` | Bearer | Profil pengguna |
| GET | `/courses` | – | Katalog (`?limit=&offset=`) |
| GET | `/courses/:id` | – | Detail kursus published |
| POST | `/courses` | Bearer (instruktur / super admin) | Kursus eksternal masuk sebagai `draft` |
| POST | `/transactions` | Bearer | Beli kursus satuan |
| GET | `/transactions` | Bearer | Riwayat transaksi |
| POST | `/webhooks/midtrans` | Signature SHA-512 | Notifikasi Midtrans |
| POST | `/webhooks/xendit` | Header `x-callback-token` | Callback Xendit |
| POST | `/offline/token` | Bearer | Kunci AES-256 video offline |

Contoh:
```bash
curl -X POST http://localhost:8080/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "pelajar@sinau.id", "password": "password123", "full_name": "Budi Santoso", "phone": "08123456789", "birth_date": "2005-04-12"}'

curl -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "pelajar@sinau.id", "password": "password123"}'

curl http://localhost:8080/api/v1/auth/me -H "Authorization: Bearer <access_token>"
```

> [!NOTE]
> Pembuatan Snap token Midtrans / Invoice Xendit masih **mock**; integrasi API gateway sungguhan menyusul.

---

## 📜 Lisensi & Developer
**Developer:** AW More Creative  
**Tanggal Rilis SRS:** 16 November 2026
