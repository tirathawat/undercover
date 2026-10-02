package game

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

func TestMessageCatalogFallbacks(t *testing.T) {
	tests := []struct {
		id     MessageID
		params MessageParams
		text   string
	}{
		{
			id: MessageIDTextLengthOutOfRange, params: MessageParams{"min": 1, "max": 80},
			text: "ข้อความต้องมี 1–80 ตัวอักษร",
		},
		{id: MessageIDTextContainsControlCharacter, text: "ข้อความมีอักขระที่ใช้ไม่ได้"},
		{id: MessageIDSessionMembershipLost, text: "คุณไม่ได้อยู่ในห้องนี้แล้ว"},
		{id: MessageIDGameStateChanged, text: "สถานะเกมเปลี่ยนแล้ว ลองอีกครั้ง"},
		{id: MessageIDActionNotSupported, text: "คำสั่งนี้ใช้ในห้องไม่ได้"},
		{id: MessageIDHostRequired, text: "เฉพาะเจ้าของห้องเท่านั้น"},
		{id: MessageIDActionNotAllowedInPhase, text: "คำสั่งนี้ใช้ในช่วงนี้ไม่ได้"},
		{id: MessageIDUndercoverCountOutOfRange, text: "เลือก Undercover ได้ 1–3 คน"},
		{id: MessageIDTeamBalanceInvalid, text: "ฝ่ายพลเมืองต้องมากกว่า Undercover"},
		{id: MessageIDSettingsRequired, text: "ไม่มีการตั้งค่า"},
		{id: MessageIDCategoryInvalid, text: "หมวดคำไม่ถูกต้อง"},
		{id: MessageIDMinimumPlayersRequired, text: "ต้องมีผู้เล่นอย่างน้อย 3 คน"},
		{id: MessageIDDisconnectedPlayersPresent,
			text: "รอทุกคนกลับมา หรือนำผู้เล่นที่หลุดออกก่อน"},
		{id: MessageIDRoomHistoryLimitApproaching, text: "ประวัติห้องใกล้เต็ม กรุณาสร้างห้องใหม่"},
		{id: MessageIDNotCurrentSpeaker, text: "ยังไม่ถึงตาของคุณ"},
		{id: MessageIDSpeakerStillConnected, text: "ผู้เล่นยังออนไลน์ ให้เขาส่งคำใบ้เอง"},
		{id: MessageIDEliminatedPlayerCannotVote, text: "ผู้เล่นที่ออกแล้วโหวตไม่ได้"},
		{id: MessageIDSelfVoteNotAllowed, text: "โหวตตัวเองไม่ได้"},
		{id: MessageIDVoteTargetInvalid, text: "โหวตผู้เล่นนี้ไม่ได้"},
		{id: MessageIDVoteAlreadyCast, text: "คุณโหวตแล้ว"},
		{id: MessageIDConnectedPlayersPendingVote, text: "รอผู้เล่นที่ออนไลน์โหวตให้ครบก่อน"},
		{id: MessageIDNoVotesCast, text: "ยังไม่มีใครโหวต"},
		{id: MessageIDGameAlreadyStarted, text: "เกมเริ่มแล้ว รอเข้าห้องตอนเกมถัดไป"},
		{id: MessageIDAvatarInvalid, text: "อวาตาร์ไม่ถูกต้อง"},
		{id: MessageIDPINFormatInvalid, text: "PIN ต้องเป็นตัวเลข 6 หลัก"},
		{id: MessageIDPlayerNameAlreadyUsed, text: "ชื่อนี้มีคนใช้แล้ว ลองอีกชื่อหนึ่ง"},
		{id: MessageIDResumeCredentialInvalid, text: "กลับเข้าห้องไม่ได้ กรุณาเข้าห้องใหม่"},
		{id: MessageIDRecoveryCredentialInvalid,
			text: "กลับเข้าห้องไม่ได้ กรุณาตรวจสอบชื่อและ PIN"},
		{id: MessageIDRecoveryRateLimited, text: "ลอง PIN ผิดหลายครั้ง รอ 1 นาทีแล้วลองใหม่"},
		{id: MessageIDPlayerNotFound, text: "ไม่พบผู้เล่นนี้"},
		{id: MessageIDSelfRemovalNotAllowed, text: "นำตัวเองออกไม่ได้"},
		{id: MessageIDConnectedPlayerRemovalNotAllowed,
			text: "นำออกระหว่างเกมได้เฉพาะผู้เล่นที่หลุด"},
		{id: MessageIDSessionRequired, text: "กรุณาเข้าห้องก่อน"},
		{id: MessageIDSessionRoomNotFound, text: "ไม่พบห้องนี้"},
		{id: MessageIDAlreadyInRoom, text: "คุณอยู่ในห้องแล้ว ออกจากห้องเดิมก่อน"},
		{id: MessageIDRoomCapacityReached, text: "ห้องเต็มชั่วคราว ลองอีกครั้งภายหลัง"},
		{id: MessageIDRoomCodeFormatInvalid, text: "รหัสห้องต้องมี 6 ตัว"},
		{id: MessageIDRoomNotFound, text: "ไม่พบห้องนี้ ห้องอาจหมดอายุแล้ว"},
		{id: MessageIDUnexpectedGameError, text: "เกิดข้อผิดพลาด ลองอีกครั้ง"},
		{id: MessageIDRequestInvalid, text: "ข้อมูลไม่ถูกต้อง"},
		{id: MessageIDActionRateLimited, text: "ส่งเร็วเกินไป รอสักครู่แล้วลองใหม่"},
		{id: MessageIDRemovedByHost, text: "เจ้าของห้องนำคุณออกจากห้องแล้ว"},
		{id: MessageIDSeatReplaced, text: "ที่นั่งนี้เปิดในอีกแท็บแล้ว กลับไปเล่นที่แท็บล่าสุด"},
		{id: MessageIDTurnSkippedDisconnectedPlayer, text: "ข้ามตา — ผู้เล่นหลุดการเชื่อมต่อ"},
	}
	for _, test := range tests {
		t.Run(string(test.id), func(t *testing.T) {
			message, err := NewMessage(test.id, test.params)
			if err != nil {
				t.Fatal(err)
			}
			if message.ID != test.id || message.Text != test.text {
				t.Fatalf("NewMessage() = %+v, want ID %q and text %q", message, test.id, test.text)
			}
		})
	}
}

