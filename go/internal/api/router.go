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

	// Phase 6 REST API
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
