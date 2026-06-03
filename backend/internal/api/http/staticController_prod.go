//go:build !localdev

package controllers

import (
	"embed"
	"io/fs"
	"net/http"

	"github.com/go-chi/chi/v5"
)

//go:embed all:frontend
var embeddedFrontend embed.FS

type StaticController struct{}

func NewStaticController() *StaticController {
	return &StaticController{}
}

func (sc *StaticController) RegisterRoutes(r chi.Router) {
	sub, err := fs.Sub(embeddedFrontend, "frontend")
	if err != nil {
		panic(err)
	}

	fileServer := http.FileServer(http.FS(sub))

	r.Handle("/assets/*", fileServer)

	for _, f := range []string{
		"/favicon.ico",
		"/site.webmanifest",
		"/favicon-32x32.png",
		"/favicon-16x16.png",
		"/apple-touch-icon.png",
		"/android-chrome-512x512.png",
		"/android-chrome-192x192.png",
	} {
		r.Handle(f, fileServer)
	}

	r.NotFound(func(w http.ResponseWriter, r *http.Request) {
		http.ServeFileFS(w, r, sub, "index.html")
	})
}
