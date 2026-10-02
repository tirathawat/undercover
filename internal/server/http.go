package server

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"

	"github.com/coder/websocket"
)

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if _, err := w.Write([]byte(`{"ok":true}`)); err != nil {
			slog.Debug("health response failed", "error", err)
		}
	})
	mux.HandleFunc("GET /ws", s.serveSocket)
	mux.HandleFunc("GET /", s.serveWeb)
	return mux
}

func (s *Server) serveWeb(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Referrer-Policy", "same-origin")
	if _, err := os.Stat(filepath.Join(s.webDir, "index.html")); err != nil {
		http.Error(w, messageFrontendNotBuilt, http.StatusServiceUnavailable)
		return
	}
	if r.URL.Path != "/" {
		http.FileServer(http.Dir(s.webDir)).ServeHTTP(w, r)
		return
	}
	w.Header().Set("Cache-Control", "no-cache")
	http.ServeFile(w, r, filepath.Join(s.webDir, "index.html"))
}

func (s *Server) serveSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{OriginPatterns: s.origins})
	if err != nil {
		slog.Debug("websocket upgrade rejected", "error", err)
		return
	}
	conn.SetReadLimit(websocketReadLimit)
	ctx, cancel := context.WithCancel(s.ctx)
	p := &peer{conn: conn, ctx: ctx, cancel: cancel, out: make(chan outbound, outboundQueueSize)}
	if !s.registerPeer(p) {
		cancel()
		conn.CloseNow()
		return
	}
	defer s.unregisterPeer(p)
	defer func() { cancel(); conn.CloseNow() }()
	writerDone := make(chan struct{})
	go func() { defer close(writerDone); s.writeLoop(p) }()
	s.readLoop(p)
	cancel()
	<-writerDone
}
