package auth

import (
	"context"
	"database/sql"
)

func CurrentTokenVersion(ctx context.Context, db *sql.DB, userID string) (int, error) {
	var version int
	if err := db.QueryRowContext(ctx, `SELECT COALESCE(token_version,0) FROM users WHERE id=?`, userID).Scan(&version); err != nil {
		return 0, err
	}
	return version, nil
}

func IncrementTokenVersion(ctx context.Context, db *sql.DB, userID string) error {
	_, err := db.ExecContext(ctx, `UPDATE users SET token_version=COALESCE(token_version,0)+1 WHERE id=?`, userID)
	return err
}
