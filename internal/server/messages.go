package server

import "undercover/internal/game"

const messageFrontendNotBuilt = "Frontend not built. Run npm run dev or npm run build."

type messageType string

const (
	messageTypeReply   messageType = "reply"
	messageTypeState   messageType = "state"
	messageTypeRemoved messageType = "removed"
)

type replyMessage struct {
	Type  messageType `json:"type"`
	ID    string      `json:"id"`
	Reply reply       `json:"reply"`
}

type stateMessage struct {
	Type messageType `json:"type"`
	Room game.View   `json:"room"`
}

type removedMessage struct {
	Type          messageType        `json:"type"`
	Reason        string             `json:"reason"`
	MessageID     game.MessageID     `json:"messageId,omitempty"`
	MessageParams game.MessageParams `json:"messageParams,omitempty"`
}
