package settings

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/oceanplexian/lwts/server/internal/auth"
	"github.com/oceanplexian/lwts/server/internal/repo"
)

// GetPreferences returns the signed-in user's personal preferences
// (default board, toggles). Unlike the workspace settings they are never
// shared and every role can read and change its own.
func (h *Handler) GetPreferences(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		writeErr(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	prefs, err := h.prefs.Get(r.Context(), user.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "internal server error")
		return
	}
	writeJSON(w, http.StatusOK, prefs)
}

// PutPreferences merges a JSON object into the signed-in user's preferences:
// each top-level key replaces the stored value and a key set to null is removed.
// It responds with the whole object after the merge.
func (h *Handler) PutPreferences(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		writeErr(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, repo.MaxPreferenceBytes)
	var raw json.RawMessage
	if err := json.NewDecoder(r.Body).Decode(&raw); err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			writeErr(w, http.StatusRequestEntityTooLarge, "preferences too large")
			return
		}
		writeErr(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	var patch repo.Preferences
	if err := json.Unmarshal(raw, &patch); err != nil || patch == nil {
		writeErr(w, http.StatusBadRequest, "preferences must be a JSON object")
		return
	}

	prefs, err := h.prefs.Merge(r.Context(), user.ID, patch)
	switch {
	case errors.Is(err, repo.ErrPreferencesTooLarge):
		writeErr(w, http.StatusRequestEntityTooLarge, "preferences too large")
		return
	case errors.Is(err, repo.ErrInvalidPreferences):
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	case err != nil:
		writeErr(w, http.StatusInternalServerError, "internal server error")
		return
	}
	writeJSON(w, http.StatusOK, prefs)
}
