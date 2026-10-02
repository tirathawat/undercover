import { useState, type FormEvent } from 'react';
import { Send } from 'lucide-react';
import { Button } from '../../../design-system/Button';
import { Avatar } from '../../../game/Avatar';
import { useTranslation } from '../../../i18n';
import type { StageProps } from './stage-props';

export function ClueStage({ room, disabled, send }: StageProps) {
  const { t } = useTranslation();
  const [clue, setClue] = useState('');
  const self = room.players.find((player) => player.id === room.self.id)!;
  const speaker = room.players.find((player) => player.id === room.speakerId);
  const isHost = room.hostId === room.self.id;

  async function submitClue(event: FormEvent) {
    event.preventDefault();
    if (await send({ type: 'clue', stageId: room.stageId, text: clue }))
      setClue('');
  }

  return (
    <section
      className={`stage-panel clue-stage ${speaker?.id === self.id ? 'your-turn' : ''}`}
    >
      <span className="round-label">
        {t('clue.round', { round: room.round })}
      </span>
      {speaker && <Avatar index={speaker.avatar} large />}
      <h2 tabIndex={-1}>
        {speaker?.id === self.id
          ? t('clue.yourTurn')
          : t('clue.playerTurn', { name: speaker?.name ?? '' })}
      </h2>
      <p>
        {!self.alive
          ? t('clue.eliminatedDescription')
          : speaker?.id === self.id
            ? t('clue.yourTurnDescription')
            : t('clue.playerTurnDescription')}
      </p>
      {speaker?.id === self.id ? (
        <form className="clue-form" onSubmit={submitClue}>
          <label className="field-label" htmlFor="clue">
            {t('clue.label')}
          </label>
          <input
            id="clue"
            name="clue"
            value={clue}
            onChange={(event) => setClue(event.target.value)}
            maxLength={80}
            placeholder={t('clue.placeholder')}
            required
            disabled={disabled}
            autoComplete="off"
            aria-describedby="clue-hint"
          />
          <div className="clue-form-footer">
            <span id="clue-hint">
              {t('clue.length', { count: clue.length })}
            </span>
          </div>
          <Button
            variant="primary"
            type="submit"
            disabled={disabled || !clue.trim()}
          >
            <Send size={18} aria-hidden="true" /> {t('clue.submit')}
          </Button>
          <p className="stage-footnote">{t('clue.submitNote')}</p>
        </form>
      ) : (
        <span className="waiting-label">
          {speaker?.connected ? t('clue.waiting') : t('clue.disconnected')}
        </span>
      )}
      {isHost && speaker && !speaker.connected && (
        <Button
          variant="secondary"
          disabled={disabled}
          onClick={() => send({ type: 'skip', stageId: room.stageId })}
        >
          {t('clue.skip')}
        </Button>
      )}
    </section>
  );
}
