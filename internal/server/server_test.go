package server_test

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"

	"undercover/internal/game"
	"undercover/internal/server"
)

const testPIN = "012345"

type response struct {
	Type          string             `json:"type"`
	ID            string             `json:"id"`
	Room          game.View          `json:"room"`
	Reason        string             `json:"reason"`
	MessageID     game.MessageID     `json:"messageId"`
	MessageParams game.MessageParams `json:"messageParams"`
	Reply         struct {
		OK            bool               `json:"ok"`
		Error         string             `json:"error"`
		Code          string             `json:"code"`
		MessageID     game.MessageID     `json:"messageId"`
		MessageParams game.MessageParams `json:"messageParams"`
		Session       *game.Session      `json:"session"`
		Room          *game.View         `json:"room"`
	} `json:"reply"`
}

type client struct {
	conn     *websocket.Conn
	ctx      context.Context
	messages chan response
	view     game.View
	sequence int
}

func testServer(t *testing.T) string {
	t.Helper()
	app := server.New(t.TempDir(), nil)
	httpServer := httptest.NewServer(app.Handler())
	t.Cleanup(func() { app.Close(); httpServer.Close() })
	return "ws" + strings.TrimPrefix(httpServer.URL, "http") + "/ws"
}

func dial(t *testing.T, url string) *client {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	conn, _, err := websocket.Dial(ctx, url, nil)
	if err != nil {
		cancel()
		t.Fatal(err)
	}
	c := &client{conn: conn, ctx: ctx, messages: make(chan response, 100)}
	go func() {
		defer close(c.messages)
		for {
			var message response
			if err := wsjson.Read(ctx, conn, &message); err != nil {
				return
			}
			select {
			case c.messages <- message:
			case <-ctx.Done():
				return
			}
		}
	}()
	t.Cleanup(func() { cancel(); conn.CloseNow() })
	return c
}

func (c *client) next() (response, error) {
	select {
	case message, ok := <-c.messages:
		if !ok {
			return response{}, fmt.Errorf("connection closed")
		}
		if message.Type == "state" {
			c.view = message.Room
		}
		if message.Type == "reply" && message.Reply.Room != nil {
			c.view = *message.Reply.Room
		}
		return message, nil
	case <-c.ctx.Done():
		return response{}, c.ctx.Err()
	}
}

func (c *client) action(action game.Action) (response, error) {
	c.sequence++
	id := fmt.Sprint(c.sequence)
	if err := wsjson.Write(c.ctx, c.conn, struct {
		ID     string      `json:"id"`
		Action game.Action `json:"action"`
	}{ID: id, Action: action}); err != nil {
		return response{}, err
	}
	for {
		message, err := c.next()
		if err != nil {
			return response{}, err
		}
		if message.Type == "reply" && message.ID == id {
			return message, nil
		}
	}
}

func act(t *testing.T, c *client, action game.Action) response {
	t.Helper()
	response, err := c.action(action)
	if err != nil {
		t.Fatal(err)
	}
	if !response.Reply.OK {
		t.Fatalf("%s failed: %s", action.Type, response.Reply.Error)
	}
	return response
}

func waitFor(t *testing.T, c *client, condition func(game.View) bool) game.View {
	t.Helper()
	for !condition(c.view) {
		if _, err := c.next(); err != nil {
			t.Fatal(err)
		}
	}
	return c.view
}

func roomClients(t *testing.T, url string, count int) ([]*client, []game.Session) {
	t.Helper()
	clients := []*client{}
	sessions := []game.Session{}
	code := ""
	for index := range count {
		c := dial(t, url)
		typeName := game.ActionJoin
		if index == 0 {
			typeName = game.ActionCreate
		}
		response := act(t, c, game.Action{
			Type:   typeName,
			Code:   code,
			Name:   fmt.Sprintf("Player %d", index+1),
			Avatar: index % 12,
			PIN:    testPIN,
		})
		if response.Reply.Session == nil {
			t.Fatal("session not returned")
		}
		session := *response.Reply.Session
		code = session.Code
		clients = append(clients, c)
		sessions = append(sessions, session)
	}
	for _, c := range clients {
		waitFor(t, c, func(v game.View) bool { return len(v.Players) == count })
	}
	return clients, sessions
}

