package game

import (
	"errors"
	"fmt"
)

type MessageID string

type MessageParams map[string]any

type Message struct {
	ID     MessageID
	Params MessageParams
	Text   string
}

const messageUnexpectedGameError = "เกิดข้อผิดพลาด ลองอีกครั้ง"

const (
	MessageIDTextLengthOutOfRange             MessageID = "TEXT_LENGTH_OUT_OF_RANGE"
	MessageIDTextContainsControlCharacter     MessageID = "TEXT_CONTAINS_CONTROL_CHARACTER"
	MessageIDSessionMembershipLost            MessageID = "SESSION_MEMBERSHIP_LOST"
	MessageIDGameStateChanged                 MessageID = "GAME_STATE_CHANGED"
	MessageIDActionNotSupported               MessageID = "ACTION_NOT_SUPPORTED"
	MessageIDHostRequired                     MessageID = "HOST_REQUIRED"
	MessageIDActionNotAllowedInPhase          MessageID = "ACTION_NOT_ALLOWED_IN_PHASE"
	MessageIDUndercoverCountOutOfRange        MessageID = "UNDERCOVER_COUNT_OUT_OF_RANGE"
	MessageIDWhiteGuyCountOutOfRange          MessageID = "WHITE_GUY_COUNT_OUT_OF_RANGE"
	MessageIDTeamBalanceInvalid               MessageID = "TEAM_BALANCE_INVALID"
	MessageIDWhiteGuyTeamBalanceInvalid       MessageID = "WHITE_GUY_TEAM_BALANCE_INVALID"
	MessageIDSettingsRequired                 MessageID = "SETTINGS_REQUIRED"
	MessageIDCategoryInvalid                  MessageID = "CATEGORY_INVALID"
	MessageIDMinimumPlayersRequired           MessageID = "MINIMUM_PLAYERS_REQUIRED"
	MessageIDDisconnectedPlayersPresent       MessageID = "DISCONNECTED_PLAYERS_PRESENT"
	MessageIDRoomHistoryLimitApproaching      MessageID = "ROOM_HISTORY_LIMIT_APPROACHING"
	MessageIDNotCurrentSpeaker                MessageID = "NOT_CURRENT_SPEAKER"
	MessageIDSpeakerStillConnected            MessageID = "SPEAKER_STILL_CONNECTED"
	MessageIDEliminatedPlayerCannotVote       MessageID = "ELIMINATED_PLAYER_CANNOT_VOTE"
	MessageIDSelfVoteNotAllowed               MessageID = "SELF_VOTE_NOT_ALLOWED"
	MessageIDVoteTargetInvalid                MessageID = "VOTE_TARGET_INVALID"
	MessageIDVoteAlreadyCast                  MessageID = "VOTE_ALREADY_CAST"
	MessageIDConnectedPlayersPendingVote      MessageID = "CONNECTED_PLAYERS_PENDING_VOTE"
	MessageIDNoVotesCast                      MessageID = "NO_VOTES_CAST"
	MessageIDNotGuessingPlayer                MessageID = "NOT_GUESSING_PLAYER"
	MessageIDGuesserStillConnected            MessageID = "GUESSER_STILL_CONNECTED"
	MessageIDGameAlreadyStarted               MessageID = "GAME_ALREADY_STARTED"
	MessageIDAvatarInvalid                    MessageID = "AVATAR_INVALID"
	MessageIDPINFormatInvalid                 MessageID = "PIN_FORMAT_INVALID"
	MessageIDPlayerNameAlreadyUsed            MessageID = "PLAYER_NAME_ALREADY_USED"
	MessageIDResumeCredentialInvalid          MessageID = "RESUME_CREDENTIAL_INVALID"
	MessageIDRecoveryCredentialInvalid        MessageID = "RECOVERY_CREDENTIAL_INVALID"
	MessageIDRecoveryRateLimited              MessageID = "RECOVERY_RATE_LIMITED"
	MessageIDPlayerNotFound                   MessageID = "PLAYER_NOT_FOUND"
	MessageIDSelfRemovalNotAllowed            MessageID = "SELF_REMOVAL_NOT_ALLOWED"
	MessageIDConnectedPlayerRemovalNotAllowed MessageID = "CONNECTED_PLAYER_REMOVAL_NOT_ALLOWED"
	MessageIDSessionRequired                  MessageID = "SESSION_REQUIRED"
	MessageIDSessionRoomNotFound              MessageID = "SESSION_ROOM_NOT_FOUND"
	MessageIDAlreadyInRoom                    MessageID = "ALREADY_IN_ROOM"
	MessageIDRoomCapacityReached              MessageID = "ROOM_CAPACITY_REACHED"
	MessageIDRoomCodeFormatInvalid            MessageID = "ROOM_CODE_FORMAT_INVALID"
	MessageIDRoomNotFound                     MessageID = "ROOM_NOT_FOUND"
	MessageIDUnexpectedGameError              MessageID = "UNEXPECTED_GAME_ERROR"
	MessageIDRequestInvalid                   MessageID = "REQUEST_INVALID"
	MessageIDActionRateLimited                MessageID = "ACTION_RATE_LIMITED"
	MessageIDRemovedByHost                    MessageID = "REMOVED_BY_HOST"
	MessageIDSeatReplaced                     MessageID = "SEAT_REPLACED"
	MessageIDTurnSkippedDisconnectedPlayer    MessageID = "TURN_SKIPPED_DISCONNECTED_PLAYER"
)

