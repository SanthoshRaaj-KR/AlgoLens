package api

import (
	"database/sql"
	"net/http"
	"os"
	"strings"
)

// NewRouter wires all public API routes and returns an http.Handler.
func NewRouter(db *sql.DB, sidecarURL string) http.Handler {
	mux := http.NewServeMux()

	h := &handler{db: db, sidecarURL: sidecarURL}

	mux.HandleFunc("GET /health", h.health)

	mux.HandleFunc("POST /api/probe", h.apiProbe)
	mux.HandleFunc("POST /api/stress", h.apiStress)
	mux.HandleFunc("POST /api/deployments", h.apiSaveDeployment)
	mux.HandleFunc("GET /api/deployments", h.apiListDeployments)
	mux.HandleFunc("GET /api/deployments/{id}", h.apiGetDeployment)
	mux.HandleFunc("GET /api/diff", h.apiDiff)
	mux.HandleFunc("GET /api/timeline", h.apiTimeline)
	mux.HandleFunc("POST /api/search", h.apiSearch)

	return corsMiddleware(mux)
}

// NewInternalRouter wires routes only reachable from localhost (no CORS).
// Bound to 127.0.0.1:8081 so the internet cannot reach it.
func NewInternalRouter(db *sql.DB, sidecarURL string) http.Handler {
	mux := http.NewServeMux()
	h := &handler{db: db, sidecarURL: sidecarURL}
	mux.HandleFunc("POST /internal/probe-once", h.apiProbeOnce)
	return mux
}

type handler struct {
	db         *sql.DB
	sidecarURL string
}

func (h *handler) health(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"status":"ok"}`))
}

// corsMiddleware adds CORS headers. In production set CORS_ORIGIN to the
// frontend origin (e.g. "https://app.example.com"). Unset = "*" for local dev.
func corsMiddleware(next http.Handler) http.Handler {
	allowed := strings.TrimSpace(os.Getenv("CORS_ORIGIN"))
	if allowed == "" {
		allowed = "*"
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if allowed == "*" {
			w.Header().Set("Access-Control-Allow-Origin", "*")
		} else if origin == allowed {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