func TestWebSocketMultiplayerGameWithConcurrentVotes(t *testing.T) {
	url := testServer(t)
	clients, sessions := roomClients(t, url, 4)
	act(t, clients[0], game.Action{Type: "start", StageID: clients[0].view.StageID})
	for _, c := range clients {
		v := waitFor(t, c, func(v game.View) bool { return v.Phase == "reveal" })
		if v.Self.Word == nil || v.Words != nil {
			t.Fatal("private word not scoped correctly")
		}
		for _, p := range v.Players {
			if p.Role != "" {
				t.Fatal("role leaked over websocket")
			}
		}
		data, err := json.Marshal(v)
		if err != nil {
			t.Fatal(err)
		}
		for _, session := range sessions {
			if strings.Contains(string(data), session.Token) {
				t.Fatal("session token leaked")
			}
		}
		act(t, c, game.Action{Type: "ready", StageID: v.StageID})
	}
	groups := make(map[string][]int)
	for index, c := range clients {
		v := waitFor(t, c, func(v game.View) bool { return v.Phase == "clue" })
		groups[*v.Self.Word] = append(groups[*v.Self.Word], index)
	}
	spy := -1
	for _, group := range groups {
		if len(group) == 1 {
			spy = group[0]
		}
	}
	if spy == -1 {
		t.Fatal("undercover not assigned")
	}
	for range 4 {
		v := clients[0].view
		var speaker *client
		for index, session := range sessions {
			if session.PlayerID == *v.SpeakerID {
				speaker = clients[index]
			}
		}
		act(t, speaker, game.Action{Type: "clue", StageID: v.StageID, Text: "นึกถึงวันหยุด"})
		for _, c := range clients {
			waitFor(t, c, func(next game.View) bool { return next.StageID != v.StageID })
		}
	}
	for _, c := range clients {
		if c.view.Phase != "vote" || len(c.view.History) != 4 {
			t.Fatal("clue history not synchronized")
		}
	}
	stage := clients[0].view.StageID
	var wg sync.WaitGroup
	errors := make(chan error, len(clients))
	for index, c := range clients {
		wg.Go(func() {
			target := spy
			if index == spy {
				target = (spy + 1) % len(clients)
			}
			response, err := c.action(game.Action{
				Type:     "vote",
				StageID:  stage,
				TargetID: sessions[target].PlayerID,
			})
			if err != nil {
				errors <- err
			} else if !response.Reply.OK {
				errors <- fmt.Errorf("vote rejected: %s", response.Reply.Error)
			}
		})
	}
	wg.Wait()
	close(errors)
	for err := range errors {
		t.Error(err)
	}
	if t.Failed() {
		return
	}
	for _, c := range clients {
		v := waitFor(t, c, func(v game.View) bool { return v.Phase == "finished" })
		if v.Winner == nil ||
			*v.Winner != "civilian" ||
			v.Words == nil ||
			v.Result == nil ||
			*v.Result.EliminatedID != sessions[spy].PlayerID {
			t.Fatal("wrong final result")
		}
	}
	act(t, clients[0], game.Action{Type: "rematch", StageID: clients[0].view.StageID})
	for _, c := range clients {
		v := waitFor(t, c, func(v game.View) bool { return v.Phase == "lobby" })
		if len(v.History) != 4 || v.Self.Word != nil {
			t.Fatal("rematch history/secret incorrect")
		}
	}
}

