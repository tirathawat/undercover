import { Vote } from 'lucide-react';
import { Button } from '../../../design-system/Button';
import { Avatar } from '../../../game/Avatar';
import { useTranslation } from '../../../i18n';
import type { StageProps } from './stage-props';
import type { RoomView } from '../../../../shared/game';

export function ResultStage({ room, disabled, send }: StageProps) {
  const { t } = useTranslation();
  const eliminated = room.players.find(
    (player) => player.id === room.result?.eliminatedId,
  );
  const isHost = room.hostId === room.self.id;
  return (
    <section className="stage-panel result-stage">
      {eliminated ? (
        <>
          <Avatar index={eliminated.avatar} large />
          <h2 tabIndex={-1}>
            {t('result.eliminatedTitle', { name: eliminated.name })}
          </h2>
          <span className={`role-badge ${room.result?.role}`}>
            {room.result?.role === 'undercover'
              ? t('result.undercoverRole')
              : room.result?.role === 'whiteGuy'
                ? t('result.whiteGuyRole')
                : t('result.civilianRole')}
          </span>
        </>
      ) : (
        <>
          <span className="stage-symbol">
            <Vote size={36} aria-hidden="true" />
          </span>
          <h2 tabIndex={-1}>{t('result.tieTitle')}</h2>
          <p>{t('result.tieDescription')}</p>
        </>
      )}
      <GuessResult room={room} />
      <VoteCounts room={room} />
      {isHost ? (
        <Button
          variant="primary"
          disabled={disabled}
          onClick={() => send({ type: 'next', stageId: room.stageId })}
        >
          {eliminated ? t('result.nextRound') : t('result.runoff')}
        </Button>
      ) : (
        <span className="waiting-label">{t('result.waiting')}</span>
      )}
    </section>
  );
}

export function GuessResult({
  room,
  final = false,
}: {
  room: RoomView;
  final?: boolean;
}) {
  const { t } = useTranslation();
  if (!room.result?.guess) return null;
  return (
    <p className="guess-result">
      {t(final ? 'finished.finalGuess' : 'result.guess', {
        text: room.result.guess.text,
        result: room.result.guess.correct
          ? t('result.correct')
          : t('result.incorrect'),
      })}
    </p>
  );
}

export function VoteCounts({ room }: { room: RoomView }) {
  const { t } = useTranslation();
  return (
    <div className="vote-counts">
      {Object.entries(room.result?.counts ?? {}).map(([id, count]) => (
        <div key={id}>
          <span>
            {room.players.find((player) => player.id === id)?.name ??
              t('result.removedPlayer')}
          </span>
          <div className="vote-bar" aria-hidden="true">
            <i
              style={{
                width: `${(count / Math.max(room.voteCount, 1)) * 100}%`,
              }}
            />
          </div>
          <strong>{t('result.voteCount', { count })}</strong>
        </div>
      ))}
    </div>
  );
}
