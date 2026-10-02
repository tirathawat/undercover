package game

import (
	"crypto/rand"
	"maps"
	mathrand "math/rand/v2"
	"slices"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

// The server serializes room access; room methods never perform network I/O.
type Room struct {
	Code           string
	LastActive     time.Time
	players        []*player
	hostID         string
	phase          Phase
	stageID        string
	game           int
	round          int
	settings       Settings
	order          []string
	turn           int
	votes          map[string]string
	voteCandidates []string
	result         *VoteResult
	winner         *WinningTeam
	words          *Words
	history        []HistoryEntry
	now            func() time.Time
}

func NewRoom(code string) *Room {
	return &Room{
		Code:       code,
		LastActive: time.Now(),
		phase:      PhaseLobby,
		stageID:    rand.Text(),
		settings: Settings{
			Category:    CategoryMix,
			Undercovers: 1,
		},
		votes:          make(map[string]string),
		players:        []*player{},
		history:        []HistoryEntry{},
		voteCandidates: []string{},
		now:            time.Now,
	}
}

func cleanText(value string, max int) (string, error) {
	text := strings.TrimSpace(value)
	if !utf8.ValidString(text) ||
		utf8.RuneCountInString(text) < 1 ||
		utf8.RuneCountInString(text) > max {
		return "", invalid(MessageIDTextLengthOutOfRange, MessageParams{"min": 1, "max": max})
	}
	if strings.ContainsFunc(text, unicode.IsControl) {
		return "", invalid(MessageIDTextContainsControlCharacter, nil)
	}
	return text, nil
}

func (r *Room) Apply(id string, a Action) error {
	p := r.find(id)
	if p == nil || p.token == "" {
		return sessionError(MessageIDSessionMembershipLost, nil)
	}
	if a.Type != ActionLeave && a.StageID != r.stageID {
		return invalid(MessageIDGameStateChanged, nil)
	}
	var err error
	switch a.Type {
	case ActionSettings:
		err = r.updateSettings(id, a.Settings)
	case ActionStart:
		err = r.start(id)
	case ActionReady:
		err = r.ready(p)
	case ActionClue:
		err = r.clue(p, a.Text)
	case ActionSkip:
		err = r.skip(id)
	case ActionVote:
		err = r.vote(p, a.TargetID)
	case ActionFinishVote:
		err = r.finishVote(id)
	case ActionGuess:
		err = r.guess(p, a.Text)
	case ActionSkipGuess:
		err = r.skipGuess(id)
	case ActionNext:
		err = r.next(id)
	case ActionRematch:
		err = r.rematch(id)
	case ActionRemove:
		err = r.removeAction(id, a.TargetID)
	case ActionLeave:
		r.remove(id)
	default:
		err = invalid(MessageIDActionNotSupported, nil)
	}
	if err == nil {
		r.touch()
	}
	return err
}

func (r *Room) Snapshot(id string) (View, error) {
	self := r.find(id)
	if self == nil {
		return View{}, sessionError(MessageIDSessionMembershipLost, nil)
	}
	_, voted := r.votes[id]
	v := View{
		Code:     r.Code,
		HostID:   r.hostID,
		StageID:  r.stageID,
		Phase:    r.phase,
		Game:     r.game,
		Round:    r.round,
		Settings: r.settings,
		Players:  make([]PlayerView, 0, len(r.players)),
		Self: SelfView{
			ID:       id,
			Word:     cloneString(self.word),
			HasVoted: voted,
		},
		VoteCount:      len(r.votes),
		VoteCandidates: append([]string{}, r.voteCandidates...),
		Winner:         cloneString(r.winner),
		History:        cloneHistory(r.history),
	}
	if self.Role == RoleWhiteGuy {
		v.Self.Role = self.Role
	}
	for _, p := range r.players {
		public := p.PlayerView
		if p.Alive && r.phase != PhaseFinished {
			public.Role = ""
		}
		v.Players = append(v.Players, public)
	}
	if r.phase == PhaseClue {
		id := r.order[r.turn]
		v.SpeakerID = &id
	}
	if r.phase == PhaseFinished && r.words != nil {
		words := *r.words
		v.Words = &words
	}
	if r.result != nil {
		result := *r.result
		result.EliminatedID = cloneString(r.result.EliminatedID)
		result.Role = cloneString(r.result.Role)
		result.Counts = maps.Clone(r.result.Counts)
		result.TiedIDs = append([]string{}, r.result.TiedIDs...)
		if r.result.Guess != nil {
			guess := *r.result.Guess
			result.Guess = &guess
		}
		v.Result = &result
	}
	return v, nil
}

func cloneString[T ~string](value *T) *T {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}

func cloneHistory(history []HistoryEntry) []HistoryEntry {
	cloned := append([]HistoryEntry{}, history...)
	for index := range cloned {
		cloned[index].MessageParams = cloneMessageParams(cloned[index].MessageParams)
	}
	return cloned
}

func (r *Room) requireHost(id string) error {
	if id != r.hostID {
		return invalid(MessageIDHostRequired, nil)
	}
	return nil
}

func (r *Room) requirePhase(phase Phase) error {
	if r.phase != phase {
		return invalid(MessageIDActionNotAllowedInPhase, nil)
	}
	return nil
}

func (r *Room) requireHostPhase(id string, phase Phase) error {
	if err := r.requireHost(id); err != nil {
		return err
	}
	return r.requirePhase(phase)
}

func (r *Room) beginStage(phase Phase) { r.phase = phase; r.stageID = rand.Text() }
func (r *Room) touch()                 { r.LastActive = time.Now() }

func (r *Room) checkTeamSizes(settings Settings) error {
	if settings.Undercovers < 1 || settings.Undercovers > 3 {
		return invalid(MessageIDUndercoverCountOutOfRange, nil)
	}
	if settings.WhiteGuys == 0 && settings.Undercovers*2 >= len(r.players) {
		return invalid(MessageIDTeamBalanceInvalid, nil)
	}
	if settings.WhiteGuys > 0 &&
		(settings.Undercovers+settings.WhiteGuys)*2 >= len(r.players) {
		minimum := 2*(settings.Undercovers+settings.WhiteGuys) + 1
		return invalid(MessageIDWhiteGuyTeamBalanceInvalid, MessageParams{"min": minimum})
	}
	return nil
}

func (r *Room) updateSettings(id string, settings *Settings) error {
	if err := r.requireHostPhase(id, PhaseLobby); err != nil {
		return err
	}
	if settings == nil {
		return invalid(MessageIDSettingsRequired, nil)
	}
	if settings.Category != CategoryMix && len(wordPairs[settings.Category]) == 0 {
		return invalid(MessageIDCategoryInvalid, nil)
	}
	if settings.Undercovers < 1 || settings.Undercovers > 3 {
		return invalid(MessageIDUndercoverCountOutOfRange, nil)
	}
	if settings.WhiteGuys < 0 || settings.WhiteGuys > 1 {
		return invalid(MessageIDWhiteGuyCountOutOfRange, nil)
	}
	if settings.WhiteGuys == 0 && len(r.players) >= 3 {
		if err := r.checkTeamSizes(*settings); err != nil {
			return err
		}
	}
	r.settings = *settings
	return nil
}

func (r *Room) start(id string) error {
	if err := r.requireHostPhase(id, PhaseLobby); err != nil {
		return err
	}
	if len(r.players) < 3 {
		return invalid(MessageIDMinimumPlayersRequired, nil)
	}
	if slices.ContainsFunc(r.players, func(p *player) bool { return !p.Connected }) {
		return invalid(MessageIDDisconnectedPlayersPresent, nil)
	}
	if len(r.history) > 1800 {
		return invalid(MessageIDRoomHistoryLimitApproaching, nil)
	}
	if err := r.checkTeamSizes(r.settings); err != nil {
		return err
	}
	r.assignWords()
	r.game++
	r.round = 0
	r.result = nil
	r.winner = nil
	clear(r.votes)
	r.voteCandidates = []string{}
	r.beginStage(PhaseReveal)
	return nil
}

func (r *Room) assignWords() {
	pairs := wordPairs[r.settings.Category]
	if r.settings.Category == CategoryMix {
		pairs = make([][2]string, 0)
		for _, category := range []Category{CategoryFood, CategoryPlaces, CategoryThings} {
			pairs = append(pairs, wordPairs[category]...)
		}
	}
	pair := pairs[mathrand.IntN(len(pairs))]
	if mathrand.IntN(2) == 1 {
		pair[0], pair[1] = pair[1], pair[0]
	}
	r.words = &Words{Civilian: pair[0], Undercover: pair[1]}
	order := slices.Clone(r.players)
	mathrand.Shuffle(len(order), func(i, j int) { order[i], order[j] = order[j], order[i] })
	for index, p := range order {
		p.Role = RoleCivilian
		word := pair[0]
		if index < r.settings.Undercovers {
			p.Role = RoleUndercover
			word = pair[1]
		} else if index < r.settings.Undercovers+r.settings.WhiteGuys {
			p.Role = RoleWhiteGuy
			p.word = nil
			p.Ready = false
			p.Alive = true
			continue
		}
		p.word = &word
		p.Ready = false
		p.Alive = true
	}
}

func (r *Room) advanceReveal() {
	if !slices.ContainsFunc(r.alivePlayers(), func(p *player) bool { return !p.Ready }) {
		r.beginRound()
	}
}

func (r *Room) ready(p *player) error {
	if err := r.requirePhase(PhaseReveal); err != nil {
		return err
	}
	if p.Alive {
		p.Ready = true
		r.advanceReveal()
	}
	return nil
}

func (r *Room) beginRound() {
	r.round++
	r.order = []string{}
	for _, p := range r.alivePlayers() {
		r.order = append(r.order, p.ID)
	}
	mathrand.Shuffle(len(r.order), func(i, j int) {
		r.order[i], r.order[j] = r.order[j], r.order[i]
	})
	if r.round == 1 {
		r.moveWhiteGuyFromFirst()
	}
	r.turn = 0
	r.result = nil
	clear(r.votes)
	r.voteCandidates = []string{}
	r.beginStage(PhaseClue)
}

func (r *Room) moveWhiteGuyFromFirst() {
	if len(r.order) < 2 || r.find(r.order[0]).Role != RoleWhiteGuy {
		return
	}
	index := 1 + mathrand.IntN(len(r.order)-1)
	r.order[0], r.order[index] = r.order[index], r.order[0]
}

func (r *Room) clue(p *player, text string) error {
	if err := r.requirePhase(PhaseClue); err != nil {
		return err
	}
	if r.order[r.turn] != p.ID {
		return invalid(MessageIDNotCurrentSpeaker, nil)
	}
	text, err := cleanText(text, 80)
	if err != nil {
		return err
	}
	r.addHistory(p, text)
	r.advanceTurn()
	return nil
}

func (r *Room) skip(id string) error {
	if err := r.requireHostPhase(id, PhaseClue); err != nil {
		return err
	}
	p := r.find(r.order[r.turn])
	if p.Connected {
		return invalid(MessageIDSpeakerStillConnected, nil)
	}
	message, err := NewMessage(MessageIDTurnSkippedDisconnectedPlayer, nil)
	if err != nil {
		return err
	}
	r.addSystemHistory(p, message)
	r.advanceTurn()
	return nil
}

func (r *Room) advanceTurn() {
	r.turn++
	if r.turn < len(r.order) {
		r.beginStage(PhaseClue)
		return
	}
	r.beginVote(r.aliveIDs())
}

func (r *Room) beginVote(candidates []string) {
	clear(r.votes)
	r.voteCandidates = slices.Clone(candidates)
	r.beginStage(PhaseVote)
}

func (r *Room) vote(p *player, targetID string) error {
	if err := r.requirePhase(PhaseVote); err != nil {
		return err
	}
	if !p.Alive {
		return invalid(MessageIDEliminatedPlayerCannotVote, nil)
	}
	if p.ID == targetID {
		return invalid(MessageIDSelfVoteNotAllowed, nil)
	}
	target := r.find(targetID)
	if target == nil || !target.Alive || !slices.Contains(r.voteCandidates, targetID) {
		return invalid(MessageIDVoteTargetInvalid, nil)
	}
	if _, exists := r.votes[p.ID]; exists {
		return invalid(MessageIDVoteAlreadyCast, nil)
	}
	r.votes[p.ID] = targetID
	if r.everyoneVoted(false) {
		r.resolveVote()
	}
	return nil
}

func (r *Room) everyoneVoted(onlyConnected bool) bool {
	for _, p := range r.alivePlayers() {
		if onlyConnected && !p.Connected {
			continue
		}
		if _, exists := r.votes[p.ID]; !exists {
			return false
		}
	}
	return true
}

func (r *Room) finishVote(id string) error {
	if err := r.requireHostPhase(id, PhaseVote); err != nil {
		return err
	}
	if !r.everyoneVoted(true) {
		return invalid(MessageIDConnectedPlayersPendingVote, nil)
	}
	if len(r.votes) == 0 {
		return invalid(MessageIDNoVotesCast, nil)
	}
	r.resolveVote()
	return nil
}

func (r *Room) resolveVote() {
	counts := make(map[string]int)
	maximum := 0
	for _, target := range r.votes {
		counts[target]++
		maximum = max(maximum, counts[target])
	}
	leaders := []string{}
	for _, id := range r.voteCandidates {
		if counts[id] == maximum && maximum > 0 {
			leaders = append(leaders, id)
		}
	}
	r.result = &VoteResult{Counts: counts, TiedIDs: []string{}}
	if len(leaders) == 1 {
		p := r.find(leaders[0])
		p.Alive = false
		id, role := p.ID, p.Role
		r.result.EliminatedID = &id
		r.result.Role = &role
	} else {
		r.result.TiedIDs = leaders
	}
	if r.result.Role != nil && *r.result.Role == RoleWhiteGuy {
		r.beginStage(PhaseGuess)
		return
	}
	r.beginStage(PhaseResult)
	r.checkWinner()
}

func (r *Room) guess(p *player, text string) error {
	if err := r.requirePhase(PhaseGuess); err != nil {
		return err
	}
	if r.result.EliminatedID == nil || p.ID != *r.result.EliminatedID {
		return invalid(MessageIDNotGuessingPlayer, nil)
	}
	text, err := cleanText(text, 80)
	if err != nil {
		return err
	}
	correct := strings.EqualFold(text, r.words.Civilian)
	r.result.Guess = &GuessResult{Text: text, Correct: correct}
	if correct {
		winner := TeamWhiteGuy
		r.winner = &winner
		r.beginStage(PhaseFinished)
		return nil
	}
	r.resolveAbandonedGuess()
	return nil
}

func (r *Room) skipGuess(id string) error {
	if err := r.requireHostPhase(id, PhaseGuess); err != nil {
		return err
	}
	guesser := r.find(*r.result.EliminatedID)
	if guesser.Connected {
		return invalid(MessageIDGuesserStillConnected, nil)
	}
	r.resolveAbandonedGuess()
	return nil
}

func (r *Room) resolveAbandonedGuess() {
	r.checkWinner()
	if r.winner == nil {
		r.beginStage(PhaseResult)
	}
}

func (r *Room) next(id string) error {
	if err := r.requireHostPhase(id, PhaseResult); err != nil {
		return err
	}
	candidates := []string{}
	for _, candidate := range r.result.TiedIDs {
		if p := r.find(candidate); p != nil && p.Alive {
			candidates = append(candidates, candidate)
		}
	}
	if len(candidates) >= 2 {
		r.beginVote(candidates)
	} else {
		r.beginRound()
	}
	return nil
}

func (r *Room) checkWinner() {
	undercovers, whiteGuys, civilians := 0, 0, 0
	for _, p := range r.alivePlayers() {
		switch p.Role {
		case RoleUndercover:
			undercovers++
		case RoleWhiteGuy:
			whiteGuys++
		case RoleCivilian:
			civilians++
		}
	}
	infiltrators := undercovers + whiteGuys
	if infiltrators == 0 {
		winner := TeamCivilian
		r.winner = &winner
	} else if infiltrators >= civilians {
		winner := TeamInfiltrators
		if whiteGuys == 0 {
			winner = TeamUndercover
		} else if undercovers == 0 {
			winner = TeamWhiteGuy
		}
		r.winner = &winner
	}
	if r.winner != nil {
		r.beginStage(PhaseFinished)
	}
}

func (r *Room) reset() {
	r.words = nil
	r.winner = nil
	r.result = nil
	r.round = 0
	clear(r.votes)
	r.voteCandidates = []string{}
	r.order = []string{}
	r.players = slices.DeleteFunc(r.players, func(p *player) bool { return p.token == "" })
	for _, p := range r.players {
		p.Alive = true
		p.Ready = false
		p.word = nil
		p.Role = ""
	}
	if r.find(r.hostID) == nil {
		r.transferHost()
	}
	r.beginStage(PhaseLobby)
}

func (r *Room) rematch(id string) error {
	if err := r.requireHostPhase(id, PhaseFinished); err != nil {
		return err
	}
	r.reset()
	return nil
}

func (r *Room) addHistory(p *player, text string) {
	r.history = append(r.history, HistoryEntry{
		ID:       rand.Text(),
		Game:     r.game,
		Round:    r.round,
		PlayerID: p.ID,
		Name:     p.Name,
		Avatar:   p.Avatar,
		Text:     text,
		Time:     time.Now().UnixMilli(),
	})
}

func (r *Room) addSystemHistory(p *player, message Message) {
	r.history = append(r.history, HistoryEntry{
		ID:            rand.Text(),
		Game:          r.game,
		Round:         r.round,
		PlayerID:      p.ID,
		Name:          p.Name,
		Avatar:        p.Avatar,
		Text:          message.Text,
		Time:          time.Now().UnixMilli(),
		MessageID:     message.ID,
		MessageParams: message.Params,
	})
}
