package game_test

import (
	"encoding/json"
	"maps"
	"strings"
	"testing"

	"undercover/internal/game"
)

func TestRecoverPreservesSeatStateAndRotatesToken(t *testing.T) {
	r, players := begin(t, 4)
	clues(t, r, players[0].PlayerID)
	recovering := players[1]
	target := players[0].PlayerID
	if target == recovering.PlayerID {
		target = players[2].PlayerID
	}
	apply(t, r, recovering.PlayerID, game.Action{Type: "vote", TargetID: target})
	before := view(t, r, recovering.PlayerID)
	r.Disconnect(recovering.PlayerID)

	recovered, err := r.Recover("  PLAYER 2  ", testPIN)
	if err != nil {
		t.Fatal(err)
	}
	if recovered.PlayerID != recovering.PlayerID || recovered.Token == recovering.Token {
		t.Fatalf("recovered session = %+v, original = %+v", recovered, recovering)
	}
	if _, err := r.Resume(recovering.Token); err == nil {
		t.Fatal("old token resumed after PIN recovery")
	}
	after := view(t, r, recovered.PlayerID)
	if after.Self.ID != before.Self.ID || after.Self.Word == nil || before.Self.Word == nil ||
		*after.Self.Word != *before.Self.Word || !after.Self.HasVoted {
		t.Fatalf(
			"recovery lost identity, word, or vote: before=%+v after=%+v",
			before.Self,
			after.Self,
		)
	}
	if len(after.History) != len(before.History) || !after.Players[1].Alive ||
		!after.Players[1].Connected {
		t.Fatal("recovery lost history, alive state, or connection state")
	}
}

func TestRecoverKeepsVotedOutPlayerAsSpectator(t *testing.T) {
	r, players := begin(t, 4)
	clues(t, r, players[0].PlayerID)
	undercover := spyID(t, r, players)
	target := ""
	targetName := ""
	state := view(t, r, players[0].PlayerID)
	for _, p := range state.Players {
		if p.ID != undercover {
			target = p.ID
			targetName = p.Name
			break
		}
	}
	for _, p := range players {
		voteTarget := target
		if p.PlayerID == target {
			for _, other := range players {
				if other.PlayerID != target {
					voteTarget = other.PlayerID
					break
				}
			}
		}
		apply(t, r, p.PlayerID, game.Action{Type: "vote", TargetID: voteTarget})
	}

	var targetSession game.Session
	for _, p := range players {
		if p.PlayerID == target {
			targetSession = p
			break
		}
	}
	recovered, err := r.Recover(targetName, testPIN)
	if err != nil {
		t.Fatal(err)
	}
	if recovered.PlayerID != targetSession.PlayerID {
		t.Fatal("recovery changed voted-out player identity")
	}
	state = view(t, r, recovered.PlayerID)
	for _, p := range state.Players {
		if p.ID == recovered.PlayerID && p.Alive {
			t.Fatal("voted-out player became alive after recovery")
		}
	}
}

func TestRecoverUsesGenericCredentialErrorAndRevokesRemovedSeat(t *testing.T) {
	r, players := setup(t, 4)
	wrongPIN := recoveryError(t, r, "Player 2", "999999")
	unknownName := recoveryError(t, r, "Unknown", testPIN)
	malformedName := recoveryError(t, r, " ", testPIN)
	malformedPIN := recoveryError(t, r, "Player 2", "bad")
	for _, candidate := range []*game.Error{unknownName, malformedName, malformedPIN} {
		if wrongPIN.Code != candidate.Code || wrongPIN.Message != candidate.Message ||
			wrongPIN.MessageID != candidate.MessageID ||
			!maps.Equal(wrongPIN.Params, candidate.Params) {
			t.Fatalf("credential errors differ: wrong=%+v candidate=%+v", wrongPIN, candidate)
		}
	}
	if wrongPIN.MessageID != game.MessageIDRecoveryCredentialInvalid || len(wrongPIN.Params) != 0 {
		t.Fatalf("credential error metadata = %+v", wrongPIN)
	}

	apply(t, r, players[0].PlayerID, game.Action{Type: "start"})
	undercover := spyID(t, r, players)
	undercoverName := ""
	for _, p := range view(t, r, players[0].PlayerID).Players {
		if p.ID == undercover {
			undercoverName = p.Name
			break
		}
	}
	r.Disconnect(undercover)
	host := view(t, r, players[0].PlayerID).HostID
	apply(t, r, host, game.Action{Type: "remove", TargetID: undercover})
	apply(t, r, view(t, r, host).HostID, game.Action{Type: "rematch"})

	removedName := ""
	for _, p := range view(t, r, host).Players {
		if p.ID == undercover {
			removedName = p.Name
		}
	}
	if removedName != "" {
		t.Fatal("removed seat survived rematch")
	}
	revoked := recoveryError(t, r, undercoverName, testPIN)
	if revoked.Code != wrongPIN.Code || revoked.Message != wrongPIN.Message ||
		revoked.MessageID != wrongPIN.MessageID || !maps.Equal(revoked.Params, wrongPIN.Params) {
		t.Fatalf("revoked credential error differs: revoked=%+v wrong=%+v", revoked, wrongPIN)
	}
}

