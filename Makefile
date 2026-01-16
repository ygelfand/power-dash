SHELL := /bin/sh
VERSION ?= $(shell git describe --tags --always --dirty --match=v* 2> /dev/null || \
            echo v0)

.PHONY: help all fmt vet test build ui run-dev run-test web-dev

help: ## Display this help screen
	@echo "Usage: make [target]"
	@echo ""
	@echo "Targets:"
	@grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

all: fmt vet test ui build ## Run all checks, build UI, and build backend

fmt: ## Run go fmt
	go fmt ./...

vet: ## Run go vet
	go vet ./...

test: ## Run go test
	go test ./...

ui: ## Build the frontend (React)
	cd web && npm install && npm run build
	rm -rf internal/ui/dist
	mkdir -p internal/ui/dist
	cp -r web/dist/* internal/ui/dist/

build: ## Build the backend binary
	@go build \
        -tags release \
        -ldflags '-X github.com/ygelfand/power-dash/internal/cli.PowerDashVersion=$(VERSION)' \
        -o bin/power-dash cmd/power-dash/main.go

run-dev: build ## Run backend with hot-reloading frontend (requires 2 terminals or bg)
	@mkdir -p tmp/data
	@echo "Starting power-dash dev environment..."
	@echo "Backend: http://localhost:8080"
	@echo "Frontend: http://localhost:8000"
	@trap 'kill 0' EXIT; \
	(cd web && npm run dev) & \
	./bin/power-dash run --config fixtures/power-dash.yaml --log-level info --listen :8080

run-test: ui build ## Run backend with embedded frontend (production simulation)
	@mkdir -p tmp/data
	@echo "Starting power-dash in embedded (test) mode on port 8080..."
	@./bin/power-dash run --config fixtures/power-dash.yaml -log-level info --listen :8080

web-dev: ## Run just the frontend dev server
	cd web && npm run dev
