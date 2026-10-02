package game_test

import (
	"encoding/json"
	"fmt"
	"slices"
	"strings"
	"testing"

	"undercover/internal/game"
)

const testPIN = "012345"

func setup(t *testing.T, count int) (*game.Room, []game.Session) {
	t.Helper()
	r := game.NewRoom("ABCDEF")
	players := make([]game.Session, 0, count)
	for index := range count {
		p, err := r.Join(fmt.Sprintf("Player %d", index+1), index%12, testPIN)
		if err != nil {
			t.Fatal(err)
		}
		players = append(players, p)
	}
	return r, players
}

func view(t *testing.T, r *game.Room, id string) game.View {
	t.Helper()
	v, err := r.Snapshot(id)
	if err != nil {
		t.Fatal(err)
	}
	return v
}

func apply(t *testing.T, r *game.Room, id string, action game.Action) {
	t.Helper()
	action.StageID = view(t, r, id).StageID
	if err := r.Apply(id, action); err != nil {
		t.Fatalf("%s: %v", action.Type, err)
	}
}

func begin(t *testing.T, count int) (*game.Room, []game.Session) {
	t.Helper()
	r, players := setup(t, count)
	apply(t, r, players[0].PlayerID, game.Action{Type: "start"})
	for _, p := range players {
		apply(t, r, p.PlayerID, game.Action{Type: "ready"})
	}
	return r, players
}

func clues(t *testing.T, r *game.Room, id string) {
	t.Helper()
	for v := view(t, r, id); v.Phase == "clue"; v = view(t, r, id) {
		apply(t, r, *v.SpeakerID, game.Action{Type: "clue", Text: "  คำใบ้ของฉัน  "})
	}
}

func spyID(t *testing.T, r *game.Room, players []game.Session) string {
	t.Helper()
	groups := make(map[string][]string)
	for _, p := range players {
		word := *view(t, r, p.PlayerID).Self.Word
		groups[word] = append(groups[word], p.PlayerID)
	}
	for _, group := range groups {
		if len(group) == 1 {
			return group[0]
		}
	}
	t.Fatal("expected exactly one undercover")
	return ""
}

func TestJoinValidation(t *testing.T) {
	for _, tc := range []struct {
		name     string
		nickname string
		avatar   int
	}{
		{"blank", " ", 0},
		{"long", strings.Repeat("ก", 21), 0},
		{"control", "a\nb", 0},
		{"negative avatar", "Bob", -1},
		{"large avatar", "Bob", 12},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := game.NewRoom("ABCDEF")
			if _, err := r.Join(tc.nickname, tc.avatar, testPIN); err == nil {
				t.Fatal("invalid join accepted")
			}
		})
	}
	r, _ := setup(t, 3)
	if _, err := r.Join("  player 1  ", 0, testPIN); err == nil {
		t.Fatal("duplicate name accepted")
	}
}

func TestJoinPINValidation(t *testing.T) {
	for _, pin := range []string{"", "12345", "1234567", "12345a", "１２３４５６", " 123456"} {
		r := game.NewRoom("ABCDEF")
		if _, err := r.Join("Player", 0, pin); err == nil {
			t.Fatalf("invalid PIN %q accepted", pin)
		}
	}
	r := game.NewRoom("ABCDEF")
	if _, err := r.Join("Player", 0, "000001"); err != nil {
		t.Fatalf("leading-zero PIN rejected: %v", err)
	}
}

func TestLargeRoomStartAndReadyGate(t *testing.T) {
	for _, count := range []int{13, 64, 128} {
		t.Run(fmt.Sprintf("%d players", count), func(t *testing.T) {
			r, players := setup(t, count)
			if got := len(view(t, r, players[0].PlayerID).Players); got != count {
				t.Fatalf("snapshot player count = %d, want %d", got, count)
			}
			apply(t, r, players[0].PlayerID, game.Action{Type: "start"})
			for _, p := range players[:len(players)-1] {
				apply(t, r, p.PlayerID, game.Action{Type: "ready"})
			}
			if got := view(t, r, players[0].PlayerID).Phase; got != "reveal" {
				t.Fatalf("phase before final ready = %q, want reveal", got)
			}
			apply(t, r, players[len(players)-1].PlayerID, game.Action{Type: "ready"})
			v := view(t, r, players[0].PlayerID)
			if v.Phase != "clue" || len(v.Players) != count {
				t.Fatalf("large room did not start: phase=%q players=%d", v.Phase, len(v.Players))
			}
		})
	}
}

