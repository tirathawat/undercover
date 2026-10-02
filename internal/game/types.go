package game

type Settings struct {
	Category    Category `json:"category"`
	Undercovers int      `json:"undercovers"`
	WhiteGuys   int      `json:"whiteGuys"`
}

type Action struct {
	Type     ActionType `json:"type"`
	StageID  string     `json:"stageId,omitempty"`
	Name     string     `json:"name,omitempty"`
	Avatar   int        `json:"avatar,omitempty"`
	Code     string     `json:"code,omitempty"`
	Token    string     `json:"token,omitempty"`
	PIN      string     `json:"pin,omitempty"`
	Text     string     `json:"text,omitempty"`
	TargetID string     `json:"targetId,omitempty"`
	Settings *Settings  `json:"settings,omitempty"`
}

type Session struct {
	Code     string `json:"code"`
	PlayerID string `json:"playerId"`
	Token    string `json:"token"`
}

type PlayerView struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Avatar    int    `json:"avatar"`
	Connected bool   `json:"connected"`
	Alive     bool   `json:"alive"`
	Ready     bool   `json:"ready"`
	Role      Role   `json:"role,omitempty"`
}

type HistoryEntry struct {
	ID            string        `json:"id"`
	Game          int           `json:"game"`
	Round         int           `json:"round"`
	PlayerID      string        `json:"playerId"`
	Name          string        `json:"name"`
	Avatar        int           `json:"avatar"`
	Text          string        `json:"text"`
	Time          int64         `json:"time"`
	MessageID     MessageID     `json:"messageId,omitempty"`
	MessageParams MessageParams `json:"messageParams,omitempty"`
}

type VoteResult struct {
	EliminatedID *string        `json:"eliminatedId"`
	Role         *Role          `json:"role"`
	Counts       map[string]int `json:"counts"`
	TiedIDs      []string       `json:"tiedIds"`
	Guess        *GuessResult   `json:"guess,omitempty"`
}

type GuessResult struct {
	Text    string `json:"text"`
	Correct bool   `json:"correct"`
}

type Words struct {
	Civilian   string `json:"civilian"`
	Undercover string `json:"undercover"`
}

type SelfView struct {
	ID       string  `json:"id"`
	Role     Role    `json:"role,omitempty"`
	Word     *string `json:"word"`
	HasVoted bool    `json:"hasVoted"`
}

type View struct {
	Code           string         `json:"code"`
	HostID         string         `json:"hostId"`
	StageID        string         `json:"stageId"`
	Phase          Phase          `json:"phase"`
	Game           int            `json:"game"`
	Round          int            `json:"round"`
	Settings       Settings       `json:"settings"`
	Players        []PlayerView   `json:"players"`
	Self           SelfView       `json:"self"`
	SpeakerID      *string        `json:"speakerId"`
	VoteCount      int            `json:"voteCount"`
	VoteCandidates []string       `json:"voteCandidates"`
	Result         *VoteResult    `json:"result"`
	Winner         *WinningTeam   `json:"winner"`
	Words          *Words         `json:"words"`
	History        []HistoryEntry `json:"history"`
}

type Error struct {
	Message   string
	Code      ErrorCode
	MessageID MessageID
	Params    MessageParams
}

func (e *Error) Error() string { return e.Message }

func invalid(id MessageID, params MessageParams) error {
	return NewError(ErrorCodeGame, id, params)
}

func sessionError(id MessageID, params MessageParams) error {
	return NewError(ErrorCodeSession, id, params)
}

func limitError(id MessageID, params MessageParams) error {
	return NewError(ErrorCodeLimit, id, params)
}
