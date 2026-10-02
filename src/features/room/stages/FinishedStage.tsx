import { Trophy } from 'lucide-react';
import { Button } from '../../../design-system/Button';
import { useTranslation } from '../../../i18n';
import type { StageProps } from './stage-props';
import { GuessResult, VoteCounts } from './ResultStage';

export function FinishedStage({ room, disabled, send }: StageProps) {
  const { t } = useTranslation();
  const eliminated = room.players.find(
    (player) => player.id === room.result?.eliminatedId,
  );
  const isHost = room.hostId === room.self.id;
  const winner = room.winner ?? 'undercover';
  return (
    <section className="stage-panel finished-stage">
      <span className="stage-symbol">
        <Trophy size={40} strokeWidth={1.5} aria-hidden="true" />
      </span>
      <h2 tabIndex={-1}>{t(`finished.winners.${winner}.title`)}</h2>
      <p>
        {winner === 'whiteGuy' && !room.result?.guess?.correct
          ? t('finished.winners.whiteGuy.survivalDescription')
          : t(`finished.winners.${winner}.description`)}
      </p>
      <div className="word-reveal">
        <div>
          <span>{t('finished.civilianWord')}</span>
          <strong>{room.words?.civilian}</strong>
        </div>
        <div>
          <span>{t('finished.undercoverWord')}</span>
          <strong>{room.words?.undercover}</strong>
        </div>
      </div>
      {eliminated && (
        <p className="last-eliminated">
          {t('finished.lastEliminated', { name: eliminated.name })}
        </p>
      )}
      <GuessResult room={room} final />
      <VoteCounts room={room} />
      {isHost ? (
        <Button
          variant="primary"
          disabled={disabled}
          onClick={() => send({ type: 'rematch', stageId: room.stageId })}
        >
          {t('finished.rematch')}
        </Button>
      ) : (
        <span className="waiting-label">{t('finished.waiting')}</span>
      )}
      <span className="stage-footnote">{t('finished.historyNote')}</span>
    </section>
  );
}
