BINARY_NAME=phi

GOCMD=go
GOBUILD=$(GOCMD) build
GOCLEAN=$(GOCMD) clean
GOTEST=$(GOCMD) test
GOGET=$(GOCMD) get

BACKEND_DIR=backend
FRONTEND_DIR=web
CMD_DIR=$(BACKEND_DIR)/cmd/phi
DIST_DIR=dist
VER=local

prepare-be:
	@echo "Preparing backend..."
	cd $(BACKEND_DIR) && go mod tidy
	cd $(BACKEND_DIR) && go mod download

build-be:
	@echo "Building backend..."
	mkdir -p $(DIST_DIR)
	cd $(CMD_DIR) && GOOS=linux GOARCH=amd64 CGO_ENABLED=0 $(GOBUILD) -o ../../../$(DIST_DIR)/$(BINARY_NAME) -v
	cd ..

run-be:
	@echo "Running backend (local dev, no embed)..."
	cd $(CMD_DIR) && go run -tags localdev . $(ARGS)

backend-mocks:
	@echo "Generating mocks for backend..."
	cd $(BACKEND_DIR) && mockery --all --recursive --output ./internal/testing/testdata --with-expecter --exported

clean-be:
	@echo "Cleaning backend..."
	$(GOCLEAN)
	rm -rf $(DIST_DIR)

test-be:
	@echo "Running backend tests..."
	cd $(BACKEND_DIR) && CGO_ENABLED=0 $(GOTEST) -v ./...

test-be-coverage:
	@echo "Running backend tests with coverage..."
	cd $(BACKEND_DIR) && CGO_ENABLED=0 $(GOTEST) -v -coverprofile=coverage.out ./...
	cd $(BACKEND_DIR) && $(GOCMD) tool cover -html=coverage.out -o coverage.html

deps-be:
	@echo "Installing backend dependencies..."
	cd $(BACKEND_DIR) && $(GOGET) ./...

deps-fe:
	@echo "Installing frontend dependencies..."
	cd $(FRONTEND_DIR) && yarn

build-fe:
	@echo "Building frontend..."
	cd $(FRONTEND_DIR) && echo "VITE_VERSION=$(VER)" > .env
	cd $(FRONTEND_DIR) && yarn build
	rm -rf $(BACKEND_DIR)/internal/api/http/frontend
	mkdir -p $(BACKEND_DIR)/internal/api/http/frontend
	cp -r $(FRONTEND_DIR)/dist/* $(BACKEND_DIR)/internal/api/http/frontend/
	cd ..

clean-fe:
	@echo "Cleaning frontend..."
	rm -rf $(FRONTEND_DIR)/dist
	rm -rf $(BACKEND_DIR)/internal/api/http/frontend

clean: clean-be clean-fe

swagger:
	@echo "Generating Swagger docs..."
	cd $(BACKEND_DIR) && swag init -g cmd/phi/main.go -o docs

build: deps-be deps-fe build-fe build-be

test: test-be


.PHONY: build-be run-be clean-be test-be deps-be deps-fe build-fe clean-fe build clean test swagger