func TestNewErrorUsesCatalogFallbackAndParameters(t *testing.T) {
	err := NewError(
		ErrorCodeGame,
		MessageIDTextLengthOutOfRange,
		MessageParams{"min": 1, "max": 20},
	)
	var gameErr *Error
	if !errors.As(err, &gameErr) {
		t.Fatalf("NewError() returned %T, want *Error", err)
	}
	if gameErr.Message != "ข้อความต้องมี 1–20 ตัวอักษร" ||
		gameErr.MessageID != MessageIDTextLengthOutOfRange || gameErr.Code != ErrorCodeGame {
		t.Fatalf("NewError() = %+v", err)
	}
	data, marshalErr := json.Marshal(struct {
		MessageID     MessageID     `json:"messageId,omitempty"`
		MessageParams MessageParams `json:"messageParams,omitempty"`
	}{MessageID: gameErr.MessageID, MessageParams: gameErr.Params})
	if marshalErr != nil {
		t.Fatal(marshalErr)
	}
	if got, want := string(data),
		`{"messageId":"TEXT_LENGTH_OUT_OF_RANGE",`+
			`"messageParams":{"max":20,"min":1}}`; got != want {
		t.Fatalf("metadata JSON = %s, want %s", got, want)
	}
}

func TestNewMessageRejectsUndefinedCatalogEntry(t *testing.T) {
	message, err := NewMessage(MessageID("UNDEFINED"), nil)
	if err == nil || !strings.Contains(err.Error(), "UNDEFINED") {
		t.Fatalf("undefined catalog entry returned message %+v and error %v", message, err)
	}
	if message.ID != "" || message.Text != "" || message.Params != nil {
		t.Fatalf("undefined catalog entry returned a partial message: %+v", message)
	}
}

