package game_test

import (
	"encoding/json"
	"errors"
	"fmt"
	"testing"

	"undercover/internal/game"
)

func TestEnumBackedJSONPreservesWireShape(t *testing.T) {
	undercover := game.RoleUndercover
	civilian := game.RoleCivilian
	tests := []struct {
		name       string
		view       game.View
		wantPhase  string
		wantWinner string
		wantRole   string
	}{
		{
			name: "roles unavailable",
			view: game.View{
				Phase:   game.PhaseResult,
				Players: []game.PlayerView{{ID: "hidden"}},
				Result:  &game.VoteResult{},
			},
			wantPhase:  "result",
			wantWinner: "null",
			wantRole:   "null",
		},
		{
			name: "roles revealed",
			view: game.View{
				Phase:   game.PhaseFinished,
				Players: []game.PlayerView{{ID: "revealed", Role: game.RoleCivilian}},
				Result:  &game.VoteResult{Role: &undercover},
				Winner:  &civilian,
			},
			wantPhase:  "finished",
			wantWinner: `"civilian"`,
			wantRole:   `"undercover"`,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			data, err := json.Marshal(tc.view)
			if err != nil {
				t.Fatal(err)
			}
			var payload struct {
				Phase   string                       `json:"phase"`
				Players []map[string]json.RawMessage `json:"players"`
				Result  struct {
					Role json.RawMessage `json:"role"`
				} `json:"result"`
				Winner json.RawMessage `json:"winner"`
			}
			if err := json.Unmarshal(data, &payload); err != nil {
				t.Fatal(err)
			}
			if payload.Phase != tc.wantPhase {
				t.Errorf("phase = %q, want %q", payload.Phase, tc.wantPhase)
			}
			if string(payload.Winner) != tc.wantWinner {
				t.Errorf("winner = %s, want %s", payload.Winner, tc.wantWinner)
			}
			if string(payload.Result.Role) != tc.wantRole {
				t.Errorf("result.role = %s, want %s", payload.Result.Role, tc.wantRole)
			}
			role, hasRole := payload.Players[0]["role"]
			if tc.name == "roles unavailable" && hasRole {
				t.Errorf("hidden player role = %s, want omitted", role)
			}
			if tc.name == "roles revealed" && (!hasRole || string(role) != `"civilian"`) {
				t.Errorf("revealed player role = %s, want civilian", role)
			}
		})
	}
}

func TestDecodedEnumValuesUseExistingGameValidation(t *testing.T) {
	r, players := setup(t, 3)
	stageID := view(t, r, players[0].PlayerID).StageID

	var settingsAction game.Action
	settingsJSON := fmt.Sprintf(
		`{"type":"settings","stageId":%q,"settings":{"category":"food","undercovers":1}}`,
		stageID)
	if err := json.Unmarshal([]byte(settingsJSON), &settingsAction); err != nil {
		t.Fatal(err)
	}
	if string(settingsAction.Type) != "settings" || settingsAction.Settings == nil ||
		string(settingsAction.Settings.Category) != "food" {
		t.Fatalf("decoded settings action = %+v", settingsAction)
	}
	if err := r.Apply(players[0].PlayerID, settingsAction); err != nil {
		t.Fatalf("decoded settings action rejected: %v", err)
	}
	if got := string(view(t, r, players[0].PlayerID).Settings.Category); got != "food" {
		t.Fatalf("snapshot category = %q, want food", got)
	}

	for _, tc := range []struct {
		name string
		data string
	}{
		{
			name: "unknown action",
			data: fmt.Sprintf(`{"type":"dance","stageId":%q}`, stageID),
		},
		{
			name: "unknown category",
			data: fmt.Sprintf(
				`{"type":"settings","stageId":%q,`+
					`"settings":{"category":"unknown","undercovers":1}}`,
				stageID),
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var action game.Action
			if err := json.Unmarshal([]byte(tc.data), &action); err != nil {
				t.Fatal(err)
			}
			err := r.Apply(players[0].PlayerID, action)
			var gameErr *game.Error
			if !errors.As(err, &gameErr) || string(gameErr.Code) != "GAME" {
				t.Fatalf("Apply() error = %v, want GAME error", err)
			}
			if got := string(view(t, r, players[0].PlayerID).Settings.Category); got != "food" {
				t.Fatalf("rejected action changed category to %q", got)
			}
		})
	}
}
