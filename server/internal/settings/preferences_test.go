package settings

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/oceanplexian/lwts/server/internal/repo"
)

func prefsMux(t *testing.T) (*http.ServeMux, *repo.UserRepository) {
	t.Helper()
	h, users, _ := setupTest(t)
	mux := http.NewServeMux()
	h.RegisterRoutes(mux, noopAuth, noopAuth)
	return mux, users
}

func newPrefsUser(t *testing.T, users *repo.UserRepository, name, email, role string) repo.User {
	t.Helper()
	u, err := users.Create(context.Background(), name, email, "hash")
	if err != nil {
		t.Fatal(err)
	}
	u.Role = role
	return u
}

func doPrefs(t *testing.T, mux *http.ServeMux, u *repo.User, method, body string) (int, map[string]any) {
	t.Helper()
	req := httptest.NewRequest(method, "/api/v1/me/preferences", strings.NewReader(body))
	if u != nil {
		req = withUser(req, *u)
	}
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, req)
	var out map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &out)
	return w.Code, out
}

func TestPreferencesDefaultEmpty(t *testing.T) {
	mux, users := prefsMux(t)
	u := newPrefsUser(t, users, "Mia Member", "mia@test.dev", "member")
	code, out := doPrefs(t, mux, &u, "GET", "")
	if code != http.StatusOK || len(out) != 0 {
		t.Fatalf("GET = %d %v, want 200 {}", code, out)
	}
}

func TestPreferencesRequireAuth(t *testing.T) {
	mux, _ := prefsMux(t)
	if code, _ := doPrefs(t, mux, nil, "GET", ""); code != http.StatusUnauthorized {
		t.Fatalf("GET without user = %d, want 401", code)
	}
	if code, _ := doPrefs(t, mux, nil, "PUT", `{"a":1}`); code != http.StatusUnauthorized {
		t.Fatalf("PUT without user = %d, want 401", code)
	}
}

func TestPreferencesMemberCanWriteOwn(t *testing.T) {
	// Workspace settings are admin-only; personal preferences are not.
	mux, users := prefsMux(t)
	u := newPrefsUser(t, users, "Mia Member", "mia@test.dev", "viewer")
	code, out := doPrefs(t, mux, &u, "PUT", `{"default_board_id":"b1","show_presence":false}`)
	if code != http.StatusOK {
		t.Fatalf("PUT = %d %v", code, out)
	}
	if out["default_board_id"] != "b1" || out["show_presence"] != false {
		t.Fatalf("PUT response = %v", out)
	}
	_, got := doPrefs(t, mux, &u, "GET", "")
	if got["default_board_id"] != "b1" || got["show_presence"] != false {
		t.Fatalf("GET after PUT = %v", got)
	}
}

func TestPreferencesArePerUser(t *testing.T) {
	mux, users := prefsMux(t)
	a := newPrefsUser(t, users, "Ann Admin", "ann@test.dev", "admin")
	b := newPrefsUser(t, users, "Bob Member", "bob@test.dev", "member")
	doPrefs(t, mux, &a, "PUT", `{"default_board_id":"board-a"}`)
	doPrefs(t, mux, &b, "PUT", `{"default_board_id":"board-b"}`)
	_, ga := doPrefs(t, mux, &a, "GET", "")
	_, gb := doPrefs(t, mux, &b, "GET", "")
	if ga["default_board_id"] != "board-a" || gb["default_board_id"] != "board-b" {
		t.Fatalf("a=%v b=%v", ga, gb)
	}
	// Even an admin only ever sees and changes their own object.
	c := newPrefsUser(t, users, "Cat Member", "cat@test.dev", "member")
	_, gc := doPrefs(t, mux, &c, "GET", "")
	if len(gc) != 0 {
		t.Fatalf("new user sees %v, want {}", gc)
	}
}

func TestPreferencesMergeAndNullRemoves(t *testing.T) {
	mux, users := prefsMux(t)
	u := newPrefsUser(t, users, "Mia Member", "mia@test.dev", "member")
	doPrefs(t, mux, &u, "PUT", `{"default_board_id":"b1","show_presence":false,"clear_done_disabled":{"b1":true}}`)
	code, out := doPrefs(t, mux, &u, "PUT", `{"show_presence":null,"clear_done_disabled":{"b2":true}}`)
	if code != http.StatusOK {
		t.Fatalf("PUT = %d %v", code, out)
	}
	if out["default_board_id"] != "b1" {
		t.Errorf("untouched key lost: %v", out)
	}
	if _, ok := out["show_presence"]; ok {
		t.Errorf("null did not remove show_presence: %v", out)
	}
	cd, _ := out["clear_done_disabled"].(map[string]any)
	if len(cd) != 1 || cd["b2"] != true {
		t.Errorf("object values are replaced, not deep-merged: %v", out["clear_done_disabled"])
	}
	// Removing a key that is not there is fine.
	if code, _ := doPrefs(t, mux, &u, "PUT", `{"nope":null}`); code != http.StatusOK {
		t.Errorf("removing a missing key = %d", code)
	}
}

func TestPreferencesRejectsBadShapes(t *testing.T) {
	mux, users := prefsMux(t)
	u := newPrefsUser(t, users, "Mia Member", "mia@test.dev", "member")
	for _, body := range []string{`not json`, `[1,2]`, `"x"`, `null`, `{"bad key":1}`, `{"":1}`, `{"` + strings.Repeat("k", 65) + `":1}`} {
		if code, out := doPrefs(t, mux, &u, "PUT", body); code != http.StatusBadRequest {
			t.Errorf("PUT %q = %d %v, want 400", body, code, out)
		}
	}
	many := map[string]int{}
	for i := 0; i <= repo.MaxPreferenceKeys; i++ {
		many["k"+strings.Repeat("x", i%10)+string(rune('a'+i%26))+string(rune('a'+i/26))] = i
	}
	body, _ := json.Marshal(many)
	if code, _ := doPrefs(t, mux, &u, "PUT", string(body)); code != http.StatusBadRequest {
		t.Errorf("PUT with %d keys = %d, want 400", len(many), code)
	}
}

func TestPreferencesSizeLimit(t *testing.T) {
	mux, users := prefsMux(t)
	u := newPrefsUser(t, users, "Mia Member", "mia@test.dev", "member")
	big := `{"note":"` + strings.Repeat("x", repo.MaxPreferenceBytes) + `"}`
	if code, _ := doPrefs(t, mux, &u, "PUT", big); code != http.StatusRequestEntityTooLarge {
		t.Fatalf("oversized body = %d, want 413", code)
	}
	// Two patches that each fit but together exceed the limit.
	half := strings.Repeat("y", repo.MaxPreferenceBytes/2+10)
	if code, _ := doPrefs(t, mux, &u, "PUT", `{"a":"`+half+`"}`); code != http.StatusOK {
		t.Fatalf("first half = %d", code)
	}
	if code, _ := doPrefs(t, mux, &u, "PUT", `{"b":"`+half+`"}`); code != http.StatusRequestEntityTooLarge {
		t.Fatalf("merged too large = %d, want 413", code)
	}
	_, got := doPrefs(t, mux, &u, "GET", "")
	if _, ok := got["b"]; ok {
		t.Fatal("rejected patch was stored")
	}
}
