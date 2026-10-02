import type { GameAction, RoomView, Session } from '../../shared/game';
import {
  decodeServerMessage,
  isSession,
  type ServerMessage,
} from './protocol.ts';
import {
  replyMessage,
  type GameMessage,
  type RequestReply,
} from './messages.ts';

interface ConnectionState {
  room: RoomView | null;
  connected: boolean;
  restoring: boolean;
  pending: boolean;
  error: GameMessage | null;
}

const storageKey = 'undercover-session';
const disconnectedReply: RequestReply = {
  ok: false,
  messageId: 'CONNECTION_DROPPED',
  code: 'GAME',
};

function savedSession(): Session | null {
  try {
    const value: unknown = JSON.parse(
      sessionStorage.getItem(storageKey) ?? 'null',
    );
    if (isSession(value)) return value;
    sessionStorage.removeItem(storageKey);
  } catch {
    return null;
  }
  return null;
}

function persistSession(session: Session | null): boolean {
  try {
    if (session) sessionStorage.setItem(storageKey, JSON.stringify(session));
    else sessionStorage.removeItem(storageKey);
    return true;
  } catch {
    return false;
  }
}

export class GameConnection {
  private session = savedSession();
  private state: ConnectionState = {
    room: null,
    connected: false,
    restoring: Boolean(this.session),
    pending: false,
    error: null,
  };
  private listeners = new Set<() => void>();
  private socket: WebSocket | null = null;
  private reconnect: ReturnType<typeof setTimeout> | null = null;
  private attempts = 0;
  private requestSequence = 0;
  private requests = new Map<string, (reply: RequestReply) => void>();

  getSnapshot = () => this.state;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    this.connect();
    return () => {
      this.listeners.delete(listener);
      queueMicrotask(() => {
        if (this.listeners.size === 0) this.dispose();
      });
    };
  };

  clearError = () => this.update({ error: null });

  send = async (action: GameAction): Promise<boolean> => {
    if (!this.state.connected || this.state.restoring) {
      this.update({ error: { messageId: 'CONNECTION_RECONNECTING' } });
      return false;
    }
    if (this.state.pending) return false;
    this.update({ pending: true, error: null });
    const reply = await this.request(action);
    this.update({ pending: false });
    if (!reply.ok) {
      this.update({ error: replyMessage(reply) });
      return false;
    }
    if (action.type === 'leave') {
      this.storeSession(null);
      window.history.replaceState({}, '', window.location.pathname);
      this.update({ room: null });
    }
    return true;
  };

  private update(patch: Partial<ConnectionState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  private storeSession(session: Session | null) {
    this.session = session;
    if (!persistSession(session) && session) {
      this.update({
        error: { messageId: 'SESSION_PERSISTENCE_FAILED' },
      });
    }
  }

  private enterRoom(session: Session, room?: RoomView) {
    this.update({ error: null });
    this.storeSession(session);
    const url = new URL(window.location.href);
    url.searchParams.set('room', session.code);
    window.history.replaceState({}, '', url);
    if (room) this.update({ room, restoring: false });
  }

  private connect() {
    if (this.socket || this.reconnect || this.listeners.size === 0) return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);
    this.socket = socket;
    socket.onopen = () => {
      if (this.socket === socket) void this.restoreSession(socket);
    };
    socket.onmessage = (event: MessageEvent<string>) => {
      if (this.socket !== socket) return;
      const message = decodeServerMessage(event.data);
      if (message) this.receive(message);
      else this.update({ error: { messageId: 'SERVER_MESSAGE_INVALID' } });
    };
    socket.onclose = () => this.disconnect(socket);
  }

  private async restoreSession(socket: WebSocket) {
    this.attempts = 0;
    this.update({ connected: true, restoring: Boolean(this.session) });
    if (this.session) {
      const reply = await this.request({
        type: 'resume',
        code: this.session.code,
        token: this.session.token,
      });
      if (this.socket !== socket) return;
      if (reply.ok) {
        if (!reply.session) this.update({ error: null });
        return;
      }
      if (reply.code === 'SESSION') {
        this.storeSession(null);
        this.update({
          room: null,
          restoring: false,
          error: replyMessage(reply),
        });
      } else {
        this.update({ error: replyMessage(reply) });
        socket.close();
        this.disconnect(socket);
      }
      return;
    }
    this.update({ restoring: false, error: null });
  }

  private receive(message: ServerMessage) {
    switch (message.type) {
      case 'state':
        this.update({ room: message.room, restoring: false });
        break;
      case 'reply':
        this.requests.get(message.id)?.(message.reply);
        break;
      case 'removed':
        this.storeSession(null);
        window.history.replaceState({}, '', window.location.pathname);
        this.update({
          room: null,
          restoring: false,
          error:
            message.reason || message.messageId
              ? {
                  messageId: message.messageId,
                  messageParams: message.messageParams,
                  fallback: message.reason,
                }
              : null,
        });
        break;
    }
  }

  private settleRequests() {
    for (const finish of this.requests.values()) finish(disconnectedReply);
  }

  private disconnect(socket: WebSocket) {
    if (this.socket !== socket) return;
    this.socket = null;
    this.update({ connected: false, ...(!this.session ? { room: null } : {}) });
    this.settleRequests();
    if (this.listeners.size) {
      this.reconnect = setTimeout(
        () => {
          this.reconnect = null;
          this.connect();
        },
        Math.min(500 * 2 ** this.attempts++, 10_000),
      );
    }
  }

  private dispose() {
    if (this.reconnect) clearTimeout(this.reconnect);
    this.reconnect = null;
    const socket = this.socket;
    this.socket = null;
    socket?.close();
    this.settleRequests();
    this.update({ connected: false, restoring: false });
  }

  private request(action: GameAction): Promise<RequestReply> {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return Promise.resolve({
        ok: false,
        messageId: 'CONNECTION_UNAVAILABLE',
        code: 'GAME',
      });
    }
    const id = `${Date.now()}-${++this.requestSequence}`;
    return new Promise((resolve) => {
      let grace: ReturnType<typeof setTimeout> | undefined;
      const finish = (reply: RequestReply) => {
        clearTimeout(timeout);
        clearTimeout(grace);
        this.requests.delete(id);
        if (reply.ok && reply.session)
          this.enterRoom(reply.session, reply.room);
        resolve(reply);
      };
      const timeout = setTimeout(() => {
        const reply: RequestReply = {
          ok: false,
          messageId: 'REQUEST_TIMED_OUT',
          code: 'GAME',
        };
        if (
          action.type === 'create' ||
          action.type === 'join' ||
          action.type === 'recover'
        ) {
          this.update({ error: replyMessage(reply) });
          grace = setTimeout(() => {
            finish(reply);
            socket.close();
            this.disconnect(socket);
          }, 6000);
        } else {
          finish(reply);
        }
      }, 6000);
      this.requests.set(id, finish);
      try {
        socket.send(JSON.stringify({ id, action }));
      } catch {
        finish(disconnectedReply);
        socket.close();
        this.disconnect(socket);
      }
    });
  }
}

export const gameConnection = new GameConnection();
