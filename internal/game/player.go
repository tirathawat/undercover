package game

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"slices"
	"strings"
	"time"
)

const (
	pinFailureLimit  = 5
	pinFailureWindow = time.Minute
	pinLength        = 6
	pinSaltSize      = 16
)

type player struct {
	PlayerView
	token          string
	word           *string
	pinSalt        [pinSaltSize]byte
	pinHash        [sha256.Size]byte
	pinSet         bool
	pinFailures    int
	pinWindowStart time.Time
}

func (r *Room) Join(name string, avatar int, pin string) (Session, error) {
	if r.phase != PhaseLobby {
		return Session{}, invalid(MessageIDGameAlreadyStarted, nil)
	}
	name, err := cleanText(name, 20)
	if err != nil {
		return Session{}, err
	}
	if avatar < 0 || avatar > 11 {
		return Session{}, invalid(MessageIDAvatarInvalid, nil)
	}
	if err := validatePIN(pin); err != nil {
		return Session{}, err
	}
	for _, p := range r.players {
		if strings.EqualFold(p.Name, name) {
			return Session{}, invalid(MessageIDPlayerNameAlreadyUsed, nil)
		}
	}
	p := &player{
		PlayerView: PlayerView{
			ID:        rand.Text(),
			Name:      name,
			Avatar:    avatar,
			Connected: true,
			Alive:     true,
		},
		token: rand.Text(),
	}
	p.setPIN(pin)
	r.players = append(r.players, p)
	if r.hostID == "" {
		r.hostID = p.ID
	}
	r.touch()
	return Session{Code: r.Code, PlayerID: p.ID, Token: p.token}, nil
}

func (r *Room) Resume(token string) (Session, error) {
	for _, p := range r.players {
		if token != "" && p.token == token {
			return r.resume(p), nil
		}
	}
	return Session{}, sessionError(MessageIDResumeCredentialInvalid, nil)
}

func (r *Room) Recover(name, pin string) (Session, error) {
	name, err := cleanText(name, 20)
	if err != nil {
		return Session{}, sessionError(MessageIDRecoveryCredentialInvalid, nil)
	}
	p := r.findByName(name)
	if p == nil || !p.pinSet {
		return Session{}, sessionError(MessageIDRecoveryCredentialInvalid, nil)
	}
	now := r.now()
	if p.pinLimitActive(now) {
		return Session{}, limitError(MessageIDRecoveryRateLimited, nil)
	}
	if validatePIN(pin) != nil || !p.matchesPIN(pin) {
		p.recordPINFailure(now)
		return Session{}, sessionError(MessageIDRecoveryCredentialInvalid, nil)
	}
	p.resetPINFailures()
	p.token = rand.Text()
	return r.resume(p), nil
}

func (r *Room) resume(p *player) Session {
	p.Connected = true
	host := r.find(r.hostID)
	if host == nil || !host.Connected {
		r.hostID = p.ID
	}
	r.touch()
	return Session{Code: r.Code, PlayerID: p.ID, Token: p.token}
}

func validatePIN(pin string) error {
	if len(pin) != pinLength {
		return invalid(MessageIDPINFormatInvalid, nil)
	}
	for index := range len(pin) {
		if pin[index] < '0' || pin[index] > '9' {
			return invalid(MessageIDPINFormatInvalid, nil)
		}
	}
	return nil
}

func (p *player) setPIN(pin string) {
	rand.Read(p.pinSalt[:])
	p.pinHash = hashPIN(p.pinSalt, pin)
	p.pinSet = true
}

func (p *player) matchesPIN(pin string) bool {
	hash := hashPIN(p.pinSalt, pin)
	return subtle.ConstantTimeCompare(p.pinHash[:], hash[:]) == 1
}

func hashPIN(salt [pinSaltSize]byte, pin string) [sha256.Size]byte {
	var input [pinSaltSize + pinLength]byte
	copy(input[:pinSaltSize], salt[:])
	copy(input[pinSaltSize:], pin)
	return sha256.Sum256(input[:])
}

func (p *player) pinLimitActive(now time.Time) bool {
	if p.pinFailures < pinFailureLimit {
		return false
	}
	if now.Sub(p.pinWindowStart) < pinFailureWindow {
		return true
	}
	p.resetPINFailures()
	return false
}

