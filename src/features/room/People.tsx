import { useLayoutEffect, useRef, useState } from 'react';
import type { GameAction, RoomView } from '../../../shared/game';
import { GameSettings } from './GameSettings';
import { PlayerList } from './PlayerList';
import { RemovePlayerModal } from './RemovePlayerModal';
import { useAsyncConfirmation } from '../../hooks/use-async-confirmation';

interface Props {
  room: RoomView;
  disabled: boolean;
  send: (action: GameAction) => Promise<boolean>;
}

export function People({ room, disabled, send }: Props) {
  const [removeId, setRemoveId] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const removeButton = useRef<HTMLButtonElement>(null);
  const restorePlayerFocus = useRef(false);
  const removed = room.players.find((player) => player.id === removeId);
  const {
    confirm: confirmRemoval,
    submitting,
    submissionError,
    clearSubmissionError,
  } = useAsyncConfirmation(
    (targetId: string) =>
      send({ type: 'remove', stageId: room.stageId, targetId }),
    () => {
      restorePlayerFocus.current = removeButton.current !== null;
      if (!removeButton.current) heading.current?.focus();
      setRemoveId(null);
    },
  );

  useLayoutEffect(() => {
    if (!removed) {
      if (
        restorePlayerFocus.current ||
        (removeButton.current && !removeButton.current.isConnected)
      )
        heading.current?.focus();
      restorePlayerFocus.current = false;
      removeButton.current = null;
    }
  }, [removeId, removed]);

  return (
    <>
      <PlayerList
        room={room}
        disabled={disabled}
        heading={heading}
        onRemove={(playerId, button) => {
          removeButton.current = button;
          clearSubmissionError();
          setRemoveId(playerId);
        }}
      />
      <GameSettings room={room} disabled={disabled} send={send} />
      {removed && (
        <RemovePlayerModal
          removedName={removed.name}
          isLobby={room.phase === 'lobby'}
          disabled={disabled}
          submitting={submitting}
          submissionError={submissionError}
          close={() => setRemoveId(null)}
          confirm={() => confirmRemoval(removed.id)}
        />
      )}
    </>
  );
}
