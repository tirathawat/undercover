package server

import (
	"crypto/rand"
	"errors"
	"log/slog"
	"regexp"
	"strings"

	"undercover/internal/game"
)

func (s *Server) handle(p *peer, req request) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.handleAction(p, req)
}

func (s *Server) handleAction(p *peer, req request) {
	switch req.Action.Type {
	case game.ActionCreate, game.ActionJoin, game.ActionResume, game.ActionRecover:
		s.handleRoomEntry(p, req)
	default:
		s.handleRoomAction(p, req)
	}
}

func (s *Server) handleRoomEntry(p *peer, req request) {
	session, room, err := s.joinRoom(p, req.Action)
	if err != nil {
		s.actionError(p, req.ID, err)
		return
	}
	p.session = &session
	view, err := room.Snapshot(session.PlayerID)
	if err != nil {
		s.actionError(p, req.ID, err)
		return
	}
	s.sendReply(p, req.ID, reply{OK: true, Session: &session, Room: &view})
	s.publish(room)
}

func (s *Server) handleRoomAction(p *peer, req request) {
	if p.session == nil {
		s.actionError(p, req.ID, game.NewError(
			game.ErrorCodeSession, game.MessageIDSessionRequired, nil,
		))
		return
	}
	room := s.rooms[p.session.Code]
	if room == nil {
		s.actionError(p, req.ID, game.NewError(
			game.ErrorCodeSession, game.MessageIDSessionRoomNotFound, nil,
		))
		return
	}
	message := removedMessage{Type: messageTypeRemoved, Reason: ""}
	if req.Action.Type == game.ActionRemove {
		var err error
		message, err = removedMessageFor(game.MessageIDRemovedByHost)
		if err != nil {
			s.actionError(p, req.ID, err)
			return
		}
	}
	if err := room.Apply(p.session.PlayerID, req.Action); err != nil {
		s.actionError(p, req.ID, err)
		return
	}
	s.notifyRemovedPeers(p, room, req.Action, message)
	s.publish(room)
	s.sendReply(p, req.ID, reply{OK: true})
	if !room.HasResumablePlayers() {
		delete(s.rooms, room.Code)
	}
}

func (s *Server) notifyRemovedPeers(
	actor *peer, room *game.Room, action game.Action, message removedMessage,
) {
	if action.Type != game.ActionLeave && action.Type != game.ActionRemove {
		return
	}
	targetID := action.TargetID
	if action.Type == game.ActionLeave {
		targetID = actor.session.PlayerID
	}
	for other := range s.peers {
		if other.session != nil && other.session.Code == room.Code &&
			other.session.PlayerID == targetID {
			other.session = nil
			s.enqueue(other, message, false)
		}
	}
}

var roomCodePattern = regexp.MustCompile(`^[A-Z2-9]{6}$`)

func (s *Server) joinRoom(p *peer, action game.Action) (game.Session, *game.Room, error) {
	if p.session != nil {
		return game.Session{}, nil, game.NewError(
			game.ErrorCodeGame, game.MessageIDAlreadyInRoom, nil,
		)
	}
	room, created, err := s.roomForAction(action)
	if err != nil {
		return game.Session{}, nil, err
	}
	message, err := removedMessageFor(game.MessageIDSeatReplaced)
	if err != nil {
		return game.Session{}, nil, err
	}
	session, err := seatForAction(room, action)
	if err != nil {
		return game.Session{}, nil, err
	}
	if created {
		s.rooms[room.Code] = room
	}
	s.replaceDuplicatePeer(p, session, message)
	return session, room, nil
}

func (s *Server) roomForAction(action game.Action) (*game.Room, bool, error) {
	code := strings.ToUpper(strings.TrimSpace(action.Code))
	if action.Type == game.ActionCreate {
		if len(s.rooms) >= maxRooms {
			return nil, false, game.NewError(
				game.ErrorCodeLimit, game.MessageIDRoomCapacityReached, nil,
			)
		}
		for {
			code = strings.ToUpper(rand.Text()[:6])
			if s.rooms[code] == nil {
				break
			}
		}
		return game.NewRoom(code), true, nil
	}
	if !roomCodePattern.MatchString(code) {
		return nil, false, game.NewError(
			game.ErrorCodeInvalid, game.MessageIDRoomCodeFormatInvalid, nil,
		)
	}
	room := s.rooms[code]
	if room == nil {
		return nil, false, game.NewError(game.ErrorCodeSession, game.MessageIDRoomNotFound, nil)
	}
	return room, false, nil
}

func seatForAction(room *game.Room, action game.Action) (game.Session, error) {
	switch action.Type {
	case game.ActionResume:
		return room.Resume(action.Token)
	case game.ActionRecover:
		return room.Recover(action.Name, action.PIN)
	default:
		return room.Join(action.Name, action.Avatar, action.PIN)
	}
}

func (s *Server) replaceDuplicatePeer(current *peer, session game.Session, message removedMessage) {
	for other := range s.peers {
		if other != current && other.session != nil &&
			other.session.Code == session.Code && other.session.PlayerID == session.PlayerID {
			other.session = nil
			s.enqueue(other, message, true)
		}
	}
}

func (s *Server) actionError(p *peer, id string, err error) {
	var gameErr *game.Error
	if errors.As(err, &gameErr) {
		s.sendReply(p, id, reply{
			Error: gameErr.Message, Code: gameErr.Code, MessageID: gameErr.MessageID,
			MessageParams: gameErr.Params,
		})
		return
	}
	slog.Error("game action failed", "error", err)
	unexpected := game.NewUnexpectedError()
	s.sendReply(p, id, reply{
		Error: unexpected.Message, Code: unexpected.Code, MessageID: unexpected.MessageID,
		MessageParams: unexpected.Params,
	})
}

func removedMessageFor(id game.MessageID) (removedMessage, error) {
	message, err := game.NewMessage(id, nil)
	if err != nil {
		return removedMessage{}, err
	}
	return removedMessage{
		Type: messageTypeRemoved, Reason: message.Text, MessageID: message.ID,
		MessageParams: message.Params,
	}, nil
}

func (s *Server) publish(room *game.Room) {
	for p := range s.peers {
		if p.session == nil || p.session.Code != room.Code {
			continue
		}
		view, err := room.Snapshot(p.session.PlayerID)
		if err != nil {
			continue
		}
		s.enqueue(p, stateMessage{Type: messageTypeState, Room: view}, false)
	}
}

func (s *Server) detach(p *peer) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.peers, p)
	if p.session == nil {
		return
	}
	if room := s.rooms[p.session.Code]; room != nil {
		room.Disconnect(p.session.PlayerID)
		s.publish(room)
	}
}