func TestStartPermissionsAndTeamSizes(t *testing.T) {
	r, players := setup(t, 2)
	stage := view(t, r, players[0].PlayerID).StageID
	if err := r.Apply(players[0].PlayerID, game.Action{Type: "start", StageID: stage}); err == nil {
		t.Fatal("two-player start accepted")
	}
	p, err := r.Join("Third", 2, testPIN)
	if err != nil {
		t.Fatal(err)
	}
	if err := r.Apply(players[1].PlayerID, game.Action{Type: "start", StageID: stage}); err == nil {
		t.Fatal("non-host start accepted")
	}
	for _, settings := range []*game.Settings{
		nil,
		{Category: "invalid", Undercovers: 1},
		{Category: "mix", Undercovers: 0},
		{Category: "mix", Undercovers: 2},
	} {
		if err := r.Apply(players[0].PlayerID, game.Action{
			Type:     "settings",
			StageID:  stage,
			Settings: settings,
		}); err == nil {
			t.Fatal("invalid settings accepted")
		}
	}
	r.Disconnect(p.PlayerID)
	if err := r.Apply(players[0].PlayerID, game.Action{Type: "start", StageID: stage}); err == nil {
		t.Fatal("disconnected player start accepted")
	}
	if _, err := r.Resume(p.Token); err != nil {
		t.Fatal(err)
	}
	apply(t, r, players[0].PlayerID, game.Action{Type: "start"})
	if _, err := r.Join("Late", 0, testPIN); err == nil {
		t.Fatal("mid-game join accepted")
	}
}

func TestPrivateSnapshotsAndReadyGate(t *testing.T) {
	r, players := setup(t, 4)
	apply(t, r, players[0].PlayerID, game.Action{Type: "start"})
	for _, p := range players {
		v := view(t, r, p.PlayerID)
		if v.Self.Word == nil || v.Words != nil || v.Winner != nil {
			t.Fatal("invalid private word snapshot")
		}
		data, err := json.Marshal(v)
		if err != nil {
			t.Fatal(err)
		}
		for _, secret := range players {
			if strings.Contains(string(data), secret.Token) {
				t.Fatal("token leaked")
			}
		}
		for _, public := range v.Players {
			if public.Role != "" {
				t.Fatal("active role leaked")
			}
		}
		if p != players[len(players)-1] {
			apply(t, r, p.PlayerID, game.Action{Type: "ready"})
		}
	}
	if view(t, r, players[0].PlayerID).Phase != "reveal" {
		t.Fatal("started clues before everyone ready")
	}
	apply(t, r, players[3].PlayerID, game.Action{Type: "ready"})
	if view(t, r, players[0].PlayerID).Phase != "clue" {
		t.Fatal("all ready did not start clues")
	}
}

func TestLobbySnapshotJSONNullAndEmptyValues(t *testing.T) {
	r, players := setup(t, 1)
	data, err := json.Marshal(view(t, r, players[0].PlayerID))
	if err != nil {
		t.Fatal(err)
	}
	var payload struct {
		Self struct {
			Word json.RawMessage `json:"word"`
		} `json:"self"`
		SpeakerID      json.RawMessage `json:"speakerId"`
		VoteCandidates json.RawMessage `json:"voteCandidates"`
		Result         json.RawMessage `json:"result"`
		Winner         json.RawMessage `json:"winner"`
		Words          json.RawMessage `json:"words"`
		History        json.RawMessage `json:"history"`
	}
	if err := json.Unmarshal(data, &payload); err != nil {
		t.Fatal(err)
	}
	for name, value := range map[string]json.RawMessage{
		"self.word": payload.Self.Word,
		"speakerId": payload.SpeakerID,
		"result":    payload.Result,
		"winner":    payload.Winner,
		"words":     payload.Words,
	} {
		if string(value) != "null" {
			t.Errorf("%s = %s, want null", name, value)
		}
	}
	for name, value := range map[string]json.RawMessage{
		"voteCandidates": payload.VoteCandidates,
		"history":        payload.History,
	} {
		if string(value) != "[]" {
			t.Errorf("%s = %s, want []", name, value)
		}
	}
}

