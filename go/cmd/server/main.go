package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/SanthoshRaaj-KR/algolens/internal/api"
	"github.com/SanthoshRaaj-KR/algolens/internal/store"
	"github.com/joho/godotenv"
)

const (
	sidecarURL = "http://localhost:8001"
	serverPort = ":8080"
)

func main() {
	// Load .env if present (ignored if missing)
	_ = godotenv.Load()

	// Wait for Python sidecar to be ready
	if err := waitForSidecar(sidecarURL+"/health", 30*time.Second); err != nil {
		log.Fatalf("Python sidecar not ready: %v", err)
	}
	log.Println("Python sidecar: OK")

	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Fatal("DATABASE_URL environment variable not set")
	}

	db, err := store.Open(dsn)
	if err != nil {
		log.Fatalf("Failed to open DB: %v", err)
	}
	defer db.Close()
	log.Println("Supabase: OK")

	// Wire up routes
	mux := api.NewRouter(db.DB, sidecarURL)

	log.Printf("AlgoLens API listening on %s\n", serverPort)
	if err := http.ListenAndServe(serverPort, mux); err != nil {
		log.Fatalf("Server error: %v", err)
	}
}

// waitForSidecar polls the sidecar health endpoint until it responds or times out.
func waitForSidecar(url string, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	client := &http.Client{Timeout: 2 * time.Second}
	for time.Now().Before(deadline) {
		resp, err := client.Get(url)
		if err == nil && resp.StatusCode == http.StatusOK {
			resp.Body.Close()
			return nil
		}
		fmt.Print(".")
		time.Sleep(1 * time.Second)
	}
	return fmt.Errorf("timed out after %s", timeout)
}
