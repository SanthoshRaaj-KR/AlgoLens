package probe

import "testing"

func TestSubstituteN(t *testing.T) {
	cases := []struct {
		template string
		n        int
		want     string
	}{
		{"http://host/search?limit={{n}}", 64, "http://host/search?limit=64"},
		{`{"limit":{{n}},"offset":0}`, 128, `{"limit":128,"offset":0}`},
		{"no placeholder", 1, "no placeholder"},
		{"{{n}} and {{n}}", 8, "8 and 8"},
		{"http://host/items/{{n}}", 1, "http://host/items/1"},
	}

	for _, tc := range cases {
		got := substituteN(tc.template, tc.n)
		if got != tc.want {
			t.Errorf("substituteN(%q, %d) = %q; want %q", tc.template, tc.n, got, tc.want)
		}
	}
}

func TestResolvedURL(t *testing.T) {
	cfg := DefaultProbeConfig("http://localhost:9000/api?size={{n}}", "GET")
	got := cfg.resolvedURL(32)
	want := "http://localhost:9000/api?size=32"
	if got != want {
		t.Errorf("resolvedURL(32) = %q; want %q", got, want)
	}
}

func TestResolvedPayload(t *testing.T) {
	cfg := DefaultProbeConfig("http://localhost:9000/api", "POST")
	cfg.PayloadTemplate = `{"count":{{n}}}`

	got := cfg.resolvedPayload(16)
	want := `{"count":16}`
	if got != want {
		t.Errorf("resolvedPayload(16) = %q; want %q", got, want)
	}
}

func TestResolvedPayloadEmpty(t *testing.T) {
	cfg := DefaultProbeConfig("http://localhost:9000/api", "GET")
	if got := cfg.resolvedPayload(1); got != "" {
		t.Errorf("expected empty payload for GET, got %q", got)
	}
}