func TestClueTurnsAndStaleCommands(t *testing.T) {
	r, players := begin(t, 4)
	v := view(t, r, players[0].PlayerID)
	other := players[0].PlayerID
	if other == *v.SpeakerID {
		other = players[1].PlayerID
	}
	if err := r.Apply(other, game.Action{
		Type:    "clue",
		StageID: v.StageID,
		Text:    "hi",
	}); err == nil {
		t.Fatal("out-of-turn clue accepted")
	}
	if err := r.Apply(*v.SpeakerID, game.Action{
		Type:    "clue",
		StageID: v.StageID,
		Text:    " ",
	}); err == nil {
		t.Fatal("blank clue accepted")
	}
	apply(t, r, *v.SpeakerID, game.Action{Type: "clue", Text: "  อร่อยมาก  "})
	if err := r.Apply(*v.SpeakerID, game.Action{
		Type:    "clue",
		StageID: v.StageID,
		Text:    "duplicate",
	}); err == nil {
		t.Fatal("stale clue accepted")
	}
	clues(t, r, players[0].PlayerID)
	v = view(t, r, players[0].PlayerID)
	if v.Phase != "vote" || len(v.History) != 4 || v.History[0].Text != "อร่อยมาก" {
		t.Fatalf("incorrect clue transition/history: %s, %#v", v.Phase, v.History)
	}
}

func TestBallotPrivacyAndValidation(t *testing.T) {
	r, players := begin(t, 4)
	clues(t, r, players[0].PlayerID)
	stage := view(t, r, players[0].PlayerID).StageID
	for _, target := range []string{players[0].PlayerID, "nonexistent"} {
		if err := r.Apply(players[0].PlayerID, game.Action{
			Type:     "vote",
			StageID:  stage,
			TargetID: target,
		}); err == nil {
			t.Fatal("invalid vote accepted")
		}
	}
	apply(t, r, players[0].PlayerID, game.Action{Type: "vote", TargetID: players[1].PlayerID})
	if err := r.Apply(players[0].PlayerID, game.Action{
		Type:     "vote",
		StageID:  stage,
		TargetID: players[2].PlayerID,
	}); err == nil {
		t.Fatal("duplicate vote accepted")
	}
	v := view(t, r, players[1].PlayerID)
	if v.Self.HasVoted || v.VoteCount != 1 || v.Result != nil {
		t.Fatal("ballot leaked or vote status incorrect")
	}
	if err := r.Apply(players[0].PlayerID, game.Action{
		Type:    "finishVote",
		StageID: stage,
	}); err == nil {
		t.Fatal("premature close accepted")
	}
}

func TestTieRevote(t *testing.T) {
	r, players := begin(t, 4)
	clues(t, r, players[0].PlayerID)
	targets := []int{1, 0, 0, 1}
	for index, p := range players {
		apply(t, r, p.PlayerID, game.Action{
			Type:     "vote",
			TargetID: players[targets[index]].PlayerID,
		})
	}
	v := view(t, r, players[0].PlayerID)
	if v.Phase != "result" || v.Result.EliminatedID != nil || len(v.Result.TiedIDs) != 2 {
		t.Fatal("tie eliminated a player")
	}
	apply(t, r, v.HostID, game.Action{Type: "next"})
	v = view(t, r, players[0].PlayerID)
	if v.Phase != "vote" || !slices.Contains(v.VoteCandidates, players[0].PlayerID) ||
		len(v.VoteCandidates) != 2 {
		t.Fatal("revote candidates incorrect")
	}
	if err := r.Apply(players[0].PlayerID, game.Action{
		Type:     "vote",
		StageID:  v.StageID,
		TargetID: players[2].PlayerID,
	}); err == nil {
		t.Fatal("non-tied target accepted")
	}
}

func TestEliminatedRoleVisibleInResult(t *testing.T) {
	r, players := begin(t, 5)
	spy := spyID(t, r, players)
	clues(t, r, players[0].PlayerID)
	targetID := ""
	alternateID := ""
	for _, p := range players {
		if p.PlayerID != spy && targetID == "" {
			targetID = p.PlayerID
			continue
		}
		if p.PlayerID != targetID && alternateID == "" {
			alternateID = p.PlayerID
		}
	}
	for _, p := range players {
		voteTarget := targetID
		if p.PlayerID == targetID {
			voteTarget = alternateID
		}
		apply(t, r, p.PlayerID, game.Action{Type: "vote", TargetID: voteTarget})
	}
	v := view(t, r, players[0].PlayerID)
	if v.Phase != "result" ||
		v.Result == nil ||
		v.Result.Role == nil ||
		*v.Result.Role != "civilian" {
		t.Fatalf("eliminated role missing from result: %#v", v)
	}
	for _, p := range v.Players {
		if p.ID == targetID && p.Role != "civilian" {
			t.Fatalf("eliminated player role = %q, want civilian", p.Role)
		}
	}
}

