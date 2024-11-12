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

build-be:
	mkdir -p $(DIST_DIR)
	cd $(CMD_DIR) && $(GOBUILD) -o ../../../$(DIST_DIR)/$(BINARY_NAME) -v
	cd ..

clean-be:
	$(GOCLEAN)
	rm -rf $(DIST_DIR)

test-be:
	cd $(BACKEND_DIR) && $(GOTEST) -v ./...

deps-be:
	cd $(BACKEND_DIR) && $(GOGET) ./...

deps-fe:
	cd $(FRONTEND_DIR) && yarn

build-fe:
	cd $(FRONTEND_DIR) && yarn build
	mkdir -p $(DIST_DIR)/web
	cp -r $(FRONTEND_DIR)/dist/* $(DIST_DIR)/web
	cd ..

clean-fe:
	rm -rf $(FRONTEND_DIR)/dist
	rm -rf $(DIST_DIR)/web

clean: clean-be clean-fe

build: deps-be build-be deps-fe build-fe


.PHONY: build-be clean-be test-be deps-be deps-fe build-fe clean-fe build clean