func TestWebSocketLargeRoomFlow(t *testing.T) {
	const playerCount = 32
	url := testServer(t)
	clients, sessions := roomClients(t, url, playerCount)

	response, err := clients[1].action(game.Action{Type: "start", StageID: clients[1].view.StageID})
	if err != nil || response.Reply.OK || response.Reply.Code != "GAME" {
		t.Fatal("non-host started large-room game")
	}
	act(t, clients[0], game.Action{Type: "start", StageID: clients[0].view.StageID})
	for _, c := range clients {
		v := waitFor(t, c, func(v game.View) bool { return v.Phase == "reveal" })
		if len(v.Players) != playerCount || v.Self.Word == nil || v.Words != nil {
			t.Fatal("large-room reveal state is incomplete")
		}
		for _, player := range v.Players {
			if !player.Connected || player.Role != "" {
				t.Fatal("large-room connection or role privacy is incorrect")
			}
		}
		data, err := json.Marshal(v)
		if err != nil {
			t.Fatal(err)
		}
		for _, session := range sessions {
			if strings.Contains(string(data), session.Token) {
				t.Fatal("session token leaked in large-room state")
			}
		}
		act(t, c, game.Action{Type: "ready", StageID: v.StageID})
	}

	clientsByPlayerID := make(map[string]*client, playerCount)
	for index, session := range sessions {
		clientsByPlayerID[session.PlayerID] = clients[index]
	}
	for _, c := range clients {
		waitFor(t, c, func(v game.View) bool { return v.Phase == "clue" })
	}
	for range playerCount {
		current := clients[0].view
		if current.SpeakerID == nil {
			t.Fatal("large-room clue turn has no speaker")
		}
		speaker := clientsByPlayerID[*current.SpeakerID]
		if speaker == nil {
			t.Fatal("large-room speaker is not connected")
		}
		act(t, speaker, game.Action{Type: "clue", StageID: current.StageID, Text: "คำใบ้"})
		for _, c := range clients {
			waitFor(t, c, func(v game.View) bool { return v.StageID != current.StageID })
		}
	}
	for _, c := range clients {
		v := c.view
		if v.Phase != "vote" ||
			len(v.Players) != playerCount ||
			len(v.History) != playerCount ||
			v.Words != nil {
			t.Fatal("large-room live state or clue history is incomplete")
		}
		for _, player := range v.Players {
			if !player.Connected || player.Role != "" {
				t.Fatal("large-room vote state leaked a role or lost a connection")
			}
		}
	}
}

func TestWebSocketPermissionsIsolationAndResume(t *testing.T) {
	url := testServer(t)
	clients, sessions := roomClients(t, url, 3)
	other := dial(t, url)
	createdOther := act(t, other, game.Action{Type: "create", Name: "Other room", PIN: testPIN})
	initial, err := other.next()
	if err != nil ||
		initial.Type != "state" ||
		initial.Room.Code != createdOther.Reply.Session.Code {
		t.Fatal("unrelated room did not receive its initial broadcast")
	}
	response, err := clients[1].action(game.Action{Type: "start", StageID: clients[1].view.StageID})
	if err != nil || response.Reply.OK {
		t.Fatal("non-host started game")
	}
	if len(other.view.History) != 0 || len(other.view.Players) != 1 {
		t.Fatal("room state leaked")
	}
	act(t, clients[0], game.Action{Type: "start", StageID: clients[0].view.StageID})
	original := waitFor(t, clients[1], func(v game.View) bool { return v.Phase == "reveal" })
	clients[1].conn.CloseNow()
	waitFor(t, clients[0], func(v game.View) bool { return !v.Players[1].Connected })
	resumed := dial(t, url)
	act(t, resumed, game.Action{Type: "resume", Code: sessions[1].Code, Token: sessions[1].Token})
	v := waitFor(t, resumed, func(v game.View) bool { return v.Phase == "reveal" })
	if v.Self.ID != original.Self.ID || *v.Self.Word != *original.Self.Word || len(v.History) != 0 {
		t.Fatal("resume lost seat, secret, or history")
	}
	anonymous := dial(t, url)
	response, err = anonymous.action(game.Action{
		Type:  "resume",
		Code:  sessions[1].Code,
		Token: "wrong",
	})
	if err != nil || response.Reply.OK || response.Reply.Code != "SESSION" {
		t.Fatal("invalid token accepted")
	}
	select {
	case message, ok := <-other.messages:
		if !ok {
			t.Fatal("unrelated room disconnected")
		}
		t.Fatalf("main-room changes published to unrelated room: %#v", message)
	case <-time.After(200 * time.Millisecond):
	}
}

