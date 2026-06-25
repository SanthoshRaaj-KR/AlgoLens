.PHONY: dev sidecar goserver frontend install install-py install-go install-frontend

# Start all three services
dev:
	@echo "==> Starting Python sidecar on :8001..."
	@start "AlgoLens-Sidecar" cmd /c "cd python && .venv\Scripts\activate && uvicorn main:app --port 8001 --reload"
	@echo "==> Starting Go API on :8080..."
	@start "AlgoLens-Go" cmd /c "cd go && go run ./cmd/server"
	@echo "==> Starting React frontend on :5173..."
	@start "AlgoLens-Frontend" cmd /c "cd frontend && npm run dev"
	@echo ""
	@echo "Services:"
	@echo "  Python sidecar: http://localhost:8001"
	@echo "  Go API:         http://localhost:8080"
	@echo "  Frontend:       http://localhost:5173"

# Run sidecar only
sidecar:
	cd python && .venv\Scripts\activate && uvicorn main:app --port 8001 --reload

# Run Go server only (expects sidecar already running)
goserver:
	cd go && go run ./cmd/server

# Run frontend only
frontend:
	cd frontend && npm run dev

# Install all dependencies
install: install-py install-frontend

install-py:
	@echo "==> Setting up Python venv..."
	cd python && python -m venv .venv && .venv\Scripts\activate && pip install -r requirements.txt

install-frontend:
	@echo "==> Installing frontend deps..."
	cd frontend && npm install

install-go:
	@echo "==> Downloading Go modules..."
	cd go && go mod download
