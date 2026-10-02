package game_test

import (
	"testing"

	"undercover/internal/game"
)

func TestRemovingVoteCandidateInvalidatesStageAndPreservesOtherBallots(t *testing.T) {
	r, players := begin(t, 6)
	host := players[0].PlayerID
	clues(t, r, host)
	undercover := spyID(t, r, players)
	target := ""
	for _, p := range players[1:] {
		if p.PlayerID != undercover {
			target = p.PlayerID
			break
		}
	}
	others := []string{}
	for _, p := range players[1:] {
		if p.PlayerID != target {
			others = append(others, p.PlayerID)
		}
	}
	apply(t, r, host, game.Action{Type: "vote", TargetID: target})
	apply(t, r, others[0], game.Action{Type: "vote", TargetID: others[1]})
	oldStage := view(t, r, host).StageID
	r.Disconnect(target)
	apply(t, r, host, game.Action{Type: "remove", TargetID: target})
	current := view(t, r, host)
	if current.Phase != "vote" || current.StageID == oldStage {
		t.Fatal("changed ballot did not invalidate the old voting stage")
	}
	if current.Self.HasVoted || current.VoteCount != 1 {
		t.Fatal("removed-target ballot was not cleared")
	}
	if !view(t, r, others[0]).Self.HasVoted {
		t.Fatal("unaffected ballot was lost")
	}
	if err := r.Apply(host, game.Action{
		Type:     "vote",
		StageID:  oldStage,
		TargetID: others[1],
	}); err == nil {
		t.Fatal("vote from the old ballot accepted")
	}
	apply(t, r, host, game.Action{Type: "vote", TargetID: others[1]})
}

func TestResumablePlayersSurviveDisconnectButNotLeaving(t *testing.T) {
	for _, count := range []int{1, 6} {
		r, players := setup(t, count)
		if count > 1 {
			apply(t, r, players[0].PlayerID, game.Action{Type: "start"})
		}
		for _, p := range players {
			r.Disconnect(p.PlayerID)
		}
		if r.HasConnectedPlayers() || !r.HasResumablePlayers() {
			t.Fatal("disconnected seats must remain resumable")
		}
		for _, p := range players {
			apply(t, r, p.PlayerID, game.Action{Type: "leave"})
		}
		if r.HasResumablePlayers() {
			t.Fatal("departed players still retain resumable seats")
		}
	}
}

func TestHostCanFinishVoteAfterConnectedPlayersVote(t *testing.T) {
	r, players := begin(t, 4)
	host := players[0].PlayerID
	clues(t, r, host)
	undercover := spyID(t, r, players)
	r.Disconnect(players[3].PlayerID)
	stage := view(t, r, host).StageID
	if err := r.Apply(host, game.Action{Type: "finishVote", StageID: stage}); err == nil {
		t.Fatal("unfinished connected ballots accepted")
	}
	for _, p := range players[:3] {
		target := undercover
		if p.PlayerID == target {
			for _, other := range players {
				if other.PlayerID != target {
					target = other.PlayerID
					break
				}
			}
		}
		apply(t, r, p.PlayerID, game.Action{Type: "vote", TargetID: target})
	}
	if got := view(t, r, host).Phase; got != "vote" {
		t.Fatalf("vote prematurely completed: %s", got)
	}
	if err := r.Apply(players[1].PlayerID, game.Action{
		Type:    "finishVote",
		StageID: stage,
	}); err == nil {
		t.Fatal("non-host closed the vote")
	}
	apply(t, r, host, game.Action{Type: "finishVote"})
	result := view(t, r, host)
	if result.Phase != "finished" || result.Winner == nil || *result.Winner != "civilian" ||
		result.Result == nil || result.VoteCount != 3 {
		t.Fatalf("connected-only vote did not resolve correctly: %+v", result)
	}
}