func TestWinAndRematchHistory(t *testing.T) {
	for _, team := range []game.WinningTeam{"civilian", "undercover"} {
		t.Run(string(team), func(t *testing.T) {
			r, players := begin(t, 3)
			spy := spyID(t, r, players)
			target := spy
			if team == "undercover" {
				for _, p := range players {
					if p.PlayerID != spy {
						target = p.PlayerID
						break
					}
				}
			}
			clues(t, r, players[0].PlayerID)
			for _, p := range players {
				vote := target
				if p.PlayerID == target {
					for _, other := range players {
						if other.PlayerID != target {
							vote = other.PlayerID
							break
						}
					}
				}
				apply(t, r, p.PlayerID, game.Action{Type: "vote", TargetID: vote})
			}
			v := view(t, r, players[0].PlayerID)
			if v.Phase != "finished" || v.Winner == nil || *v.Winner != team || v.Words == nil {
				t.Fatalf("incorrect winner: %#v", v)
			}
			for _, public := range v.Players {
				if public.Role == "" {
					t.Fatal("final role missing")
				}
			}
			apply(t, r, v.HostID, game.Action{Type: "rematch"})
			v = view(t, r, players[0].PlayerID)
			if v.Phase != "lobby" || v.Self.Word != nil || len(v.History) != 3 {
				t.Fatal("rematch lost history or retained secret")
			}
			apply(t, r, v.HostID, game.Action{Type: "start"})
			if view(t, r, players[0].PlayerID).Game != 2 {
				t.Fatal("rematch did not increment game")
			}
		})
	}
}

func TestReconnectAndDisconnectedSpeaker(t *testing.T) {
	r, players := begin(t, 4)
	v := view(t, r, players[0].PlayerID)
	if err := r.Apply(v.HostID, game.Action{Type: "skip", StageID: v.StageID}); err == nil {
		t.Fatal("online speaker skipped")
	}
	r.Disconnect(*v.SpeakerID)
	v = view(t, r, players[0].PlayerID)
	apply(t, r, v.HostID, game.Action{Type: "skip"})
	if len(view(t, r, players[0].PlayerID).History) != 1 {
		t.Fatal("skip not recorded")
	}
	r.Disconnect(players[0].PlayerID)
	if view(t, r, players[1].PlayerID).HostID == players[0].PlayerID {
		t.Fatal("host not transferred")
	}
	if _, err := r.Resume("invalid"); err == nil {
		t.Fatal("invalid resume accepted")
	}
	p, err := r.Resume(players[0].Token)
	if err != nil || p.PlayerID != players[0].PlayerID {
		t.Fatal("valid resume failed")
	}
}

func TestRemoveRevokesSessionAndCanAdvanceReveal(t *testing.T) {
	r, players := setup(t, 5)
	apply(t, r, players[0].PlayerID, game.Action{Type: "start"})
	spy := spyID(t, r, players)
	var missing game.Session
	for _, p := range players {
		if p.PlayerID != players[0].PlayerID && p.PlayerID != spy {
			missing = p
			break
		}
	}
	for _, p := range players {
		if p.PlayerID != missing.PlayerID {
			apply(t, r, p.PlayerID, game.Action{Type: "ready"})
		}
	}
	r.Disconnect(missing.PlayerID)
	apply(t, r, players[0].PlayerID, game.Action{Type: "remove", TargetID: missing.PlayerID})
	if _, err := r.Resume(missing.Token); err == nil {
		t.Fatal("removed seat resumed")
	}
	if err := r.Apply(missing.PlayerID, game.Action{Type: "clue", Text: "hello"}); err == nil {
		t.Fatal("removed player sent clue")
	}
	if view(t, r, players[0].PlayerID).Phase != "clue" {
		t.Fatal("removing unready player did not advance reveal")
	}
}

