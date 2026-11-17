package database

import (
	"context"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ConnectDB membuka pool koneksi PostgreSQL dengan retry agar backend
// tidak langsung mati ketika database belum siap saat container start.
func ConnectDB(dsn string) *pgxpool.Pool {
	pool, err := pgxpool.New(context.Background(), dsn)
	if err != nil {
		log.Fatalf("Konfigurasi database tidak valid: %v", err)
	}

	const maxAttempts = 10
	for attempt := 1; attempt <= maxAttempts; attempt++ {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		err = pool.Ping(ctx)
		cancel()
		if err == nil {
			log.Println("Berhasil terhubung ke PostgreSQL")
			return pool
		}
		log.Printf("Menunggu database (percobaan %d/%d): %v", attempt, maxAttempts, err)
		time.Sleep(2 * time.Second)
	}
	log.Fatalf("Gagal terhubung ke database: %v", err)
	return nil
}
