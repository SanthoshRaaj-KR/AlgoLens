// Test server that simulates endpoints with known algorithmic complexity.
// Used to verify AlgoLens detects O(n), O(n²), and O(1) correctly.
// Run: go run ./test/server   (from the go/ directory)
package main

import (
	"fmt"
	"log"
	"net/http"
	"strconv"
	"time"
)

func main() {
	mux := http.NewServeMux()

	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintln(w, `{"status":"ok"}`)
	})

	// O(1) — ignores n entirely, always responds in ~1ms
	mux.HandleFunc("/constant", func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(1 * time.Millisecond)
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"complexity":"O(1)","n":%s}`, r.URL.Query().Get("n"))
	})

	// O(n) — sleeps n ms (capped at 500ms for safety)
	mux.HandleFunc("/linear", func(w http.ResponseWriter, r *http.Request) {
		n := parseN(r)
		sleep := time.Duration(n) * time.Millisecond
		if sleep > 500*time.Millisecond {
			sleep = 500 * time.Millisecond
		}
		time.Sleep(sleep)
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"complexity":"O(n)","n":%d}`, n)
	})

	// O(n²) — sleeps n² * 50µs (capped at 500ms for safety)
	mux.HandleFunc("/quadratic", func(w http.ResponseWriter, r *http.Request) {
		n := parseN(r)
		sleepUS := int64(n) * int64(n) * 50
		sleep := time.Duration(sleepUS) * time.Microsecond
		if sleep > 500*time.Millisecond {
			sleep = 500 * time.Millisecond
		}
		time.Sleep(sleep)
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"complexity":"O(n²)","n":%d}`, n)
	})

	log.Println("Test server listening on :9000")
	log.Println("  GET /constant?n=X  → O(1) ~1ms always")
	log.Println("  GET /linear?n=X    → O(n) sleeps n ms")
	log.Println("  GET /quadratic?n=X → O(n²) sleeps n²×50µs")
	log.Fatal(http.ListenAndServe(":9000", mux))
}

func parseN(r *http.Request) int {
	n, err := strconv.Atoi(r.URL.Query().Get("n"))
	if err != nil || n < 1 {
		return 1
	}
	return n
}
