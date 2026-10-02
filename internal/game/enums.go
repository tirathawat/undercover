package game

type Phase string

const (
	PhaseLobby    Phase = "lobby"
	PhaseReveal   Phase = "reveal"
	PhaseClue     Phase = "clue"
	PhaseVote     Phase = "vote"
	PhaseResult   Phase = "result"
	PhaseGuess    Phase = "guess"
	PhaseFinished Phase = "finished"
)

type Role string

const (
	RoleCivilian   Role = "civilian"
	RoleUndercover Role = "undercover"
	RoleWhiteGuy   Role = "whiteGuy"
)

type WinningTeam string

const (
	TeamCivilian     WinningTeam = "civilian"
	TeamUndercover   WinningTeam = "undercover"
	TeamWhiteGuy     WinningTeam = "whiteGuy"
	TeamInfiltrators WinningTeam = "infiltrators"
)

type Category string

const (
	CategoryMix    Category = "mix"
	CategoryFood   Category = "food"
	CategoryPlaces Category = "places"
	CategoryThings Category = "things"
)

type ActionType string

const (
	ActionCreate     ActionType = "create"
	ActionJoin       ActionType = "join"
	ActionResume     ActionType = "resume"
	ActionRecover    ActionType = "recover"
	ActionSettings   ActionType = "settings"
	ActionStart      ActionType = "start"
	ActionReady      ActionType = "ready"
	ActionClue       ActionType = "clue"
	ActionSkip       ActionType = "skip"
	ActionVote       ActionType = "vote"
	ActionFinishVote ActionType = "finishVote"
	ActionGuess      ActionType = "guess"
	ActionSkipGuess  ActionType = "skipGuess"
	ActionNext       ActionType = "next"
	ActionRematch    ActionType = "rematch"
	ActionRemove     ActionType = "remove"
	ActionLeave      ActionType = "leave"
)

type ErrorCode string

const (
	ErrorCodeInvalid ErrorCode = "INVALID"
	ErrorCodeSession ErrorCode = "SESSION"
	ErrorCodeGame    ErrorCode = "GAME"
	ErrorCodeLimit   ErrorCode = "LIMIT"
)
