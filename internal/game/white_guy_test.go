package game_test

import (
	"strings"
	"testing"

	"undercover/internal/game"
)

func setupWhiteGame(t *testing.T, count int) (*game.Room, []game.Session) {
	t.Helper()
	r, players := setup(t, count)
	apply(t, r, players[0].PlayerID, game.Action{
		Type: "settings",
		Settings: &game.Settings{
			Category:    game.CategoryFood,
			Undercovers: 1,
			WhiteGuys:   1,
		},
	})
	apply(t, r, players[0].PlayerID, game.Action{Type: "start"})
	return r, players
}

func whiteGuyID(t *testing.T, r *game.Room, players []game.Session) string {
	t.Helper()
	for _, p := range players {
		if view(t, r, p.PlayerID).Self.Role == game.RoleWhiteGuy {
			return p.PlayerID
		}
	}
	t.Fatal("white guy not assigned")
	return ""
}

func wordOwnerIDs(t *testing.T, r *game.Room, players []game.Session) (string, string) {
	t.Helper()
	groups := make(map[string][]string)
	for _, p := range players {
		self := view(t, r, p.PlayerID).Self
		if self.Word != nil {
			groups[*self.Word] = append(groups[*self.Word], p.PlayerID)
		}
	}
	var civilianWord, undercoverID string
	for word, ids := range groups {
		if len(ids) == 1 {
			undercoverID = ids[0]
		} else {
			civilianWord = word
		}
	}
	if civilianWord == "" || undercoverID == "" {
		t.Fatalf("assigned word groups = %#v", groups)
	}
	return civilianWord, undercoverID
}

func readyAll(t *testing.T, r *game.Room, players []game.Session) {
	t.Helper()
	for _, p := range players {
		apply(t, r, p.PlayerID, game.Action{Type: "ready"})
	}
}

func eliminate(t *testing.T, r *game.Room, players []game.Session, targetID string) {
	t.Helper()
	clues(t, r, players[0].PlayerID)
	for _, p := range players {
		target := targetID
		if p.PlayerID == targetID {
			for _, other := range players {
				if other.PlayerID != targetID {
					target = other.PlayerID
					break
				}
			}
		}
		apply(t, r, p.PlayerID, game.Action{Type: "vote", TargetID: target})
	}
}

func eliminateAlive(t *testing.T, r *game.Room, players []game.Session, targetID string) {
	t.Helper()
	clues(t, r, players[0].PlayerID)
	state := view(t, r, players[0].PlayerID)
	for _, p := range players {
		alive := false
		for _, public := range state.Players {
			if public.ID == p.PlayerID {
				alive = public.Alive
				break
			}
		}
		if !alive {
			continue
		}
		target := targetID
		if p.PlayerID == targetID {
			for _, other := range state.Players {
				if other.Alive && other.ID != targetID {
					target = other.ID
					break
				}
			}
		}
		apply(t, r, p.PlayerID, game.Action{Type: game.ActionVote, TargetID: target})
	}
}

func TestWhiteGuySettingsAndPrivateAssignment(t *testing.T) {
	r, players := setup(t, 5)
	if got := view(t, r, players[0].PlayerID).Settings.WhiteGuys; got != 0 {
		t.Fatalf("default white guys = %d, want 0", got)
	}
	for _, whiteGuys := range []int{-1, 2} {
		if err := r.Apply(players[0].PlayerID, game.Action{
			Type:    game.ActionSettings,
			StageID: view(t, r, players[0].PlayerID).StageID,
			Settings: &game.Settings{
				Category:    game.CategoryMix,
				Undercovers: 1,
				WhiteGuys:   whiteGuys,
			},
		}); err == nil {
			t.Fatalf("white guys %d accepted", whiteGuys)
		}
	}

	r, players = setupWhiteGame(t, 5)
	whiteID := whiteGuyID(t, r, players)
	for _, p := range players {
		v := view(t, r, p.PlayerID)
		if p.PlayerID == whiteID {
			if v.Self.Word != nil || v.Self.Role != game.RoleWhiteGuy {
				t.Fatalf("white self = %+v", v.Self)
			}
		} else if v.Self.Word == nil || v.Self.Role != "" {
			t.Fatalf("non-white self = %+v", v.Self)
		}
		for _, public := range v.Players {
			if public.Role != "" {
				t.Fatalf("active role leaked to %s: %+v", p.PlayerID, public)
			}
		}
	}
	readyAll(t, r, players)
	if got := *view(t, r, players[0].PlayerID).SpeakerID; got == whiteID {
		t.Fatal("white guy started the first clue round")
	}
}

