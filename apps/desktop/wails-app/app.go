package main

import (
	"context"
	"fmt"
)

type App struct {
	ctx context.Context
}

func NewApp() *App { return &App{} }

func (a *App) startup(ctx context.Context) { a.ctx = ctx }

func (a *App) AppName() string { return "Veyluro" }

func (a *App) StartGoogleOAuth(apiBase string) error {
	_ = apiBase
	return fmt.Errorf("google sign-in is not supported on desktop")
}