func TestClueAndSnapshotIsolation(t *testing.T) {
	r, players := begin(t, 3)
	v := view(t, r, players[0].PlayerID)
	originalWord := *v.Self.Word
	*v.Self.Word = "mutated"
	if got := *view(t, r, players[0].PlayerID).Self.Word; got != originalWord {
		t.Fatalf("snapshot mutated private word: got %q, want %q", got, originalWord)
	}
	speaker := *v.SpeakerID
	for _, text := range []string{" ", strings.Repeat("ก", 81), "a\nb"} {
		if err := r.Apply(speaker, game.Action{
			Type:    "clue",
			StageID: v.StageID,
			Text:    text,
		}); err == nil {
			t.Fatal("invalid clue accepted")
		}
	}
	if err := r.Apply(speaker, game.Action{
		Type:    "chat",
		StageID: v.StageID,
		Text:    "hello",
	}); err == nil {
		t.Fatal("chat accepted in an in-person game")
	}
	apply(t, r, speaker, game.Action{Type: "clue", Text: "  อร่อย  "})
	v = view(t, r, players[0].PlayerID)
	v.History[0].Text = "mutated"
	v.Players[0].Name = "mutated"
	current := view(t, r, players[0].PlayerID)
	if current.History[0].Text != "อร่อย" || current.Players[0].Name == "mutated" {
		t.Fatal("snapshot can mutate authoritative state")
	}
}

func TestSystemHistoryMetadataDoesNotClassifyMatchingUserClue(t *testing.T) {
	r, players := begin(t, 3)
	v := view(t, r, players[0].PlayerID)
	speaker := *v.SpeakerID
	text := "ข้ามตา — ผู้เล่นหลุดการเชื่อมต่อ"
	apply(t, r, speaker, game.Action{Type: "clue", Text: text})
	userEntry := view(t, r, players[0].PlayerID).History[0]
	if userEntry.Text != text || userEntry.MessageID != "" || len(userEntry.MessageParams) != 0 {
		t.Fatalf("user clue metadata = %+v", userEntry)
	}
	userJSON, err := json.Marshal(userEntry)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(userJSON), "messageId") ||
		strings.Contains(string(userJSON), "messageParams") {
		t.Fatalf("user clue JSON contains system metadata: %s", userJSON)
	}

	v = view(t, r, players[0].PlayerID)
	disconnected := *v.SpeakerID
	r.Disconnect(disconnected)
	apply(t, r, view(t, r, players[0].PlayerID).HostID, game.Action{Type: "skip"})
	systemEntry := view(t, r, players[0].PlayerID).History[1]
	if systemEntry.Text != text ||
		systemEntry.MessageID != game.MessageIDTurnSkippedDisconnectedPlayer ||
		len(systemEntry.MessageParams) != 0 {
		t.Fatalf("system history metadata = %+v", systemEntry)
	}
	systemJSON, err := json.Marshal(systemEntry)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(
		string(systemJSON),
		`"messageId":"TURN_SKIPPED_DISCONNECTED_PLAYER"`,
	) || strings.Contains(string(systemJSON), "messageParams") {
		t.Fatalf("system history JSON = %s", systemJSON)
	}
}

func TestFinishedSnapshotPointerIsolation(t *testing.T) {
	r, players := begin(t, 3)
	spy := spyID(t, r, players)
	clues(t, r, players[0].PlayerID)
	for _, p := range players {
		target := spy
		if p.PlayerID == spy {
			for _, other := range players {
				if other.PlayerID != spy {
					target = other.PlayerID
					break
				}
			}
		}
		apply(t, r, p.PlayerID, game.Action{Type: "vote", TargetID: target})
	}

	v := view(t, r, players[0].PlayerID)
	winner := *v.Winner
	eliminatedID := *v.Result.EliminatedID
	role := *v.Result.Role
	*v.Winner = "mutated"
	*v.Result.EliminatedID = "mutated"
	*v.Result.Role = "mutated"

	current := view(t, r, players[0].PlayerID)
	if *current.Winner != winner ||
		*current.Result.EliminatedID != eliminatedID ||
		*current.Result.Role != role {
		t.Fatal("snapshot can mutate finished result")
	}
}