func TestWebSocketRejectsUnexpectedFieldsAndOrigin(t *testing.T) {
	url := testServer(t)
	c := dial(t, url)
	if err := c.conn.Write(
		c.ctx,
		websocket.MessageText,
		[]byte(`{"id":"bad","action":{"type":"create",`+
			`"name":"Bob","playerId":"spoof"}}`),
	); err != nil {
		t.Fatal(err)
	}
	response, err := c.next()
	if err != nil || response.Reply.OK || response.Reply.Code != "INVALID" {
		t.Fatal("unknown field accepted")
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	conn, httpResponse, err := websocket.Dial(ctx, url, &websocket.DialOptions{
		HTTPHeader: http.Header{"Origin": []string{"https://evil.example"}},
	})
	if conn != nil {
		conn.CloseNow()
	}
	if err == nil || httpResponse == nil || httpResponse.StatusCode != http.StatusForbidden {
		t.Fatal("foreign origin accepted")
	}
}

func TestHTTPRoutesAndStaticFiles(t *testing.T) {
	webDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(webDir, "index.html"), []byte("home"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(webDir, "assets"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(
		filepath.Join(webDir, "assets", "app.js"),
		[]byte("app"),
		0o600,
	); err != nil {
		t.Fatal(err)
	}

	app := server.New(webDir, nil)
	t.Cleanup(app.Close)
	tests := []struct {
		name         string
		path         string
		status       int
		body         string
		cacheControl string
		contentType  string
	}{
		{
			name:        "health",
			path:        "/healthz",
			status:      http.StatusOK,
			body:        `{"ok":true}`,
			contentType: "application/json",
		},
		{name: "index", path: "/", status: http.StatusOK, body: "home", cacheControl: "no-cache"},
		{name: "asset", path: "/assets/app.js", status: http.StatusOK, body: "app"},
		{
			name:   "missing asset",
			path:   "/assets/missing.js",
			status: http.StatusNotFound,
			body:   "404 page not found\n",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			response := httptest.NewRecorder()
			app.Handler().ServeHTTP(response, httptest.NewRequest(http.MethodGet, tt.path, nil))
			result := response.Result()
			defer result.Body.Close()
			body, err := io.ReadAll(result.Body)
			if err != nil {
				t.Fatal(err)
			}
			if result.StatusCode != tt.status || string(body) != tt.body {
				t.Fatalf(
					"GET %s = (%d, %q), want (%d, %q)",
					tt.path,
					result.StatusCode,
					body,
					tt.status,
					tt.body,
				)
			}
			if result.Header.Get("Cache-Control") != tt.cacheControl {
				t.Errorf(
					"GET %s Cache-Control = %q, want %q",
					tt.path,
					result.Header.Get("Cache-Control"),
					tt.cacheControl,
				)
			}
			if tt.contentType != "" && result.Header.Get("Content-Type") != tt.contentType {
				t.Errorf(
					"GET %s Content-Type = %q, want %q",
					tt.path,
					result.Header.Get("Content-Type"),
					tt.contentType,
				)
			}
			if tt.path != "/healthz" {
				if result.Header.Get("X-Content-Type-Options") != "nosniff" ||
					result.Header.Get("Referrer-Policy") != "same-origin" {
					t.Errorf("GET %s missing static security headers", tt.path)
				}
			}
		})
	}
	response := httptest.NewRecorder()
	app.Handler().ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/healthz", nil))
	if response.Code != http.StatusMethodNotAllowed {
		t.Fatalf("POST /healthz status = %d, want %d", response.Code, http.StatusMethodNotAllowed)
	}
}

func TestHTTPRouteWithoutFrontendBuild(t *testing.T) {
	app := server.New(t.TempDir(), nil)
	t.Cleanup(app.Close)
	response := httptest.NewRecorder()
	app.Handler().ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/", nil))
	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("GET / status = %d, want %d", response.Code, http.StatusServiceUnavailable)
	}
}

func TestWebSocketResumeReplacesActiveConnection(t *testing.T) {
	url := testServer(t)
	original := dial(t, url)
	session := act(t, original, game.Action{
		Type: "create",
		Name: "Original",
		PIN:  testPIN,
	}).Reply.Session
	if session == nil {
		t.Fatal("session not returned")
	}
	waitFor(t, original, func(v game.View) bool { return v.Code == session.Code })

	replacement := dial(t, url)
	act(t, replacement, game.Action{Type: "resume", Code: session.Code, Token: session.Token})
	for {
		message, err := original.next()
		if err != nil {
			t.Fatal(err)
		}
		if message.Type == "removed" {
			if message.Reason != "ที่นั่งนี้เปิดในอีกแท็บแล้ว กลับไปเล่นที่แท็บล่าสุด" ||
				message.MessageID != game.MessageIDSeatReplaced {
				t.Fatalf("replacement reason = %q", message.Reason)
			}
			break
		}
	}
	if _, err := original.next(); err == nil {
		t.Fatal("replaced connection remained open")
	}
	waitFor(t, replacement, func(v game.View) bool { return v.Self.ID == session.PlayerID })
}

func TestWebSocketRecoverReturnsPrivateStateAndReplacesActiveConnection(t *testing.T) {
	url := testServer(t)
	clients, sessions := roomClients(t, url, 3)
	act(t, clients[0], game.Action{Type: "start", StageID: clients[0].view.StageID})
	original := waitFor(t, clients[1], func(v game.View) bool { return v.Phase == "reveal" })

	replacement := dial(t, url)
	response := act(t, replacement, game.Action{
		Type: "recover",
		Code: sessions[1].Code,
		Name: "  PLAYER 2  ",
		PIN:  testPIN,
	})
	if response.Reply.Session == nil || response.Reply.Room == nil {
		t.Fatal("recovery reply omitted session or private room")
	}
	if response.Reply.Session.PlayerID != sessions[1].PlayerID ||
		response.Reply.Session.Token == sessions[1].Token {
		t.Fatalf("recovery session = %+v, original = %+v", response.Reply.Session, sessions[1])
	}
	if response.Reply.Room.Self.ID != original.Self.ID ||
		response.Reply.Room.Self.Word == nil ||
		*response.Reply.Room.Self.Word != *original.Self.Word {
		t.Fatal("recovery reply lost private identity or word")
	}
	for {
		message, err := clients[1].next()
		if err != nil {
			t.Fatal(err)
		}
		if message.Type == "removed" {
			if message.MessageID != game.MessageIDSeatReplaced {
				t.Fatalf("recovery replacement metadata = %+v", message)
			}
			break
		}
	}
	if _, err := clients[1].next(); err == nil {
		t.Fatal("replaced connection remained open")
	}
	probe := dial(t, url)
	failed, err := probe.action(game.Action{
		Type:  "resume",
		Code:  sessions[1].Code,
		Token: sessions[1].Token,
	})
	if err != nil || failed.Reply.OK || failed.Reply.Code != "SESSION" {
		t.Fatalf("old token resume = %+v, err=%v", failed.Reply, err)
	}
}

func TestWebSocketPINRecoveryLimitIsSharedAcrossPeers(t *testing.T) {
	url := testServer(t)
	host := dial(t, url)
	session := act(t, host, game.Action{Type: "create", Name: "Host", PIN: testPIN}).Reply.Session
	if session == nil {
		t.Fatal("session not returned")
	}
	unknown := dial(t, url)
	unknownReply, err := unknown.action(game.Action{
		Type: "recover",
		Code: session.Code,
		Name: "Unknown",
		PIN:  testPIN,
	})
	if err != nil ||
		unknownReply.Reply.OK ||
		unknownReply.Reply.Code != "SESSION" ||
		unknownReply.Reply.MessageID != game.MessageIDRecoveryCredentialInvalid ||
		len(unknownReply.Reply.MessageParams) != 0 {
		t.Fatalf("unknown recovery = %+v, err=%v", unknownReply.Reply, err)
	}
	for attempt := range 5 {
		peer := dial(t, url)
		response, err := peer.action(game.Action{
			Type: "recover",
			Code: session.Code,
			Name: "Host",
			PIN:  "999999",
		})
		if err != nil ||
			response.Reply.OK ||
			response.Reply.Code != "SESSION" ||
			response.Reply.Error != unknownReply.Reply.Error ||
			response.Reply.MessageID != unknownReply.Reply.MessageID ||
			len(response.Reply.MessageParams) != 0 {
			t.Fatalf("attempt %d = %+v, err=%v", attempt+1, response.Reply, err)
		}
	}
	limited := dial(t, url)
	response, err := limited.action(game.Action{
		Type: "recover",
		Code: session.Code,
		Name: "Host",
		PIN:  testPIN,
	})
	if err != nil ||
		response.Reply.OK ||
		response.Reply.Code != "LIMIT" ||
		response.Reply.Error != "ลอง PIN ผิดหลายครั้ง รอ 1 นาทีแล้วลองใหม่" ||
		response.Reply.MessageID != game.MessageIDRecoveryRateLimited ||
		len(response.Reply.MessageParams) != 0 {
		t.Fatalf("limited recovery = %+v, err=%v", response.Reply, err)
	}
	tokenPeer := dial(t, url)
	act(t, tokenPeer, game.Action{Type: "resume", Code: session.Code, Token: session.Token})
}

func TestWebSocketConcurrentPINRecoveriesLeaveOnlyLatestTokenValid(t *testing.T) {
	url := testServer(t)
	host := dial(t, url)
	original := act(t, host, game.Action{Type: "create", Name: "Host", PIN: testPIN}).Reply.Session
	if original == nil {
		t.Fatal("session not returned")
	}
	peers := []*client{dial(t, url), dial(t, url)}
	type result struct {
		response response
		err      error
	}
	results := make(chan result, len(peers))
	var ready sync.WaitGroup
	ready.Add(len(peers))
	start := make(chan struct{})
	for _, peer := range peers {
		go func() {
			ready.Done()
			<-start
			response, err := peer.action(game.Action{
				Type: "recover",
				Code: original.Code,
				Name: "Host",
				PIN:  testPIN,
			})
			results <- result{response: response, err: err}
		}()
	}
	ready.Wait()
	close(start)

	tokens := make([]string, 0, len(peers))
	for range peers {
		result := <-results
		if result.err != nil || !result.response.Reply.OK || result.response.Reply.Session == nil {
			t.Fatalf("concurrent recovery = %+v, err=%v", result.response.Reply, result.err)
		}
		tokens = append(tokens, result.response.Reply.Session.Token)
	}
	if tokens[0] == tokens[1] || tokens[0] == original.Token || tokens[1] == original.Token {
		t.Fatalf(
			"tokens were not independently rotated: original=%q recovered=%q",
			original.Token,
			tokens,
		)
	}

	valid := 0
	for _, token := range tokens {
		probe := dial(t, url)
		response, err := probe.action(game.Action{
			Type:  "resume",
			Code:  original.Code,
			Token: token,
		})
		if err != nil {
			t.Fatal(err)
		}
		if response.Reply.OK {
			valid++
		} else if response.Reply.Code != "SESSION" {
			t.Fatalf("stale recovered token error = %+v", response.Reply)
		}
	}
	if valid != 1 {
		t.Fatalf("valid recovered token count = %d, want 1", valid)
	}
	oldProbe := dial(t, url)
	response, err := oldProbe.action(game.Action{
		Type:  "resume",
		Code:  original.Code,
		Token: original.Token,
	})
	if err != nil || response.Reply.OK || response.Reply.Code != "SESSION" {
		t.Fatalf("original token resume = %+v, err=%v", response.Reply, err)
	}
}

func TestWebSocketCreateAndJoinRequireSixDigitPIN(t *testing.T) {
	url := testServer(t)
	for _, pin := range []string{"", "12345", "１２３４５６"} {
		client := dial(t, url)
		response, err := client.action(game.Action{Type: "create", Name: "Host", PIN: pin})
		if err != nil ||
			response.Reply.OK ||
			response.Reply.Code != "GAME" ||
			response.Reply.MessageID != game.MessageIDPINFormatInvalid {
			t.Fatalf("create PIN %q response = %+v, err=%v", pin, response.Reply, err)
		}
	}
	host := dial(t, url)
	session := act(t, host, game.Action{Type: "create", Name: "Host", PIN: "000001"}).Reply.Session
	guest := dial(t, url)
	response, err := guest.action(game.Action{Type: "join", Code: session.Code, Name: "Guest"})
	if err != nil ||
		response.Reply.OK ||
		response.Reply.Code != "GAME" ||
		response.Reply.MessageID != game.MessageIDPINFormatInvalid {
		t.Fatalf("join without PIN response = %+v, err=%v", response.Reply, err)
	}
}

func TestWebSocketErrorIncludesFallbackIdentifierAndParameters(t *testing.T) {
	url := testServer(t)
	client := dial(t, url)
	response, err := client.action(game.Action{Type: "create", Name: "", PIN: testPIN})
	if err != nil {
		t.Fatal(err)
	}
	if response.Reply.OK ||
		response.Reply.Code != "GAME" ||
		response.Reply.Error != "ข้อความต้องมี 1–20 ตัวอักษร" ||
		response.Reply.MessageID != game.MessageIDTextLengthOutOfRange {
		t.Fatalf("create response = %+v", response.Reply)
	}
	if response.Reply.MessageParams["min"] != float64(1) ||
		response.Reply.MessageParams["max"] != float64(20) {
		t.Fatalf("message params = %#v", response.Reply.MessageParams)
	}
}

func TestWebSocketRemoveAndLeaveClearSessions(t *testing.T) {
	url := testServer(t)
	clients, sessions := roomClients(t, url, 2)
	act(t, clients[0], game.Action{
		Type:     "remove",
		StageID:  clients[0].view.StageID,
		TargetID: sessions[1].PlayerID,
	})
	for {
		message, err := clients[1].next()
		if err != nil {
			t.Fatal(err)
		}
		if message.Type == "removed" {
			if message.Reason != "เจ้าของห้องนำคุณออกจากห้องแล้ว" ||
				message.MessageID != game.MessageIDRemovedByHost {
				t.Fatalf("removal reason = %q", message.Reason)
			}
			break
		}
	}
	response, err := clients[1].action(game.Action{Type: "settings"})
	if err != nil || response.Reply.OK || response.Reply.Code != "SESSION" {
		t.Fatal("removed connection retained its session")
	}

	act(t, clients[0], game.Action{Type: "leave"})
	act(t, clients[0], game.Action{Type: "create", Name: "New room", PIN: testPIN})
}

func TestCloseIsConcurrentAndRejectsNewPeers(t *testing.T) {
	app := server.New(t.TempDir(), nil)
	t.Cleanup(app.Close)
	httpServer := httptest.NewServer(app.Handler())
	t.Cleanup(httpServer.Close)
	url := "ws" + strings.TrimPrefix(httpServer.URL, "http") + "/ws"
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	conn, _, err := websocket.Dial(ctx, url, nil)
	if err != nil {
		t.Fatal(err)
	}
	activeConn := conn
	t.Cleanup(func() { activeConn.CloseNow() })

	var wg sync.WaitGroup
	for range 8 {
		wg.Go(app.Close)
	}
	wg.Wait()
	if _, _, err := conn.Read(ctx); err == nil {
		t.Fatal("connection remained open after Close returned")
	}

	newConn, _, err := websocket.Dial(ctx, url, nil)
	if err == nil {
		defer newConn.CloseNow()
		if _, _, err := newConn.Read(ctx); err == nil {
			t.Fatal("connection registered after server closed")
		}
	}
}
