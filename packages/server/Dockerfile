# Single-stage: web dist already built locally (by build.sh), just compile Go
FROM golang:1.22-alpine AS builder

RUN apk add --no-cache git ca-certificates

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -ldflags="-s -w" -trimpath \
    -o /bin/amoon ./cmd/server

# ── Runtime ───────────────────────────────────────────────────────────────────
FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

WORKDIR /app
COPY --from=builder /bin/amoon /app/amoon

VOLUME ["/app/data"]
EXPOSE 8080

ENV PORT=8080 \
    DB_PATH=/app/data/amoon.db \
    ENV=production

ENTRYPOINT ["/app/amoon"]