func TestNewMessageRejectsInvalidParameters(t *testing.T) {
	tests := []struct {
		name   string
		id     MessageID
		params MessageParams
		want   string
	}{
		{name: "non-scalar", id: MessageIDTextLengthOutOfRange,
			params: MessageParams{"min": 1, "max": []int{20}}, want: "must be a string or number"},
		{
			name:   "non-number minimum",
			id:     MessageIDTextLengthOutOfRange,
			params: MessageParams{"min": "one", "max": 20},
			want:   "must be a number",
		},
		{
			name:   "non-number maximum",
			id:     MessageIDTextLengthOutOfRange,
			params: MessageParams{"min": 1, "max": "twenty"},
			want:   "must be a number",
		},
		{name: "missing limits", id: MessageIDTextLengthOutOfRange, want: "requires min and max"},
		{
			name:   "extra parameter",
			id:     MessageIDTextLengthOutOfRange,
			params: MessageParams{"min": 1, "max": 20, "extra": 10},
			want:   "requires min and max",
		},
		{
			name:   "missing minimum",
			id:     MessageIDTextLengthOutOfRange,
			params: MessageParams{"max": 20, "extra": 1},
			want:   "missing message parameter \"min\"",
		},
		{
			name:   "missing maximum",
			id:     MessageIDTextLengthOutOfRange,
			params: MessageParams{"min": 1, "extra": 20},
			want:   "missing message parameter \"max\"",
		},
		{
			name:   "unexpected static parameter",
			id:     MessageIDAvatarInvalid,
			params: MessageParams{"value": 12},
			want:   "does not accept parameters",
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			message, err := NewMessage(test.id, test.params)
			if err == nil ||
				!strings.Contains(err.Error(), test.want) ||
				!strings.Contains(err.Error(), string(test.id)) {
				t.Fatalf("NewMessage() error = %v, want message ID and %q", err, test.want)
			}
			if message.ID != "" || message.Text != "" || message.Params != nil {
				t.Fatalf("invalid parameters returned a partial message: %+v", message)
			}
		})
	}
}

func TestNewErrorReturnsCatalogConstructionError(t *testing.T) {
	for _, id := range []MessageID{"UNDEFINED", MessageIDTextLengthOutOfRange} {
		t.Run(string(id), func(t *testing.T) {
			err := NewError(ErrorCodeSession, id, nil)
			var gameErr *Error
			if err == nil ||
				errors.As(err, &gameErr) ||
				!strings.Contains(err.Error(), string(id)) {
				t.Fatalf("catalog failure should be an internal error with message ID, got %v", err)
			}
		})
	}
}

func TestNewMessageCopiesParameters(t *testing.T) {
	params := MessageParams{"min": 1, "max": 20}
	message, err := NewMessage(MessageIDTextLengthOutOfRange, params)
	if err != nil {
		t.Fatal(err)
	}
	params["max"] = 80
	if message.Params["max"] != 20 || message.Text != "ข้อความต้องมี 1–20 ตัวอักษร" {
		t.Fatalf("message changed with caller parameters: %+v", message)
	}
	message.Params["min"] = 2
	if params["min"] != 1 {
		t.Fatalf("caller parameters changed with message: %+v", params)
	}
}

func TestNewUnexpectedErrorMatchesCatalog(t *testing.T) {
	message, err := NewMessage(MessageIDUnexpectedGameError, nil)
	if err != nil {
		t.Fatal(err)
	}
	gameErr := NewUnexpectedError()
	if gameErr.Code != ErrorCodeGame ||
		gameErr.MessageID != message.ID ||
		gameErr.Message != message.Text ||
		gameErr.Params != nil {
		t.Fatalf("unexpected error differs from catalog: %+v", gameErr)
	}
}
