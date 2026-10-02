package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"undercover/internal/server"
)

func main() {
	if err := run(); err != nil {
		slog.Error("server stopped", "error", err)
		os.Exit(1)
	}
}

func run() error {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	webDir := os.Getenv("WEB_DIR")
	if webDir == "" {
		webDir = "dist"
	}
	origins := []string{}
	for _, origin := range strings.Split(os.Getenv("ALLOWED_ORIGINS"), ",") {
		if origin = strings.TrimSpace(origin); origin != "" {
			origins = append(origins, origin)
		}
	}
	app := server.New(webDir, origins)
	defer app.Close()
	httpServer := &http.Server{
		Addr:              ":" + port,
		Handler:           app.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    16_384,
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	stopped := make(chan error, 1)
	go func() { stopped <- httpServer.ListenAndServe() }()
	slog.Info("Undercover Club is ready", "url", "http://localhost:"+port)
	select {
	case err := <-stopped:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	case <-ctx.Done():
		app.Close()
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		return httpServer.Shutdown(shutdown)
	}
}