func TestWhiteGuySettingRequiresCivilianMajority(t *testing.T) {
	for undercovers := 1; undercovers <= 3; undercovers++ {
		minimum := 2*(undercovers+1) + 1
		t.Run(string(rune('0'+undercovers))+" undercovers", func(t *testing.T) {
			settings := &game.Settings{
				Category: game.CategoryMix, Undercovers: undercovers, WhiteGuys: 1,
			}
			r, players := setup(t, minimum-1)
			apply(t, r, players[0].PlayerID, game.Action{
				Type: game.ActionSettings, Settings: settings,
			})
			err := r.Apply(players[0].PlayerID, game.Action{
				Type: game.ActionStart, StageID: view(t, r, players[0].PlayerID).StageID,
			})
			if err == nil || !strings.Contains(err.Error(), string(rune('0'+minimum))) {
				t.Fatalf("%d-player start error = %v, want minimum %d", minimum-1, err, minimum)
			}

			r, players = setup(t, minimum)
			apply(t, r, players[0].PlayerID, game.Action{
				Type: game.ActionSettings, Settings: settings,
			})
			apply(t, r, players[0].PlayerID, game.Action{Type: game.ActionStart})
		})
	}
}

func TestWhiteGuyInvalidGuessPreservesChance(t *testing.T) {
	for _, text := range []string{" ", "คำ\nทาย", strings.Repeat("ก", 81)} {
		r, players := setupWhiteGame(t, 5)
		whiteID := whiteGuyID(t, r, players)
		readyAll(t, r, players)
		eliminate(t, r, players, whiteID)
		pending := view(t, r, whiteID)
		err := r.Apply(whiteID, game.Action{
			Type: game.ActionGuess, StageID: pending.StageID, Text: text,
		})
		current := view(t, r, whiteID)
		if err == nil || current.Phase != game.PhaseGuess ||
			current.StageID != pending.StageID || current.Result.Guess != nil {
			t.Fatalf("invalid guess %q consumed chance: err=%v state=%+v", text, err, current)
		}
	}

	r, players := setupWhiteGame(t, 5)
	whiteID := whiteGuyID(t, r, players)
	readyAll(t, r, players)
	eliminate(t, r, players, whiteID)
	apply(t, r, whiteID, game.Action{Type: game.ActionGuess, Text: strings.Repeat("ก", 80)})
	if got := view(t, r, whiteID); got.Phase != game.PhaseResult || got.Result.Guess == nil {
		t.Fatalf("80-character guess was not accepted: %+v", got)
	}
}

func TestWhiteGuyCorrectGuessWinsAlone(t *testing.T) {
	r, players := setupWhiteGame(t, 5)
	whiteID := whiteGuyID(t, r, players)
	civilianWord, _ := wordOwnerIDs(t, r, players)
	readyAll(t, r, players)
	eliminate(t, r, players, whiteID)

	pending := view(t, r, players[0].PlayerID)
	if pending.Phase != game.PhaseGuess || pending.Winner != nil || pending.Result.Guess != nil ||
		pending.Result.Role == nil || *pending.Result.Role != game.RoleWhiteGuy {
		t.Fatalf("pending guess state = %+v", pending)
	}
	nonWhiteID := players[0].PlayerID
	if nonWhiteID == whiteID {
		nonWhiteID = players[1].PlayerID
	}
	if err := r.Apply(nonWhiteID, game.Action{
		Type: game.ActionGuess, StageID: pending.StageID, Text: civilianWord,
	}); err == nil {
		t.Fatal("non-white player submitted the guess")
	}
	apply(t, r, whiteID, game.Action{Type: game.ActionGuess, Text: "  " + civilianWord + "  "})

	finished := view(t, r, players[0].PlayerID)
	if finished.Phase != game.PhaseFinished || finished.Winner == nil ||
		*finished.Winner != game.TeamWhiteGuy || finished.Result.Guess == nil ||
		!finished.Result.Guess.Correct || finished.Result.Guess.Text != civilianWord {
		t.Fatalf("correct guess result = %+v", finished)
	}
	finished.Result.Guess.Text = "mutated"
	if current := view(t, r, players[0].PlayerID); current.Result.Guess.Text != civilianWord {
		t.Fatal("snapshot mutated white guy guess result")
	}
}

