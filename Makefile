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

backend-mocks:
	@echo "Generating mocks for backend..."
	cd $(BACKEND_DIR) && mockery --all --recursive --output ./internal/testing/mocks --with-expecter --exported 

clean-be:
	@echo "Cleaning backend..."
	$(GOCLEAN)
	rm -rf $(DIST_DIR)

test-be:
	@echo "Running backend tests..."
	cd $(BACKEND_DIR) && $(GOTEST) -v ./...

test-be-coverage:
	@echo "Running backend tests with coverage..."
	cd $(BACKEND_DIR) && $(GOTEST) -v -coverprofile=coverage.out ./...
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
	mkdir -p $(DIST_DIR)/web
	cp -r $(FRONTEND_DIR)/dist/* $(DIST_DIR)/web
	cd ..

clean-fe:
	@echo "Cleaning frontend..."
	rm -rf $(FRONTEND_DIR)/dist
	rm -rf $(DIST_DIR)/web

clean: clean-be clean-fe

build: deps-be build-be deps-fe build-fe

test: test-be


.PHONY: build-be clean-be test-be deps-be deps-fe build-fe clean-fe build clean test
