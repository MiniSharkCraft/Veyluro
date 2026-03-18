package db

import (
	"database/sql"
	"embed"
	"fmt"
	"os"
	"strings"

	_ "github.com/go-sql-driver/mysql"
)

//go:embed schema.sql
var schemaFS embed.FS

func Open(dsn string) (*sql.DB, error) {
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return nil, fmt.Errorf("mở DB thất bại: %w", err)
	}

	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(10)

	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("kết nối DB thất bại: %w", err)
	}

	if err := migrate(db); err != nil {
		return nil, fmt.Errorf("migrate DB: %w", err)
	}

	return db, nil
}

func migrate(db *sql.DB) error {
	schema, err := schemaFS.ReadFile("schema.sql")
	if err != nil {
		return err
	}

	// Chạy từng statement riêng (MySQL driver không hỗ trợ multi-statement mặc định)
	stmts := splitSQL(string(schema))
	for _, stmt := range stmts {
		stmt = strings.TrimSpace(stmt)
		if stmt == "" {
			continue
		}
		if _, err := db.Exec(stmt); err != nil {
			// Ignore "duplicate" errors for idempotent statements
			errStr := err.Error()
			if strings.Contains(errStr, "Duplicate") ||
				strings.Contains(errStr, "already exists") ||
				strings.Contains(errStr, "1060") || // duplicate column
				strings.Contains(errStr, "1061") || // duplicate key name
				strings.Contains(errStr, "1062") { // duplicate entry
				continue
			}
			fmt.Fprintf(os.Stderr, "migrate warning [%s...]: %v\n", truncate(stmt, 60), err)
		}
	}
	return nil
}

// splitSQL tách file SQL theo dấu ; (bỏ qua comment)
func splitSQL(s string) []string {
	var stmts []string
	var buf strings.Builder
	for _, line := range strings.Split(s, "\n") {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "--") {
			continue
		}
		buf.WriteString(line)
		buf.WriteByte('\n')
		if strings.HasSuffix(trimmed, ";") {
			stmts = append(stmts, buf.String())
			buf.Reset()
		}
	}
	return stmts
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}