func TestWhiteGuyWrongGuessReturnsToRegularProgression(t *testing.T) {
	r, players := setupWhiteGame(t, 5)
	whiteID := whiteGuyID(t, r, players)
	readyAll(t, r, players)
	eliminate(t, r, players, whiteID)
	apply(t, r, whiteID, game.Action{Type: game.ActionGuess, Text: "ทายผิด"})

	result := view(t, r, players[0].PlayerID)
	if result.Phase != game.PhaseResult || result.Winner != nil || result.Result.Guess == nil ||
		result.Result.Guess.Correct || result.Result.Guess.Text != "ทายผิด" {
		t.Fatalf("wrong guess result = %+v", result)
	}
	if err := r.Apply(whiteID, game.Action{
		Type: game.ActionGuess, StageID: result.StageID, Text: "ทายอีกครั้ง",
	}); err == nil {
		t.Fatal("repeated guess accepted after the guess phase")
	}
	apply(t, r, result.HostID, game.Action{Type: game.ActionNext})
	if next := view(t, r, players[0].PlayerID); next.Phase != game.PhaseClue || next.Round != 2 {
		t.Fatalf("wrong guess next state = %+v", next)
	}
}

func TestWhiteGuyGuessWaitsAcrossDisconnectAndCanBeSkipped(t *testing.T) {
	r, players := setupWhiteGame(t, 5)
	whiteID := whiteGuyID(t, r, players)
	readyAll(t, r, players)
	eliminate(t, r, players, whiteID)
	pending := view(t, r, players[0].PlayerID)
	nonHost := players[1].PlayerID
	if nonHost == pending.HostID {
		nonHost = players[2].PlayerID
	}
	if err := r.Apply(nonHost, game.Action{
		Type: game.ActionSkipGuess, StageID: pending.StageID,
	}); err == nil {
		t.Fatal("non-host skipped the white guy guess")
	}
	if err := r.Apply(pending.HostID, game.Action{
		Type: game.ActionSkipGuess, StageID: pending.StageID,
	}); err == nil {
		t.Fatal("connected white guy guess was skipped")
	}

	r.Disconnect(whiteID)
	pending = view(t, r, players[0].PlayerID)
	apply(t, r, pending.HostID, game.Action{Type: game.ActionSkipGuess})
	result := view(t, r, players[0].PlayerID)
	if result.Phase != game.PhaseResult || result.Winner != nil || result.Result.Guess != nil {
		t.Fatalf("skipped guess result = %+v", result)
	}
	if _, err := r.Resume(sessionForID(players, whiteID).Token); err != nil {
		t.Fatalf("white guy could not resume after skipped guess: %v", err)
	}
}

