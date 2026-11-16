FROM golang:1.22-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /sinau-server ./cmd

FROM alpine:3.19
RUN apk add --no-cache ca-certificates tzdata && adduser -D -H -u 10001 sinau
WORKDIR /app
COPY --from=builder /sinau-server .
USER sinau

EXPOSE 8080
CMD ["./sinau-server"]