func NewMessage(id MessageID, params MessageParams) (Message, error) {
	params = cloneMessageParams(params)
	text, err := messageText(id, params)
	if err != nil {
		return Message{}, fmt.Errorf("create message %q: %w", id, err)
	}
	return Message{ID: id, Params: params, Text: text}, nil
}

func NewError(code ErrorCode, id MessageID, params MessageParams) error {
	message, err := NewMessage(id, params)
	if err != nil {
		return err
	}
	return &Error{Message: message.Text, Code: code, MessageID: message.ID, Params: message.Params}
}

func NewUnexpectedError() *Error {
	return &Error{
		Message:   messageUnexpectedGameError,
		Code:      ErrorCodeGame,
		MessageID: MessageIDUnexpectedGameError,
	}
}

func cloneMessageParams(params MessageParams) MessageParams {
	if len(params) == 0 {
		return nil
	}
	cloned := make(MessageParams, len(params))
	for key, value := range params {
		cloned[key] = value
	}
	return cloned
}

func validateMessageParams(params MessageParams) error {
	for key, value := range params {
		switch value.(type) {
		case string, int, int8, int16, int32, int64,
			uint, uint8, uint16, uint32, uint64, float32, float64:
		default:
			return fmt.Errorf("message parameter %q must be a string or number", key)
		}
	}
	return nil
}

