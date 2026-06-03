//go:build localdev

package controllers

import "github.com/go-chi/chi/v5"

type StaticController struct{}

func NewStaticController() *StaticController {
	return &StaticController{}
}

// RegisterRoutes is a no-op in local dev — Vite serves the frontend.
func (sc *StaticController) RegisterRoutes(r chi.Router) {}
