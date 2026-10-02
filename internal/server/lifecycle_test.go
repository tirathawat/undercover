package server

import (
	"testing"
	"time"
)

func TestCloseWaitsForRegisteredPeer(t *testing.T) {
	s := New(t.TempDir(), nil)
	p := &peer{}
	if !s.registerPeer(p) {
		t.Fatal("peer registration rejected before close")
	}
	registered := true
	t.Cleanup(func() {
		if registered {
			s.unregisterPeer(p)
		}
		s.Close()
	})

	closed := make(chan struct{})
	go func() {
		s.Close()
		close(closed)
	}()
	select {
	case <-s.ctx.Done():
	case <-time.After(time.Second):
		t.Fatal("Close did not cancel server context")
	}
	select {
	case <-closed:
		t.Fatal("Close returned before registered peer finished")
	default:
	}
	if s.registerPeer(&peer{}) {
		t.Fatal("peer registered after close started")
	}

	s.unregisterPeer(p)
	registered = false
	select {
	case <-closed:
	case <-time.After(time.Second):
		t.Fatal("Close did not return after registered peer finished")
	}
	s.Close()
}
