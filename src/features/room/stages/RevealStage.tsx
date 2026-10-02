import { Check, LockKeyhole } from 'lucide-react';
import { Button } from '../../../design-system/Button';
import { useTranslation } from '../../../i18n';
import type { StageProps } from './stage-props';

export function RevealStage({ room, disabled, send }: StageProps) {
  const { t } = useTranslation();
  const self = room.players.find((player) => player.id === room.self.id)!;
  const alive = room.players.filter((player) => player.alive);
  return (
    <section className="stage-panel">
      <span className="stage-symbol">
        <LockKeyhole size={36} strokeWidth={1.5} aria-hidden="true" />
      </span>
      <h2 tabIndex={-1}>
        {room.settings.whiteGuys ? t('reveal.privateTitle') : t('reveal.title')}
      </h2>
      <p>
        {self.ready
          ? room.settings.whiteGuys
            ? t('reveal.privateReadyDescription')
            : t('reveal.readyDescription')
          : room.settings.whiteGuys
            ? t('reveal.privateDescription')
            : t('reveal.description')}
      </p>
      <div className="ready-progress" role="status">
        {t('reveal.progress', {
          ready: alive.filter((player) => player.ready).length,
          count: alive.length,
        })}
      </div>
      <Button
        variant="primary"
        disabled={disabled || self.ready || !self.alive}
        onClick={() => send({ type: 'ready', stageId: room.stageId })}
      >
        <Check size={18} aria-hidden="true" />{' '}
        {self.ready
          ? t('reveal.waiting')
          : room.settings.whiteGuys
            ? t('reveal.privateReady')
            : t('reveal.ready')}
      </Button>
    </section>
  );
}
