package api

import (
	"database/sql"
	"net/http"
)

// NewRouter wires all API routes and returns an http.Handler.
func NewRouter(db *sql.DB, sidecarURL string) http.Handler {
	mux := http.NewServeMux()

	h := &handler{db: db, sidecarURL: sidecarURL}

	mux.HandleFunc("GET /health", h.health)

	return corsMiddleware(mux)
}

type handler struct {
	db         *sql.DB
	sidecarURL string
}

func (h *handler) health(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"status":"ok"}`))
}

// corsMiddleware adds permissive CORS headers for local dev.
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
