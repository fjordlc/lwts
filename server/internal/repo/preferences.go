package repo

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"time"

	"github.com/oceanplexian/lwts/server/internal/db"
)

// Limits for a user's preference object. They keep the store small: it holds
// UI choices (default board, toggles), not data.
const (
	MaxPreferenceBytes  = 64 * 1024 // encoded size of the stored object
	MaxPreferenceKeys   = 100
	MaxPreferenceKeyLen = 64
)

var preferenceKeyRe = regexp.MustCompile(`^[A-Za-z0-9_.:-]+$`)

var (
	// ErrPreferencesTooLarge is returned when the merged object would exceed MaxPreferenceBytes.
	ErrPreferencesTooLarge = errors.New("preferences too large")
	// ErrInvalidPreferences wraps every shape error (bad key, too many keys).
	ErrInvalidPreferences = errors.New("invalid preferences")
)

// Preferences is a user's preference object: top-level keys with arbitrary JSON values.
type Preferences map[string]json.RawMessage

// PreferenceRepository stores one JSON object of personal preferences per user.
type PreferenceRepository struct {
	ds db.Datasource
}

func NewPreferenceRepository(ds db.Datasource) *PreferenceRepository {
	return &PreferenceRepository{ds: ds}
}

// Get returns the user's preferences, or an empty object when none are stored.
func (r *PreferenceRepository) Get(ctx context.Context, userID string) (Preferences, error) {
	var val string
	err := r.ds.QueryRow(ctx, `SELECT value FROM user_preferences WHERE user_id = $1`, userID).Scan(&val)
	if err == db.ErrNoRows {
		return Preferences{}, nil
	}
	if err != nil {
		return nil, err
	}
	return decodePreferences(val), nil
}

// ValidatePreferencePatch checks the shape of a patch before it is merged.
func ValidatePreferencePatch(patch Preferences) error {
	if len(patch) > MaxPreferenceKeys {
		return fmt.Errorf("%w: at most %d keys", ErrInvalidPreferences, MaxPreferenceKeys)
	}
	for k := range patch {
		if len(k) == 0 || len(k) > MaxPreferenceKeyLen || !preferenceKeyRe.MatchString(k) {
			return fmt.Errorf("%w: invalid key %q", ErrInvalidPreferences, k)
		}
	}
	return nil
}

// Merge applies a shallow patch: each key replaces the stored value, and a key
// set to null is removed. It returns the stored object after the merge.
func (r *PreferenceRepository) Merge(ctx context.Context, userID string, patch Preferences) (Preferences, error) {
	if err := ValidatePreferencePatch(patch); err != nil {
		return nil, err
	}

	tx, err := r.ds.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	now := time.Now().UTC()
	// Make sure the row exists so it can be locked while it is read and rewritten.
	if _, err := tx.Exec(ctx,
		`INSERT INTO user_preferences (user_id, value, updated_at) VALUES ($1, '{}', $2)
		 ON CONFLICT (user_id) DO NOTHING`, userID, now); err != nil {
		return nil, err
	}
	sel := `SELECT value FROM user_preferences WHERE user_id = $1`
	if r.ds.DBType() == "postgres" {
		sel += ` FOR UPDATE`
	}
	var val string
	if err := tx.QueryRow(ctx, sel, userID).Scan(&val); err != nil {
		return nil, err
	}

	merged := decodePreferences(val)
	for k, v := range patch {
		if v == nil || bytes.Equal(bytes.TrimSpace(v), []byte("null")) {
			delete(merged, k)
			continue
		}
		merged[k] = v
	}
	if len(merged) > MaxPreferenceKeys {
		return nil, fmt.Errorf("%w: at most %d keys", ErrInvalidPreferences, MaxPreferenceKeys)
	}
	encoded, err := json.Marshal(merged)
	if err != nil {
		return nil, err
	}
	if len(encoded) > MaxPreferenceBytes {
		return nil, ErrPreferencesTooLarge
	}

	if _, err := tx.Exec(ctx,
		`UPDATE user_preferences SET value = $1, updated_at = $2 WHERE user_id = $3`,
		string(encoded), now, userID); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return decodePreferences(string(encoded)), nil
}

func decodePreferences(val string) Preferences {
	out := Preferences{}
	if err := json.Unmarshal([]byte(val), &out); err != nil || out == nil {
		return Preferences{}
	}
	return out
}