func (p *player) recordPINFailure(now time.Time) {
	if p.pinWindowStart.IsZero() || now.Sub(p.pinWindowStart) >= pinFailureWindow {
		p.pinWindowStart = now
		p.pinFailures = 0
	}
	p.pinFailures++
}

func (p *player) resetPINFailures() {
	p.pinFailures = 0
	p.pinWindowStart = time.Time{}
}

func (p *player) revokeCredentials() {
	p.token = ""
	clear(p.pinSalt[:])
	clear(p.pinHash[:])
	p.pinSet = false
	p.resetPINFailures()
}

func (r *Room) Disconnect(id string) {
	p := r.find(id)
	if p == nil {
		return
	}
	p.Connected = false
	if id == r.hostID {
		r.transferHost()
	}
	r.touch()
}

func (r *Room) HasConnectedPlayers() bool {
	return slices.ContainsFunc(r.players, func(p *player) bool { return p.Connected })
}

func (r *Room) HasResumablePlayers() bool {
	return slices.ContainsFunc(r.players, func(p *player) bool { return p.token != "" })
}

func (r *Room) find(id string) *player {
	for _, p := range r.players {
		if p.ID == id {
			return p
		}
	}
	return nil
}

func (r *Room) findByName(name string) *player {
	for _, p := range r.players {
		if strings.EqualFold(p.Name, name) {
			return p
		}
	}
	return nil
}

func (r *Room) alivePlayers() []*player {
	return slices.DeleteFunc(slices.Clone(r.players), func(p *player) bool { return !p.Alive })
}

func (r *Room) aliveIDs() []string {
	ids := []string{}
	for _, p := range r.alivePlayers() {
		ids = append(ids, p.ID)
	}
	return ids
}

func (r *Room) removeAction(id, targetID string) error {
	if err := r.requireHost(id); err != nil {
		return err
	}
	target := r.find(targetID)
	if target == nil {
		return invalid(MessageIDPlayerNotFound, nil)
	}
	if id == targetID {
		return invalid(MessageIDSelfRemovalNotAllowed, nil)
	}
	if target.Connected && r.phase != PhaseLobby {
		return invalid(MessageIDConnectedPlayerRemovalNotAllowed, nil)
	}
	r.remove(targetID)
	return nil
}

func (r *Room) remove(id string) {
	p := r.find(id)
	p.revokeCredentials()
	if r.phase == PhaseLobby || r.phase == PhaseFinished {
		r.players = slices.DeleteFunc(r.players, func(p *player) bool { return p.ID == id })
	} else {
		r.removeActivePlayer(p)
	}
	if id == r.hostID {
		r.transferHost()
	}
}

func (r *Room) removeActivePlayer(p *player) {
	wasPendingGuesser := r.phase == PhaseGuess && r.result != nil &&
		r.result.EliminatedID != nil && *r.result.EliminatedID == p.ID
	p.Alive = false
	p.Connected = false
	delete(r.votes, p.ID)
	for voter, target := range r.votes {
		if target == p.ID {
			delete(r.votes, voter)
		}
	}
	r.voteCandidates = slices.DeleteFunc(r.voteCandidates, func(candidate string) bool {
		return candidate == p.ID
	})
	if r.phase == PhaseGuess {
		if wasPendingGuesser {
			r.resolveAbandonedGuess()
		}
		return
	}
	r.checkWinner()
	r.advanceAfterRemoval(p.ID)
}

func (r *Room) advanceAfterRemoval(id string) {
	switch r.phase {
	case PhaseReveal:
		r.advanceReveal()
	case PhaseClue:
		speakerRemoved := r.order[r.turn] == id
		order := []string{}
		for index, entry := range r.order {
			if index < r.turn || entry != id {
				order = append(order, entry)
			}
		}
		r.order = order
		if r.turn >= len(r.order) {
			r.beginVote(r.aliveIDs())
		} else if speakerRemoved {
			r.beginStage(PhaseClue)
		}
	case PhaseVote:
		if len(r.voteCandidates) < 2 {
			r.beginRound()
			break
		}
		if r.everyoneVoted(false) {
			r.resolveVote()
		} else {
			r.beginStage(PhaseVote)
		}
	}
}

func (r *Room) transferHost() {
	for _, p := range r.players {
		if p.Connected {
			r.hostID = p.ID
			return
		}
	}
	for _, p := range r.players {
		if p.token != "" {
			r.hostID = p.ID
			return
		}
	}
	r.hostID = ""
}
