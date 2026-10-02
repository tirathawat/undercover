package server

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/coder/websocket"

	"undercover/internal/game"
)

type request struct {
	ID     string      `json:"id"`
	Action game.Action `json:"action"`
}

type reply struct {
	OK            bool               `json:"ok"`
	Error         string             `json:"error,omitempty"`
	Code          game.ErrorCode     `json:"code,omitempty"`
	MessageID     game.MessageID     `json:"messageId,omitempty"`
	MessageParams game.MessageParams `json:"messageParams,omitempty"`
	Session       *game.Session      `json:"session,omitempty"`
	Room          *game.View         `json:"room,omitempty"`
}

type outbound struct {
	data       []byte
	closeAfter bool
}

type peer struct {
	conn    *websocket.Conn
	ctx     context.Context
	cancel  context.CancelFunc
	out     chan outbound
	session *game.Session
}

func (s *Server) registerPeer(p *peer) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closing || len(s.peers) >= maxPeers {
		return false
	}
	s.wg.Add(1)
	s.peers[p] = struct{}{}
	return true
}

func (s *Server) unregisterPeer(p *peer) {
	defer s.wg.Done()
	s.detach(p)
}

func (s *Server) writeLoop(p *peer) {
	defer p.cancel()
	heartbeat := time.NewTicker(heartbeatInterval)
	defer heartbeat.Stop()
	for {
		select {
		case <-p.ctx.Done():
			return
		case message := <-p.out:
			ctx, cancel := context.WithTimeout(p.ctx, writeTimeout)
			err := p.conn.Write(ctx, websocket.MessageText, message.data)
			cancel()
			if err != nil || message.closeAfter {
				return
			}
		case <-heartbeat.C:
			ctx, cancel := context.WithTimeout(p.ctx, heartbeatTimeout)
			err := p.conn.Ping(ctx)
			cancel()
			if err != nil {
				return
			}
		}
	}
}

func (s *Server) readLoop(p *peer) {
	windowStart, actionCount := time.Now(), 0
	for {
		_, data, err := p.conn.Read(p.ctx)
		if err != nil {
			return
		}
		var req request
		decoder := json.NewDecoder(bytes.NewReader(data))
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&req); err != nil || req.ID == "" ||
			len(req.ID) > maxRequestIDLength || !json.Valid(data) {
			s.actionError(p, req.ID, game.NewError(
				game.ErrorCodeInvalid, game.MessageIDRequestInvalid, nil,
			))
			continue
		}
		if time.Since(windowStart) > actionWindow {
			windowStart = time.Now()
			actionCount = 0
		}
		actionCount++
		if actionCount > actionLimit {
			s.actionError(p, req.ID, game.NewError(
				game.ErrorCodeLimit, game.MessageIDActionRateLimited, nil,
			))
			continue
		}
		s.handle(p, req)
	}
}

func (s *Server) enqueue(p *peer, value any, closeAfter bool) {
	data, err := json.Marshal(value)
	if err != nil {
		slog.Error("encode game response", "error", err)
		p.cancel()
		return
	}
	select {
	case p.out <- outbound{data: data, closeAfter: closeAfter}:
	default:
		p.cancel()
	}
}

func (s *Server) sendReply(p *peer, id string, response reply) {
	s.enqueue(p, replyMessage{Type: messageTypeReply, ID: id, Reply: response}, false)
}
