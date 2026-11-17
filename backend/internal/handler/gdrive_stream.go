package handler

import (
	"context"
	"crypto/rsa"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
)

var driveFileIDPattern = regexp.MustCompile(`/file/d/([a-zA-Z0-9_-]+)`)

type streamClaims struct {
	LessonID string `json:"lesson_id"`
	Purpose  string `json:"purpose"`
	jwt.RegisteredClaims
}

// extractGoogleDriveID mengekstrak File ID dari URL share/preview/uc Google Drive.
func extractGoogleDriveID(rawURL string) string {
	u, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil || !strings.Contains(u.Hostname(), "drive.google.com") {
		return ""
	}
	if m := driveFileIDPattern.FindStringSubmatch(u.Path); len(m) == 2 {
		return m[1]
	}
	return u.Query().Get("id")
}

func (h *Handler) issueStreamToken(lessonID, userID string) (string, error) {
	now := time.Now()
	claims := streamClaims{
		LessonID: lessonID,
		Purpose:  "stream",
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(2 * time.Hour)),
			Issuer:    "sinau-stream",
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(h.cfg.JWTSecret)
}

func (h *Handler) verifyStreamToken(tokenStr, lessonID string) bool {
	if tokenStr == "" {
		return false
	}
	claims := &streamClaims{}
	tok, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (any, error) {
		return h.cfg.JWTSecret, nil
	}, jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}), jwt.WithExpirationRequired())
	return err == nil && tok.Valid && claims.Purpose == "stream" && claims.LessonID == lessonID
}

// rewriteLessonStreamURL mengganti URL Google Drive asli dengan endpoint proxy backend
// sehingga link/fileId Google Drive tidak pernah terlihat oleh browser.
func (h *Handler) rewriteLessonStreamURL(lessonID, userID string, isFreePreview bool, contentURL *string) *string {
	if contentURL == nil || extractGoogleDriveID(*contentURL) == "" {
		return contentURL
	}
	if isFreePreview {
		u := fmt.Sprintf("/api/v1/lessons/%s/stream", lessonID)
		return &u
	}
	tok, err := h.issueStreamToken(lessonID, userID)
	if err != nil {
		return nil
	}
	u := fmt.Sprintf("/api/v1/lessons/%s/stream?token=%s", lessonID, tok)
	return &u
}

// StreamLessonMedia — proxy streaming video privat dari Google Drive menggunakan Service Account.
// Mendukung HTTP Range (seek) dan tidak pernah membocorkan URL/ID asli Google Drive ke client.
func (h *Handler) StreamLessonMedia(c *fiber.Ctx) error {
	lessonID := c.Params("id")
	cx, cancel := ctx(c)
	defer cancel()

	var (
		contentURL    *string
		isFreePreview bool
	)
	err := h.db.QueryRow(cx,
		`SELECT content_url, is_free_preview FROM lessons WHERE id = $1`, lessonID,
	).Scan(&contentURL, &isFreePreview)
	if isNotFound(err) {
		return fiber.NewError(fiber.StatusNotFound, "Pelajaran tidak ditemukan")
	} else if err != nil {
		return err
	}

	if !isFreePreview && !h.verifyStreamToken(c.Query("token"), lessonID) {
		return fiber.NewError(fiber.StatusUnauthorized, "Token streaming tidak valid atau kedaluwarsa")
	}

	if contentURL == nil {
		return fiber.NewError(fiber.StatusNotFound, "Media pelajaran belum tersedia")
	}
	fileID := extractGoogleDriveID(*contentURL)
	if fileID == "" {
		return fiber.NewError(fiber.StatusBadRequest, "Pelajaran ini bukan media Google Drive")
	}

	accessToken, err := h.googleDriveAccessToken(c.UserContext())
	if err != nil {
		return fiber.NewError(fiber.StatusServiceUnavailable, "Layanan streaming Google Drive belum dikonfigurasi")
	}

	driveURL := fmt.Sprintf("https://www.googleapis.com/drive/v3/files/%s?alt=media", url.PathEscape(fileID))
	req, err := http.NewRequestWithContext(c.UserContext(), http.MethodGet, driveURL, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	if rng := c.Get(fiber.HeaderRange); rng != "" {
		req.Header.Set("Range", rng)
	}

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return err
	}
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusPartialContent {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		resp.Body.Close()
		return fiber.NewError(fiber.StatusBadGateway, fmt.Sprintf("Google Drive mengembalikan HTTP %d: %s", resp.StatusCode, string(body)))
	}

	for _, hdr := range []string{"Content-Type", "Content-Length", "Content-Range", "Accept-Ranges"} {
		if v := resp.Header.Get(hdr); v != "" {
			c.Set(hdr, v)
		}
	}
	c.Set(fiber.HeaderCacheControl, "no-store")
	c.Set("Content-Disposition", "inline")
	c.Status(resp.StatusCode)
	return c.SendStream(resp.Body)
}

type serviceAccountKey struct {
	ClientEmail string `json:"client_email"`
	PrivateKey  string `json:"private_key"`
	TokenURI    string `json:"token_uri"`
}

func (h *Handler) googleDriveAccessToken(cx context.Context) (string, error) {
	if h.cfg.GoogleServiceAccountJSON == "" {
		return "", errors.New("GOOGLE_SERVICE_ACCOUNT_JSON kosong")
	}

	h.driveMu.Lock()
	defer h.driveMu.Unlock()

	if h.driveToken != "" && time.Now().Add(time.Minute).Before(h.driveTokenExp) {
		return h.driveToken, nil
	}

	var sa serviceAccountKey
	if err := json.Unmarshal([]byte(h.cfg.GoogleServiceAccountJSON), &sa); err != nil {
		return "", err
	}
	if sa.TokenURI == "" {
		sa.TokenURI = "https://oauth2.googleapis.com/token"
	}
	rsaKey, err := parseRSAPrivateKey(sa.PrivateKey)
	if err != nil {
		return "", err
	}

	now := time.Now()
	assertion, err := jwt.NewWithClaims(jwt.SigningMethodRS256, jwt.MapClaims{
		"iss":   sa.ClientEmail,
		"scope": "https://www.googleapis.com/auth/drive.readonly",
		"aud":   sa.TokenURI,
		"iat":   now.Unix(),
		"exp":   now.Add(55 * time.Minute).Unix(),
	}).SignedString(rsaKey)
	if err != nil {
		return "", err
	}

	form := url.Values{
		"grant_type": {"urn:ietf:params:oauth:grant-type:jwt-bearer"},
		"assertion":  {assertion},
	}
	req, err := http.NewRequestWithContext(cx, http.MethodPost, sa.TokenURI, strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var tokResp struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
		Error       string `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tokResp); err != nil {
		return "", err
	}
	if tokResp.AccessToken == "" {
		return "", fmt.Errorf("gagal mendapat token Google Drive: %s", tokResp.Error)
	}

	ttl := time.Duration(tokResp.ExpiresIn) * time.Second
	if ttl <= 0 {
		ttl = 55 * time.Minute
	}
	h.driveToken = tokResp.AccessToken
	h.driveTokenExp = time.Now().Add(ttl)
	return h.driveToken, nil
}

func parseRSAPrivateKey(pemStr string) (*rsa.PrivateKey, error) {
	block, _ := pem.Decode([]byte(pemStr))
	if block == nil {
		return nil, errors.New("PEM private_key tidak valid")
	}
	key, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return nil, err
	}
	rsaKey, ok := key.(*rsa.PrivateKey)
	if !ok {
		return nil, errors.New("private_key bukan RSA")
	}
	return rsaKey, nil
}
