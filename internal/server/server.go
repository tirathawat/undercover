package server

import (
	"context"
	"sync"
	"time"

	"undercover/internal/game"
)

const (
	maxPeers            = 1024
	maxRooms            = 500
	outboundQueueSize   = 32
	websocketReadLimit  = 16_384
	maxRequestIDLength  = 64
	actionLimit         = 40
	actionWindow        = 10 * time.Second
	writeTimeout        = 5 * time.Second
	heartbeatInterval   = 20 * time.Second
	heartbeatTimeout    = 10 * time.Second
	roomCleanupInterval = time.Minute
	roomRetention       = 6 * time.Hour
)

type Server struct {
	mu      sync.Mutex
	wg      sync.WaitGroup
	rooms   map[string]*game.Room
	peers   map[*peer]struct{}
	ctx     context.Context
	cancel  context.CancelFunc
	closing bool
	origins []string
	webDir  string
}

func New(webDir string, origins []string) *Server {
	ctx, cancel := context.WithCancel(context.Background())
	s := &Server{
		rooms:   make(map[string]*game.Room),
		peers:   make(map[*peer]struct{}),
		ctx:     ctx,
		cancel:  cancel,
		webDir:  webDir,
		origins: origins,
	}
	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		s.cleanup()
	}()
	return s
}

func (s *Server) Close() {
	s.mu.Lock()
	shouldCancel := !s.closing
	s.closing = true
	s.mu.Unlock()
	if shouldCancel {
		s.cancel()
	}
	s.wg.Wait()
}

func (s *Server) cleanup() {
	ticker := time.NewTicker(roomCleanupInterval)
	defer ticker.Stop()
	for {
		select {
		case <-s.ctx.Done():
			return
		case now := <-ticker.C:
			s.mu.Lock()
			s.removeExpiredRooms(now)
			s.mu.Unlock()
		}
	}
}

func (s *Server) removeExpiredRooms(now time.Time) {
	for code, room := range s.rooms {
		if !room.HasConnectedPlayers() && now.Sub(room.LastActive) > roomRetention {
			delete(s.rooms, code)
		}
	}
}
