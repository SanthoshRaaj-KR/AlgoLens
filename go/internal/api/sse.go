package api

import (
	"encoding/json"
	"fmt"
	"net/http"
)

// sseSetHeaders sets response headers required for a Server-Sent Events stream.
// Must be called before any write to the response writer.
func sseSetHeaders(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	// Prevent nginx/proxy from buffering the stream
	w.Header().Set("X-Accel-Buffering", "no")
}

// sseWrite marshals data as JSON and writes it as a single SSE event, then flushes.
// Returns an error if the client has disconnected or the write fails.
func sseWrite(w http.ResponseWriter, data any) error {
	b, err := json.Marshal(data)
	if err != nil {
		return err
	}
	if _, err = fmt.Fprintf(w, "data: %s\n\n", b); err != nil {
		return err
	}
	if f, ok := w.(http.Flusher); ok {
		f.Flush()
	}
	return nil
}

// sseError emits an error event to the stream and flushes.
// Used when a fatal error occurs mid-stream (after headers are already sent).
func sseError(w http.ResponseWriter, msg string) {
	_ = sseWrite(w, map[string]string{"type": "error", "message": msg})
}