func TestRemoveCurrentAndUpcomingSpeakers(t *testing.T) {
	r, players := begin(t, 6)
	spy := spyID(t, r, players)
	pastSpeakers := make(map[string]bool)
	current := view(t, r, players[0].PlayerID)
	for len(pastSpeakers) == 0 || *current.SpeakerID == spy {
		speaker := *current.SpeakerID
		pastSpeakers[speaker] = true
		apply(t, r, speaker, game.Action{Type: "clue", Text: "first"})
		current = view(t, r, players[0].PlayerID)
	}
	currentSpeaker := *current.SpeakerID
	upcomingSpeaker := ""
	for _, p := range players {
		if !pastSpeakers[p.PlayerID] && p.PlayerID != currentSpeaker && p.PlayerID != spy {
			upcomingSpeaker = p.PlayerID
			break
		}
	}
	observerID := ""
	for _, p := range players {
		if p.PlayerID != upcomingSpeaker && p.PlayerID != currentSpeaker {
			observerID = p.PlayerID
			break
		}
	}
	r.Disconnect(upcomingSpeaker)
	apply(t, r, view(t, r, observerID).HostID, game.Action{
		Type:     "remove",
		TargetID: upcomingSpeaker,
	})
	afterUpcoming := view(t, r, observerID)
	if afterUpcoming.Phase != "clue" || afterUpcoming.StageID != current.StageID ||
		*afterUpcoming.SpeakerID != currentSpeaker ||
		len(afterUpcoming.History) != len(pastSpeakers) {
		t.Fatalf("removing upcoming speaker changed current turn: %#v", afterUpcoming)
	}

	r.Disconnect(currentSpeaker)
	apply(t, r, view(t, r, observerID).HostID, game.Action{
		Type:     "remove",
		TargetID: currentSpeaker,
	})
	afterCurrent := view(t, r, observerID)
	if afterCurrent.Phase != "clue" || afterCurrent.StageID == afterUpcoming.StageID ||
		*afterCurrent.SpeakerID == currentSpeaker ||
		len(afterCurrent.History) != len(pastSpeakers) {
		t.Fatalf("removing current speaker did not advance turn: %#v", afterCurrent)
	}
}

func TestRemoveFinalNonVoterResolvesVote(t *testing.T) {
	r, players := begin(t, 5)
	clues(t, r, players[0].PlayerID)
	spy := spyID(t, r, players)
	removedID := ""
	for _, p := range players {
		if p.PlayerID != spy {
			removedID = p.PlayerID
			break
		}
	}
	targetID := spy
	alternateID := ""
	for _, p := range players {
		if p.PlayerID != removedID && p.PlayerID != targetID {
			alternateID = p.PlayerID
			break
		}
	}
	observerID := ""
	for _, p := range players {
		if p.PlayerID != removedID {
			observerID = p.PlayerID
			break
		}
	}
	for _, p := range players {
		if p.PlayerID == removedID {
			continue
		}
		voteTarget := targetID
		if p.PlayerID == targetID {
			voteTarget = alternateID
		}
		apply(t, r, p.PlayerID, game.Action{Type: "vote", TargetID: voteTarget})
	}

	r.Disconnect(removedID)
	apply(t, r, view(t, r, observerID).HostID, game.Action{Type: "remove", TargetID: removedID})
	v := view(t, r, observerID)
	if v.Phase != "finished" ||
		v.Result == nil ||
		v.Result.EliminatedID == nil ||
		*v.Result.EliminatedID != targetID {
		t.Fatalf("removing final voter did not resolve vote: %#v", v)
	}
}

func TestResumeTransfersHostWhenEveryoneDisconnected(t *testing.T) {
	r, players := setup(t, 3)
	for _, p := range players {
		r.Disconnect(p.PlayerID)
	}
	if r.HasConnectedPlayers() {
		t.Fatal("room retained a connected player")
	}
	if _, err := r.Resume(players[2].Token); err != nil {
		t.Fatal(err)
	}
	if got := view(t, r, players[2].PlayerID).HostID; got != players[2].PlayerID {
		t.Fatalf("resumed player did not become host: got %q, want %q", got, players[2].PlayerID)
	}
}

func TestRunoffAdvancesWhenFinalistRemoved(t *testing.T) {
	r, players := begin(t, 6)
	clues(t, r, players[0].PlayerID)
	words := make(map[string]int)
	for _, p := range players {
		words[*view(t, r, p.PlayerID).Self.Word]++
	}
	finalist := ""
	for _, p := range players[1:] {
		if words[*view(t, r, p.PlayerID).Self.Word] > 1 {
			finalist = p.PlayerID
			break
		}
	}
	host := players[0].PlayerID
	remaining := 0
	for _, p := range players {
		target := host
		if p.PlayerID == host {
			target = finalist
		} else if p.PlayerID != finalist {
			if remaining >= 2 {
				target = finalist
			}
			remaining++
		}
		apply(t, r, p.PlayerID, game.Action{Type: "vote", TargetID: target})
	}
	apply(t, r, host, game.Action{Type: "next"})
	if view(t, r, host).Phase != "vote" {
		t.Fatal("runoff did not begin")
	}
	r.Disconnect(finalist)
	apply(t, r, host, game.Action{Type: "remove", TargetID: finalist})
	v := view(t, r, host)
	if v.Phase != "clue" || v.Round != 2 || len(v.VoteCandidates) != 0 || v.VoteCount != 0 {
		t.Fatalf("runoff stuck after removal: %#v", v)
	}
}
