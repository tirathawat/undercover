package game

import (
	"strings"
	"testing"
)

func TestWhiteGuyGuessMatchesCivilianWordCaseInsensitively(t *testing.T) {
	r := NewRoom("ABCDEF")
	session, err := r.Join("White Guy", 0, "012345")
	if err != nil {
		t.Fatal(err)
	}
	p := r.find(session.PlayerID)
	p.Role = RoleWhiteGuy
	p.Alive = false
	r.phase = PhaseGuess
	r.words = &Words{Civilian: "Netflix", Undercover: "YouTube"}
	id, role := p.ID, p.Role
	r.result = &VoteResult{EliminatedID: &id, Role: &role, Counts: map[string]int{}, TiedIDs: []string{}}

	if err := r.Apply(p.ID, Action{
		Type: ActionGuess, StageID: r.stageID, Text: strings.ToUpper(r.words.Civilian),
	}); err != nil {
		t.Fatal(err)
	}
	if r.winner == nil || *r.winner != TeamWhiteGuy || r.result.Guess == nil ||
		!r.result.Guess.Correct {
		t.Fatalf("case-insensitive guess state = %+v", r)
	}
}