func TestOtherRemovalDefersWinnerUntilWhiteGuyGuessResolves(t *testing.T) {
	r, players := setupWhiteGame(t, 5)
	whiteID := whiteGuyID(t, r, players)
	_, undercoverID := wordOwnerIDs(t, r, players)
	readyAll(t, r, players)
	eliminate(t, r, players, whiteID)

	removed := 0
	for _, p := range players {
		if p.PlayerID == whiteID || p.PlayerID == undercoverID {
			continue
		}
		state := view(t, r, players[0].PlayerID)
		if p.PlayerID == state.HostID {
			continue
		}
		r.Disconnect(p.PlayerID)
		apply(t, r, view(t, r, whiteID).HostID, game.Action{
			Type: game.ActionRemove, TargetID: p.PlayerID,
		})
		removed++
		if removed == 2 {
			break
		}
	}
	pending := view(t, r, whiteID)
	if removed != 2 || pending.Phase != game.PhaseGuess || pending.Winner != nil {
		t.Fatalf("guess did not remain pending after removals: removed=%d state=%+v", removed, pending)
	}
	apply(t, r, whiteID, game.Action{Type: game.ActionGuess, Text: "ผิด"})
	finished := view(t, r, whiteID)
	if finished.Phase != game.PhaseFinished || finished.Winner == nil ||
		*finished.Winner != game.TeamUndercover {
		t.Fatalf("deferred winner = %+v", finished)
	}
}

func TestWhiteGuyRemovalAbandonsGuessAndRevokesRecovery(t *testing.T) {
	r, players := setupWhiteGame(t, 5)
	whiteID := whiteGuyID(t, r, players)
	whiteSession := sessionForID(players, whiteID)
	readyAll(t, r, players)
	eliminate(t, r, players, whiteID)
	r.Disconnect(whiteID)
	apply(t, r, view(t, r, players[0].PlayerID).HostID, game.Action{
		Type: game.ActionRemove, TargetID: whiteID,
	})
	state := view(t, r, players[0].PlayerID)
	if state.Phase != game.PhaseResult || state.Result.Guess != nil {
		t.Fatalf("removed white guy state = %+v", state)
	}
	if _, err := r.Resume(whiteSession.Token); err == nil {
		t.Fatal("removed white guy retained recovery token")
	}
}

func TestWhiteGuyLeaveAbandonsGuess(t *testing.T) {
	r, players := setupWhiteGame(t, 5)
	whiteID := whiteGuyID(t, r, players)
	readyAll(t, r, players)
	eliminate(t, r, players, whiteID)
	apply(t, r, whiteID, game.Action{Type: game.ActionLeave})
	state := view(t, r, players[0].PlayerID)
	if state.Phase != game.PhaseResult || state.Winner != nil || state.Result.Guess != nil {
		t.Fatalf("white guy leave state = %+v", state)
	}
}

func TestMixedSurvivorsWinAsInfiltrators(t *testing.T) {
	r, players := setupWhiteGame(t, 5)
	whiteID := whiteGuyID(t, r, players)
	_, undercoverID := wordOwnerIDs(t, r, players)
	readyAll(t, r, players)
	target := ""
	for _, p := range players {
		if p.PlayerID != whiteID && p.PlayerID != undercoverID {
			target = p.PlayerID
			break
		}
	}
	eliminate(t, r, players, target)
	finished := view(t, r, players[0].PlayerID)
	if finished.Phase != game.PhaseFinished || finished.Winner == nil ||
		*finished.Winner != game.TeamInfiltrators {
		t.Fatalf("mixed survivor winner = %+v", finished)
	}
}

func TestWhiteGuyWinsBySurvivingToParity(t *testing.T) {
	r, players := setupWhiteGame(t, 5)
	whiteID := whiteGuyID(t, r, players)
	_, undercoverID := wordOwnerIDs(t, r, players)
	readyAll(t, r, players)
	eliminateAlive(t, r, players, undercoverID)

	for range 2 {
		state := view(t, r, whiteID)
		apply(t, r, state.HostID, game.Action{Type: game.ActionNext})
		state = view(t, r, whiteID)
		target := ""
		for _, public := range state.Players {
			if public.Alive && public.ID != whiteID {
				target = public.ID
				break
			}
		}
		eliminateAlive(t, r, players, target)
	}
	finished := view(t, r, whiteID)
	if finished.Phase != game.PhaseFinished || finished.Winner == nil ||
		*finished.Winner != game.TeamWhiteGuy {
		t.Fatalf("white guy survival winner = %+v", finished)
	}
}

func sessionForID(players []game.Session, id string) game.Session {
	for _, p := range players {
		if p.PlayerID == id {
			return p
		}
	}
	return game.Session{}
}