func TestRecoverRejectsExplicitlyLeftSeat(t *testing.T) {
	r, players := setup(t, 1)
	apply(t, r, players[0].PlayerID, game.Action{Type: "leave"})
	left := recoveryError(t, r, "Player 1", testPIN)
	unknown := recoveryError(t, r, "Unknown", testPIN)
	if left.Code != unknown.Code || left.Message != unknown.Message ||
		left.MessageID != unknown.MessageID || !maps.Equal(left.Params, unknown.Params) {
		t.Fatalf("left credential error differs: left=%+v unknown=%+v", left, unknown)
	}
}

func TestDisconnectedSeatsCanRecoverOrResumeAfterRematch(t *testing.T) {
	r, players := begin(t, 3)
	clues(t, r, players[0].PlayerID)
	undercover := spyID(t, r, players)
	for _, p := range players {
		target := undercover
		if p.PlayerID == undercover {
			for _, other := range players {
				if other.PlayerID != undercover {
					target = other.PlayerID
					break
				}
			}
		}
		apply(t, r, p.PlayerID, game.Action{Type: "vote", TargetID: target})
	}
	finished := view(t, r, players[0].PlayerID)
	if finished.Phase != "finished" || len(finished.History) != 3 {
		t.Fatalf(
			"game did not finish with history: phase=%q history=%d",
			finished.Phase,
			len(finished.History),
		)
	}

	r.Disconnect(players[1].PlayerID)
	r.Disconnect(players[2].PlayerID)
	apply(t, r, players[0].PlayerID, game.Action{Type: "rematch"})
	if got := len(view(t, r, players[0].PlayerID).Players); got != 3 {
		t.Fatalf("rematch player count = %d, want 3", got)
	}
	retained := view(t, r, players[1].PlayerID)
	if retained.Self.Word != nil || retained.Self.HasVoted || !retained.Players[1].Alive ||
		retained.Players[1].Ready || retained.Players[1].Role != "" {
		t.Fatalf(
			"retained seat did not reset for rematch: self=%+v player=%+v",
			retained.Self,
			retained.Players[1],
		)
	}
	if err := r.Apply(players[0].PlayerID, game.Action{
		Type:    "start",
		StageID: view(t, r, players[0].PlayerID).StageID,
	}); err == nil {
		t.Fatal("game started while retained players were disconnected")
	}

	recovered, err := r.Recover("Player 2", testPIN)
	if err != nil {
		t.Fatal(err)
	}
	if recovered.PlayerID != players[1].PlayerID ||
		len(view(t, r, recovered.PlayerID).History) != len(finished.History) {
		t.Fatal("PIN recovery after rematch lost identity or history")
	}
	resumed, err := r.Resume(players[2].Token)
	if err != nil {
		t.Fatal(err)
	}
	if resumed.PlayerID != players[2].PlayerID ||
		len(view(t, r, resumed.PlayerID).History) != len(finished.History) {
		t.Fatal("token resume after rematch lost identity or history")
	}
	apply(t, r, players[0].PlayerID, game.Action{Type: "start"})
}

func TestRecoveryCredentialDoesNotLeakInJSON(t *testing.T) {
	r := game.NewRoom("ABCDEF")
	session, err := r.Join("Player", 0, "654321")
	if err != nil {
		t.Fatal(err)
	}
	for name, value := range map[string]any{
		"room":    r,
		"session": session,
		"view":    view(t, r, session.PlayerID),
	} {
		data, err := json.Marshal(value)
		if err != nil {
			t.Fatal(err)
		}
		if strings.Contains(string(data), "654321") {
			t.Fatalf("PIN leaked in %s JSON: %s", name, data)
		}
	}
}

func recoveryError(t *testing.T, r *game.Room, name, pin string) *game.Error {
	t.Helper()
	_, err := r.Recover(name, pin)
	gameErr, ok := err.(*game.Error)
	if !ok {
		t.Fatalf("Recover(%q) error = %T %v", name, err, err)
	}
	return gameErr
}
