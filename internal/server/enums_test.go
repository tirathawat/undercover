package server

import (
	"encoding/json"
	"errors"
	"testing"

	"undercover/internal/game"
)

func TestOutboundEnumsPreserveWireValues(t *testing.T) {
	t.Run("reply error", func(t *testing.T) {
		p := &peer{out: make(chan outbound, 1)}
		s := &Server{}
		s.actionError(p, "request-1", &game.Error{
			Message: "session expired",
			Code:    game.ErrorCodeSession,
		})

		message := <-p.out
		if got, want := string(message.data),
			`{"type":"reply","id":"request-1","reply":{"ok":false,`+
				`"error":"session expired","code":"SESSION"}}`; got != want {
			t.Fatalf("reply JSON = %s, want %s", got, want)
		}
	})

	t.Run("catalog reply error", func(t *testing.T) {
		p := &peer{out: make(chan outbound, 1)}
		s := &Server{}
		s.actionError(p, "request-2", game.NewError(
			game.ErrorCodeGame, game.MessageIDTextLengthOutOfRange,
			game.MessageParams{"min": 1, "max": 20},
		))

		message := <-p.out
		if got, want := string(message.data),
			`{"type":"reply","id":"request-2","reply":{"ok":false,`+
				`"error":"ข้อความต้องมี 1–20 ตัวอักษร","code":"GAME",`+
				`"messageId":"TEXT_LENGTH_OUT_OF_RANGE",`+
				`"messageParams":{"max":20,"min":1}}}`; got != want {
			t.Fatalf("reply JSON = %s, want %s", got, want)
		}
	})

	t.Run("unexpected error", func(t *testing.T) {
		p := &peer{out: make(chan outbound, 1)}
		s := &Server{}
		s.actionError(p, "request-3", errors.New("database unavailable"))

		message := <-p.out
		if got, want := string(message.data),
			`{"type":"reply","id":"request-3","reply":{"ok":false,`+
				`"error":"เกิดข้อผิดพลาด ลองอีกครั้ง","code":"GAME",`+
				`"messageId":"UNEXPECTED_GAME_ERROR"}}`; got != want {
			t.Fatalf("reply JSON = %s, want %s", got, want)
		}
	})

	t.Run("state", func(t *testing.T) {
		room := game.NewRoom("ABCDEF")
		session, err := room.Join("Host", 0, "012345")
		if err != nil {
			t.Fatal(err)
		}
		p := &peer{out: make(chan outbound, 1), session: &session}
		s := &Server{peers: map[*peer]struct{}{p: {}}}
		s.publish(room)

		var message struct {
			Type string `json:"type"`
			Room struct {
				Phase    string `json:"phase"`
				Settings struct {
					Category string `json:"category"`
				} `json:"settings"`
			} `json:"room"`
		}
		if err := json.Unmarshal((<-p.out).data, &message); err != nil {
			t.Fatal(err)
		}
		if message.Type != "state" ||
			message.Room.Phase != "lobby" ||
			message.Room.Settings.Category != "mix" {
			t.Fatalf("state message = %+v", message)
		}
	})

	t.Run("removed", func(t *testing.T) {
		room := game.NewRoom("ABCDEF")
		actorSession, err := room.Join("Host", 0, "012345")
		if err != nil {
			t.Fatal(err)
		}
		targetSession, err := room.Join("Guest", 1, "012345")
		if err != nil {
			t.Fatal(err)
		}
		actor := &peer{session: &actorSession}
		target := &peer{out: make(chan outbound, 1), session: &targetSession}
		s := &Server{peers: map[*peer]struct{}{target: {}}}
		removed, err := removedMessageFor(game.MessageIDRemovedByHost)
		if err != nil {
			t.Fatal(err)
		}
		s.notifyRemovedPeers(actor, room, game.Action{
			Type:     game.ActionRemove,
			TargetID: targetSession.PlayerID,
		}, removed)

		message := <-target.out
		if got, want := string(message.data),
			`{"type":"removed","reason":"เจ้าของห้องนำคุณออกจากห้องแล้ว",`+
				`"messageId":"REMOVED_BY_HOST"}`; got != want {
			t.Fatalf("removed JSON = %s, want %s", got, want)
		}
		if target.session != nil {
			t.Fatal("removed peer kept its session")
		}
	})

	t.Run("explicit leave keeps an empty reason", func(t *testing.T) {
		room := game.NewRoom("ABCDEF")
		session, err := room.Join("Host", 0, "012345")
		if err != nil {
			t.Fatal(err)
		}
		actor := &peer{out: make(chan outbound, 1), session: &session}
		s := &Server{peers: map[*peer]struct{}{actor: {}}}
		s.notifyRemovedPeers(
			actor,
			room,
			game.Action{Type: game.ActionLeave},
			removedMessage{
				Type:   messageTypeRemoved,
				Reason: "",
			},
		)

		if got, want := string((<-actor.out).data), `{"type":"removed","reason":""}`; got != want {
			t.Fatalf("leave JSON = %s, want %s", got, want)
		}
	})
}
