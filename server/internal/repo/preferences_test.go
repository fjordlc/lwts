package repo

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/oceanplexian/lwts/server/internal/db"
)

// testPreferenceRepository runs against any datasource so the integration
// build can repeat it on PostgreSQL.
func testPreferenceRepository(t *testing.T, ds db.Datasource) {
	ctx := context.Background()
	users := NewUserRepository(ds)
	prefs := NewPreferenceRepository(ds)

	u, err := users.Create(ctx, "Pref User", "pref@example.com", "h")
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	other, err := users.Create(ctx, "Other User", "other@example.com", "h")
	if err != nil {
		t.Fatalf("create user: %v", err)
	}

	got, err := prefs.Get(ctx, u.ID)
	if err != nil || len(got) != 0 {
		t.Fatalf("empty get = %v, %v", got, err)
	}

	patch := Preferences{"default_board_id": json.RawMessage(`"b1"`), "show_presence": json.RawMessage(`false`)}
	if _, err := prefs.Merge(ctx, u.ID, patch); err != nil {
		t.Fatalf("merge: %v", err)
	}
	merged, err := prefs.Merge(ctx, u.ID, Preferences{"show_presence": json.RawMessage(`null`), "x": json.RawMessage(`{"a": [1, 2]}`)})
	if err != nil {
		t.Fatalf("merge 2: %v", err)
	}
	if string(merged["default_board_id"]) != `"b1"` || merged["show_presence"] != nil || string(merged["x"]) != `{"a":[1,2]}` {
		t.Fatalf("merged = %s", mustJSON(merged))
	}
	if o, _ := prefs.Get(ctx, other.ID); len(o) != 0 {
		t.Fatalf("other user sees %s", mustJSON(o))
	}

	if _, err := prefs.Merge(ctx, u.ID, Preferences{"big": json.RawMessage(`"` + strings.Repeat("z", MaxPreferenceBytes) + `"`)}); !errors.Is(err, ErrPreferencesTooLarge) {
		t.Fatalf("too large err = %v", err)
	}
	if _, err := prefs.Merge(ctx, u.ID, Preferences{"bad key": json.RawMessage(`1`)}); !errors.Is(err, ErrInvalidPreferences) {
		t.Fatalf("bad key err = %v", err)
	}
	if got, _ := prefs.Get(ctx, u.ID); len(got) != 2 {
		t.Fatalf("rejected merges changed the object: %s", mustJSON(got))
	}

	// Deleting the user removes their preferences.
	if err := users.Delete(ctx, u.ID); err != nil {
		t.Fatalf("delete user: %v", err)
	}
	var n int
	if err := ds.QueryRow(ctx, `SELECT COUNT(*) FROM user_preferences WHERE user_id = $1`, u.ID).Scan(&n); err != nil || n != 0 {
		t.Fatalf("preferences left after user delete: n=%d err=%v", n, err)
	}
}

func mustJSON(v any) string { b, _ := json.Marshal(v); return string(b) }

func TestPreferenceRepository(t *testing.T) {
	testPreferenceRepository(t, setupTestDB(t))
}
