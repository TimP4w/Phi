package controllers

import (
	"net/http"

	"path/filepath"

	"github.com/go-chi/chi/v5"
)

type StaticController struct {
	frontendDir string
}

func NewStaticController(frontendDir string) *StaticController {
	controller := StaticController{
		frontendDir: frontendDir,
	}

	return &controller
}

func (sc *StaticController) RegisterRoutes(r chi.Router) {
	r.Handle("/assets/*", http.StripPrefix("/assets/", http.FileServer(http.Dir(filepath.Join(sc.frontendDir, "assets")))))

	staticFiles := []string{
		"/favicon.ico",
		"/site.webmanifest",
		"/favicon-32x32.png",
		"/favicon-16x16.png",
		"/apple-touch-icon.png",
		"/android-chrome-512x512.png",
		"/android-chrome-192x192.png",
	}

	for _, file := range staticFiles {
		r.Handle(file, http.FileServer(http.Dir(sc.frontendDir)))
	}

	r.NotFound(func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, filepath.Join(sc.frontendDir, "index.html"))
	})
}
