package server

import (
	"testing"
	"time"

	"undercover/internal/game"
)

func TestRemoveExpiredRooms(t *testing.T) {
	now := time.Date(2026, 10, 2, 12, 0, 0, 0, time.UTC)
	type roomSpec struct {
		code      string
		age       time.Duration
		connected bool
	}
	tests := []struct {
		name      string
		rooms     []roomSpec
		wantCodes []string
	}{
		{
			name:      "retains disconnected room just before retention",
			rooms:     []roomSpec{{code: "BEFOR2", age: roomRetention - time.Nanosecond}},
			wantCodes: []string{"BEFOR2"},
		},
		{
			name:      "retains disconnected room exactly at retention",
			rooms:     []roomSpec{{code: "EXACT2", age: roomRetention}},
			wantCodes: []string{"EXACT2"},
		},
		{
			name:  "removes disconnected room after retention",
			rooms: []roomSpec{{code: "AFTER2", age: roomRetention + time.Nanosecond}},
		},
		{
			name:      "retains connected room after retention",
			rooms:     []roomSpec{{code: "ACTIVE", age: roomRetention + time.Hour, connected: true}},
			wantCodes: []string{"ACTIVE"},
		},
		{
			name: "removes only expired rooms",
			rooms: []roomSpec{
				{code: "EXPIRE", age: roomRetention + time.Nanosecond},
				{code: "RECENT", age: roomRetention - time.Minute},
				{code: "ONLINE", age: roomRetention + time.Hour, connected: true},
			},
			wantCodes: []string{"RECENT", "ONLINE"},
		},
		{name: "accepts empty room map"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := &Server{rooms: make(map[string]*game.Room)}
			for _, spec := range tt.rooms {
				room := game.NewRoom(spec.code)
				session, err := room.Join("Player", 0, "012345")
				if err != nil {
					t.Fatal(err)
				}
				if !spec.connected {
					room.Disconnect(session.PlayerID)
				}
				room.LastActive = now.Add(-spec.age)
				s.rooms[room.Code] = room
			}

			s.removeExpiredRooms(now)

			if len(s.rooms) != len(tt.wantCodes) {
				t.Fatalf("room count = %d, want %d", len(s.rooms), len(tt.wantCodes))
			}
			for _, code := range tt.wantCodes {
				if s.rooms[code] == nil {
					t.Errorf("room %q was removed", code)
				}
			}
		})
	}
}
