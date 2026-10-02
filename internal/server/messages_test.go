package server

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"

	"undercover/internal/game"
)

func TestCatalogFailureKeepsWebSocketUsable(t *testing.T) {
	s := New(t.TempDir(), nil)
	t.Cleanup(s.Close)
	httpServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			t.Error(err)
			return
		}
		ctx, cancel := context.WithCancel(s.ctx)
		defer cancel()
		defer conn.CloseNow()
		p := &peer{
			conn:   conn,
			ctx:    ctx,
			cancel: cancel,
			out:    make(chan outbound, outboundQueueSize),
		}
		writerDone := make(chan struct{})
		go func() {
			defer close(writerDone)
			s.writeLoop(p)
		}()
		s.actionError(p, "catalog-failure", game.NewError(
			game.ErrorCodeSession,
			game.MessageID("UNDEFINED"),
			nil,
		))
		s.readLoop(p)
		cancel()
		<-writerDone
	}))
	t.Cleanup(httpServer.Close)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	t.Cleanup(cancel)
	conn, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(httpServer.URL, "http"), nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { conn.CloseNow() })
	var response replyMessage
	if err := wsjson.Read(ctx, conn, &response); err != nil {
		t.Fatalf("catalog failure did not produce a reply: %v", err)
	}
	if response.Type != messageTypeReply ||
		response.ID != "catalog-failure" ||
		response.Reply.OK ||
		response.Reply.Code != game.ErrorCodeGame ||
		response.Reply.MessageID != game.MessageIDUnexpectedGameError ||
		response.Reply.Error != "เกิดข้อผิดพลาด ลองอีกครั้ง" ||
		len(response.Reply.MessageParams) != 0 {
		t.Fatalf("unexpected failure reply: %+v", response)
	}
	if err := wsjson.Write(ctx, conn, request{
		ID:     "following-request",
		Action: game.Action{Type: game.ActionStart},
	}); err != nil {
		t.Fatalf("connection closed after catalog failure: %v", err)
	}
	response = replyMessage{}
	if err := wsjson.Read(ctx, conn, &response); err != nil {
		t.Fatalf("connection unusable after catalog failure: %v", err)
	}
	if response.Type != messageTypeReply ||
		response.ID != "following-request" ||
		response.Reply.OK ||
		response.Reply.Code != game.ErrorCodeSession ||
		response.Reply.MessageID != game.MessageIDSessionRequired {
		t.Fatalf("following request returned an unexpected reply: %+v", response)
	}
}

func TestRemovedMessageForReturnsConstructionError(t *testing.T) {
	for _, id := range []game.MessageID{"UNDEFINED", game.MessageIDTextLengthOutOfRange} {
		t.Run(string(id), func(t *testing.T) {
			message, err := removedMessageFor(id)
			if err == nil || !strings.Contains(err.Error(), string(id)) {
				t.Fatalf("removedMessageFor() error = %v, want failure with message ID", err)
			}
			if message.Type != "" ||
				message.Reason != "" ||
				message.MessageID != "" ||
				message.MessageParams != nil {
				t.Fatalf("catalog failure returned a partial removal message: %+v", message)
			}
		})
	}
}
