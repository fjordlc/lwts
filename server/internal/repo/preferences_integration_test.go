//go:build integration

package repo

import (
	"context"
	"os"
	"strings"
	"testing"

	"github.com/oceanplexian/lwts/server/internal/db"
	"github.com/oceanplexian/lwts/server/migrations"
)

// TestPreferenceRepositoryIntegration repeats the preference checks on the
// configured backend (PostgreSQL in CI's integration job).
func TestPreferenceRepositoryIntegration(t *testing.T) {
	ctx := context.Background()
	url := os.Getenv("DB_URL")
	if url == "" {
		url = "postgres://lwts_test:lwts_test@localhost:5433/lwts_test?sslmode=disable"
	}
	ds, err := db.NewDatasource(ctx, url)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	t.Cleanup(func() {
		if strings.HasPrefix(url, "postgres") {
			_, _ = ds.Exec(ctx, "DROP SCHEMA public CASCADE")
			_, _ = ds.Exec(ctx, "CREATE SCHEMA public")
		}
		ds.Close()
	})
	if err := db.Migrate(ctx, ds, migrations.FS); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	testPreferenceRepository(t, ds)
}
