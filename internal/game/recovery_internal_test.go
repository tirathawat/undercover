package game

import (
	"testing"
	"time"
)

func TestRecoverRateLimitPerSeatAndWindowBoundary(t *testing.T) {
	now := time.Date(2026, 10, 2, 12, 0, 0, 0, time.UTC)
	r := NewRoom("ABCDEF")
	r.now = func() time.Time { return now }
	session, err := r.Join("Player", 0, "012345")
	if err != nil {
		t.Fatal(err)
	}
	for attempt := range pinFailureLimit {
		_, err := r.Recover("Player", "999999")
		if gameErr, ok := err.(*Error); !ok || gameErr.Code != "SESSION" {
			t.Fatalf("attempt %d error = %T %v", attempt+1, err, err)
		}
	}
	if _, err := r.Recover("Player", "012345"); errorCode(err) != "LIMIT" {
		t.Fatalf("correct PIN before expiry error = %T %v", err, err)
	}
	if resumed, err := r.Resume(session.Token); err != nil || resumed.PlayerID != session.PlayerID {
		t.Fatalf("token resume affected by PIN limit: session=%+v err=%v", resumed, err)
	}
	now = now.Add(pinFailureWindow)
	if recovered, err := r.Recover("Player", "012345"); err != nil ||
		recovered.PlayerID != session.PlayerID {
		t.Fatalf("correct PIN at window boundary failed: session=%+v err=%v", recovered, err)
	}
	if p := r.find(session.PlayerID); p.pinFailures != 0 || !p.pinWindowStart.IsZero() {
		t.Fatalf("successful recovery did not reset failures: count=%d start=%v",
			p.pinFailures, p.pinWindowStart)
	}
}

func TestRecoverRateLimitIsPerSeat(t *testing.T) {
	r := NewRoom("ABCDEF")
	if _, err := r.Join("One", 0, "012345"); err != nil {
		t.Fatal(err)
	}
	if _, err := r.Join("Two", 0, "012345"); err != nil {
		t.Fatal(err)
	}
	for range pinFailureLimit {
		if _, err := r.Recover("One", "999999"); errorCode(err) != "SESSION" {
			t.Fatal(err)
		}
	}
	if _, err := r.Recover("Two", "012345"); err != nil {
		t.Fatalf("one seat throttled another: %v", err)
	}
}

func errorCode(err error) ErrorCode {
	if gameErr, ok := err.(*Error); ok {
		return gameErr.Code
	}
	return ""
}
