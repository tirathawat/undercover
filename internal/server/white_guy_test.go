package server_test

import (
	"fmt"
	"strings"
	"testing"

	"undercover/internal/game"
)

func TestWebSocketWhiteGuyGuessRecoveryAndRematch(t *testing.T) {
	for _, correct := range []bool{true, false} {
		t.Run(fmt.Sprintf("correct=%t", correct), func(t *testing.T) {
			url := testServer(t)
			clients, sessions := roomClients(t, url, 5)
			settings := game.Settings{Category: game.CategoryFood, Undercovers: 1, WhiteGuys: 1}
			act(t, clients[0], game.Action{Type: game.ActionSettings, StageID: clients[0].view.StageID, Settings: &settings})
			act(t, clients[0], game.Action{Type: game.ActionStart, StageID: clients[0].view.StageID})
			white := -1
			wordCounts := map[string]int{}
			for index, c := range clients {
				v := waitFor(t, c, func(v game.View) bool { return v.Phase == game.PhaseReveal })
				if v.Words != nil || v.Winner != nil {
					t.Fatal("answers or winner revealed before play")
				}
				for _, p := range v.Players {
					if p.Role != "" {
						t.Fatal("role leaked in public players")
					}
				}
				if v.Self.Role == game.RoleWhiteGuy {
					white = index
					if v.Self.Word != nil {
						t.Fatal("White Guy received a word")
					}
				} else {
					if v.Self.Role != "" || v.Self.Word == nil {
						t.Fatal("word player has wrong private state")
					}
					wordCounts[*v.Self.Word]++
				}
				act(t, c, game.Action{Type: game.ActionReady, StageID: v.StageID})
			}
			if white < 0 {
				t.Fatal("no White Guy assigned")
			}
			whiteID := sessions[white].PlayerID
			civilianWord := ""
			for word, count := range wordCounts {
				if count == 3 {
					civilianWord = word
				}
			}
			if civilianWord == "" {
				t.Fatal("civilian word distribution incorrect")
			}
			current := waitFor(t, clients[0], func(v game.View) bool { return v.Phase == game.PhaseClue })
			if current.SpeakerID == nil || *current.SpeakerID == whiteID {
				t.Fatal("White Guy started the first clue")
			}
			for current.Phase == game.PhaseClue {
				for _, c := range clients {
					if c.view.Self.ID == *current.SpeakerID {
						waitFor(t, c, func(v game.View) bool { return v.StageID == current.StageID })
						act(t, c, game.Action{Type: game.ActionClue, StageID: current.StageID, Text: "คำใบ้"})
						current = c.view
						break
					}
				}
			}
			other := (white + 1) % len(clients)
			for index, c := range clients {
				v := waitFor(t, c, func(v game.View) bool { return v.Phase == game.PhaseVote })
				target := whiteID
				if index == white {
					target = sessions[other].PlayerID
				}
				act(t, c, game.Action{Type: game.ActionVote, StageID: v.StageID, TargetID: target})
			}
			for _, c := range clients {
				v := waitFor(t, c, func(v game.View) bool { return v.Phase == game.PhaseGuess })
				if v.Words != nil || v.Winner != nil || v.Result.Guess != nil || *v.Result.EliminatedID != whiteID {
					t.Fatal("guessing stage leaked answers or lost the guesser")
				}
			}
			unauthorized, err := clients[other].action(game.Action{Type: game.ActionGuess, StageID: clients[other].view.StageID, Text: civilianWord})
			if err != nil || unauthorized.Reply.OK || unauthorized.Reply.Code != string(game.ErrorCodeGame) {
				t.Fatalf("non-guesser was accepted: response=%+v error=%v", unauthorized.Reply, err)
			}
			clients[white].conn.CloseNow()
			observer := clients[other]
			waitFor(t, observer, func(v game.View) bool {
				return !v.Players[white].Connected
			})
			recovered := dial(t, url)
			act(t, recovered, game.Action{Type: game.ActionRecover, Code: sessions[white].Code, Name: fmt.Sprintf("Player %d", white+1), PIN: testPIN})
			if recovered.view.Phase != game.PhaseGuess || recovered.view.Self.Role != game.RoleWhiteGuy || recovered.view.Self.ID != whiteID {
				t.Fatal("PIN recovery lost the pending guess")
			}
			clients[white] = recovered
			guess := "คำทายที่ไม่มีในชุดคำ"
			if correct {
				guess = "  " + strings.ToUpper(civilianWord) + "  "
			}
			oldStage := recovered.view.StageID
			act(t, recovered, game.Action{Type: game.ActionGuess, StageID: oldStage, Text: guess})
			v := recovered.view
			if v.Result.Guess == nil || v.Result.Guess.Correct != correct || v.Result.Guess.Text != strings.TrimSpace(guess) {
				t.Fatal("guess outcome not published")
			}
			if correct {
				if v.Phase != game.PhaseFinished || v.Winner == nil || *v.Winner != game.TeamWhiteGuy || v.Words.Civilian != civilianWord {
					t.Fatal("correct guess did not give White Guy the sole win")
				}
			} else if v.Phase != game.PhaseResult || v.Words != nil || v.Winner != nil {
				t.Fatal("wrong guess did not preserve the ongoing game")
			}
			repeated, err := recovered.action(game.Action{Type: game.ActionGuess, StageID: oldStage, Text: civilianWord})
			if err != nil || repeated.Reply.OK {
				t.Fatal("second guess was accepted")
			}
			if correct {
				for _, c := range clients {
					waitFor(t, c, func(v game.View) bool { return v.Phase == game.PhaseFinished })
					if c.view.HostID == c.view.Self.ID {
						act(t, c, game.Action{Type: game.ActionRematch, StageID: c.view.StageID})
						if c.view.Phase != game.PhaseLobby || c.view.Self.Role != "" || c.view.Self.Word != nil || c.view.Result != nil || len(c.view.History) != 5 || c.view.Settings.WhiteGuys != 1 {
							t.Fatal("rematch did not reset secrets and retain settings/history")
						}
						break
					}
				}
			}
		})
	}
}
