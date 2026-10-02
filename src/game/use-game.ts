import { useSyncExternalStore } from 'react';
import { gameConnection } from './connection';

export function useGame() {
  const state = useSyncExternalStore(
    gameConnection.subscribe,
    gameConnection.getSnapshot,
  );
  return {
    ...state,
    send: gameConnection.send,
    clearError: gameConnection.clearError,
  };
}