func messageText(id MessageID, params MessageParams) (string, error) {
	if err := validateMessageParams(params); err != nil {
		return "", err
	}
	switch id {
	case MessageIDTextLengthOutOfRange:
		if len(params) != 2 {
			return "", errors.New("TEXT_LENGTH_OUT_OF_RANGE requires min and max parameters")
		}
		min, err := requiredNumberParam(params, "min")
		if err != nil {
			return "", err
		}
		max, err := requiredNumberParam(params, "max")
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("ข้อความต้องมี %v–%v ตัวอักษร", min, max), nil
	case MessageIDTextContainsControlCharacter:
		return staticMessage(params, "ข้อความมีอักขระที่ใช้ไม่ได้")
	case MessageIDSessionMembershipLost:
		return staticMessage(params, "คุณไม่ได้อยู่ในห้องนี้แล้ว")
	case MessageIDGameStateChanged:
		return staticMessage(params, "สถานะเกมเปลี่ยนแล้ว ลองอีกครั้ง")
	case MessageIDActionNotSupported:
		return staticMessage(params, "คำสั่งนี้ใช้ในห้องไม่ได้")
	case MessageIDHostRequired:
		return staticMessage(params, "เฉพาะเจ้าของห้องเท่านั้น")
	case MessageIDActionNotAllowedInPhase:
		return staticMessage(params, "คำสั่งนี้ใช้ในช่วงนี้ไม่ได้")
	case MessageIDUndercoverCountOutOfRange:
		return staticMessage(params, "เลือก Undercover ได้ 1–3 คน")
	case MessageIDWhiteGuyCountOutOfRange:
		return staticMessage(params, "เลือก White Guy ได้ 0–1 คน")
	case MessageIDTeamBalanceInvalid:
		return staticMessage(params, "ฝ่ายพลเมืองต้องมากกว่า Undercover")
	case MessageIDWhiteGuyTeamBalanceInvalid:
		if len(params) != 1 {
			return "", errors.New("WHITE_GUY_TEAM_BALANCE_INVALID requires min parameter")
		}
		minimum, err := requiredNumberParam(params, "min")
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("การตั้งค่านี้ต้องมีผู้เล่นอย่างน้อย %v คน", minimum), nil
	case MessageIDSettingsRequired:
		return staticMessage(params, "ไม่มีการตั้งค่า")
	case MessageIDCategoryInvalid:
		return staticMessage(params, "หมวดคำไม่ถูกต้อง")
	case MessageIDMinimumPlayersRequired:
		return staticMessage(params, "ต้องมีผู้เล่นอย่างน้อย 3 คน")
	case MessageIDDisconnectedPlayersPresent:
		return staticMessage(params, "รอทุกคนกลับมา หรือนำผู้เล่นที่หลุดออกก่อน")
	case MessageIDRoomHistoryLimitApproaching:
		return staticMessage(params, "ประวัติห้องใกล้เต็ม กรุณาสร้างห้องใหม่")
	case MessageIDNotCurrentSpeaker:
		return staticMessage(params, "ยังไม่ถึงตาของคุณ")
	case MessageIDSpeakerStillConnected:
		return staticMessage(params, "ผู้เล่นยังออนไลน์ ให้เขาส่งคำใบ้เอง")
	case MessageIDEliminatedPlayerCannotVote:
		return staticMessage(params, "ผู้เล่นที่ออกแล้วโหวตไม่ได้")
	case MessageIDSelfVoteNotAllowed:
		return staticMessage(params, "โหวตตัวเองไม่ได้")
	case MessageIDVoteTargetInvalid:
		return staticMessage(params, "โหวตผู้เล่นนี้ไม่ได้")
	case MessageIDVoteAlreadyCast:
		return staticMessage(params, "คุณโหวตแล้ว")
	case MessageIDConnectedPlayersPendingVote:
		return staticMessage(params, "รอผู้เล่นที่ออนไลน์โหวตให้ครบก่อน")
	case MessageIDNoVotesCast:
		return staticMessage(params, "ยังไม่มีใครโหวต")
	case MessageIDNotGuessingPlayer:
		return staticMessage(params, "เฉพาะ White Guy ที่ถูกโหวตออกเท่านั้นที่ทายได้")
	case MessageIDGuesserStillConnected:
		return staticMessage(params, "White Guy ยังออนไลน์ ให้เขาทายคำเอง")
	case MessageIDGameAlreadyStarted:
		return staticMessage(params, "เกมเริ่มแล้ว รอเข้าห้องตอนเกมถัดไป")
	case MessageIDAvatarInvalid:
		return staticMessage(params, "อวาตาร์ไม่ถูกต้อง")
	case MessageIDPINFormatInvalid:
		return staticMessage(params, "PIN ต้องเป็นตัวเลข 6 หลัก")
	case MessageIDPlayerNameAlreadyUsed:
		return staticMessage(params, "ชื่อนี้มีคนใช้แล้ว ลองอีกชื่อหนึ่ง")
	case MessageIDResumeCredentialInvalid:
		return staticMessage(params, "กลับเข้าห้องไม่ได้ กรุณาเข้าห้องใหม่")
	case MessageIDRecoveryCredentialInvalid:
		return staticMessage(params, "กลับเข้าห้องไม่ได้ กรุณาตรวจสอบชื่อและ PIN")
	case MessageIDRecoveryRateLimited:
		return staticMessage(params, "ลอง PIN ผิดหลายครั้ง รอ 1 นาทีแล้วลองใหม่")
	case MessageIDPlayerNotFound:
		return staticMessage(params, "ไม่พบผู้เล่นนี้")
	case MessageIDSelfRemovalNotAllowed:
		return staticMessage(params, "นำตัวเองออกไม่ได้")
	case MessageIDConnectedPlayerRemovalNotAllowed:
		return staticMessage(params, "นำออกระหว่างเกมได้เฉพาะผู้เล่นที่หลุด")
	case MessageIDSessionRequired:
		return staticMessage(params, "กรุณาเข้าห้องก่อน")
	case MessageIDSessionRoomNotFound:
		return staticMessage(params, "ไม่พบห้องนี้")
	case MessageIDAlreadyInRoom:
		return staticMessage(params, "คุณอยู่ในห้องแล้ว ออกจากห้องเดิมก่อน")
	case MessageIDRoomCapacityReached:
		return staticMessage(params, "ห้องเต็มชั่วคราว ลองอีกครั้งภายหลัง")
	case MessageIDRoomCodeFormatInvalid:
		return staticMessage(params, "รหัสห้องต้องมี 6 ตัว")
	case MessageIDRoomNotFound:
		return staticMessage(params, "ไม่พบห้องนี้ ห้องอาจหมดอายุแล้ว")
	case MessageIDUnexpectedGameError:
		return staticMessage(params, messageUnexpectedGameError)
	case MessageIDRequestInvalid:
		return staticMessage(params, "ข้อมูลไม่ถูกต้อง")
	case MessageIDActionRateLimited:
		return staticMessage(params, "ส่งเร็วเกินไป รอสักครู่แล้วลองใหม่")
	case MessageIDRemovedByHost:
		return staticMessage(params, "เจ้าของห้องนำคุณออกจากห้องแล้ว")
	case MessageIDSeatReplaced:
		return staticMessage(params, "ที่นั่งนี้เปิดในอีกแท็บแล้ว กลับไปเล่นที่แท็บล่าสุด")
	case MessageIDTurnSkippedDisconnectedPlayer:
		return staticMessage(params, "ข้ามตา — ผู้เล่นหลุดการเชื่อมต่อ")
	default:
		return "", fmt.Errorf("undefined message ID %q", id)
	}
}

func staticMessage(params MessageParams, text string) (string, error) {
	if len(params) != 0 {
		return "", errors.New("static message does not accept parameters")
	}
	return text, nil
}

func requiredNumberParam(params MessageParams, key string) (any, error) {
	value, ok := params[key]
	if !ok {
		return nil, fmt.Errorf("missing message parameter %q", key)
	}
	switch value.(type) {
	case int, int8, int16, int32, int64, uint, uint8, uint16, uint32, uint64, float32, float64:
		return value, nil
	default:
		return nil, fmt.Errorf("message parameter %q must be a number", key)
	}
}
