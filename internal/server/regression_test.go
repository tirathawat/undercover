package server_test

import (
	"testing"

	"undercover/internal/game"
)

func TestWebSocketAbandonedRoomsReleaseCapacity(t *testing.T) {
	url := testServer(t)
	for range 25 {
		c := dial(t, url)
		for range 20 {
			act(t, c, game.Action{Type: "create", Name: "Host", PIN: testPIN})
			act(t, c, game.Action{Type: "leave"})
		}
	}
	probe := dial(t, url)
	act(t, probe, game.Action{Type: "create", Name: "New host", PIN: testPIN})
}

func TestWebSocketAllActivePlayersLeavingDeletesRoom(t *testing.T) {
	url := testServer(t)
	clients, sessions := roomClients(t, url, 4)
	act(t, clients[0], game.Action{Type: "start", StageID: clients[0].view.StageID})
	for _, c := range clients {
		waitFor(t, c, func(v game.View) bool { return v.Phase == "reveal" })
	}
	for _, c := range clients {
		act(t, c, game.Action{Type: "leave"})
	}
	probe := dial(t, url)
	response, err := probe.action(game.Action{
		Type: "join",
		Code: sessions[0].Code,
		Name: "New player",
		PIN:  testPIN,
	})
	if err != nil {
		t.Fatal(err)
	}
	if response.Reply.OK || response.Reply.Code != "SESSION" {
		t.Fatalf("unrecoverable room still exists: %+v", response.Reply)
	}
}

func TestWebSocketLeaveRetainsDisconnectedResumableSeat(t *testing.T) {
	url := testServer(t)
	clients, sessions := roomClients(t, url, 2)
	clients[1].conn.CloseNow()
	waitFor(t, clients[0], func(v game.View) bool { return !v.Players[1].Connected })
	act(t, clients[0], game.Action{Type: "leave"})
	resumed := dial(t, url)
	act(t, resumed, game.Action{Type: "resume", Code: sessions[1].Code, Token: sessions[1].Token})
	state := waitFor(t, resumed, func(v game.View) bool {
		return v.Self.ID == sessions[1].PlayerID
	})
	if len(state.Players) != 1 || !state.Players[0].Connected {
		t.Fatalf("disconnected seat lost after host left: %+v", state.Players)
	}
}

func TestWebSocketSuccessfulRepliesFollowCurrentState(t *testing.T) {
	url := testServer(t)
	host := dial(t, url)
	created := act(t, host, game.Action{Type: "create", Name: "Host", PIN: testPIN})
	if created.Reply.Room == nil || created.Reply.Room.Self.ID != created.Reply.Session.PlayerID {
		t.Fatal("entry must include its private state and session in one reply")
	}
	if host.view.Code != created.Reply.Session.Code {
		t.Fatal("create acknowledged before initial state")
	}
	guest := dial(t, url)
	act(t, guest, game.Action{Type: "join", Code: host.view.Code, Name: "Guest", PIN: testPIN})
	if len(guest.view.Players) != 2 {
		t.Fatal("join acknowledged before room state")
	}
	third := dial(t, url)
	session := act(t, third, game.Action{
		Type: "join",
		Code: host.view.Code,
		Name: "Third",
		PIN:  testPIN,
	}).Reply.Session
	waitFor(t, host, func(v game.View) bool { return len(v.Players) == 3 })
	settings := game.Settings{Category: "food", Undercovers: 1}
	act(t, host, game.Action{Type: "settings", StageID: host.view.StageID, Settings: &settings})
	if host.view.Settings != settings {
		t.Fatal("settings acknowledged before new state")
	}
	act(t, host, game.Action{Type: "start", StageID: host.view.StageID})
	if host.view.Phase != "reveal" {
		t.Fatal("start acknowledged before new phase")
	}
	resumed := dial(t, url)
	act(t, resumed, game.Action{Type: "resume", Code: session.Code, Token: session.Token})
	if resumed.view.Phase != "reveal" ||
		resumed.view.Self.ID != session.PlayerID ||
		resumed.view.Self.Word == nil {
		t.Fatal("resume acknowledged before current private state")
	}
}
