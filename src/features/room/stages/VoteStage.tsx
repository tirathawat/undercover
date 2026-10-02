import { useState } from 'react';
import { Check, ShieldCheck, Vote } from 'lucide-react';
import { Button } from '../../../design-system/Button';
import { Avatar } from '../../../game/Avatar';
import { Trans, useTranslation } from '../../../i18n';
import type { StageProps } from './stage-props';

export function VoteStage({ room, disabled, send }: StageProps) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState('');
  const self = room.players.find((player) => player.id === room.self.id)!;
  const alive = room.players.filter((player) => player.alive);
  const isHost = room.hostId === room.self.id;
  const candidates = room.players.filter(
    (player) =>
      room.voteCandidates.includes(player.id) &&
      player.id !== self.id &&
      player.alive,
  );
  const selectedPlayer = candidates.find((player) => player.id === selected);
  return (
    <section className="stage-panel vote-stage">
      <span className="round-label">
        {t('vote.round', { round: room.round })}
      </span>
      <span className="stage-symbol">
        <Vote size={36} strokeWidth={1.5} aria-hidden="true" />
      </span>
      <h2 tabIndex={-1}>
        {room.result?.tiedIds.length ? t('vote.runoffTitle') : t('vote.title')}
      </h2>
      <p>
        <Trans i18nKey="vote.description" components={{ br: <br /> }} />
      </p>
      <div className="vote-progress">
        {t('vote.progress', { votes: room.voteCount, count: alive.length })}
      </div>
      {self.alive && !room.self.hasVoted ? (
        <>
          <div
            className="vote-options"
            role="group"
            aria-label={t('vote.candidates')}
          >
            {candidates.map((player) => (
              <button
                key={player.id}
                disabled={disabled}
                className="vote-option"
                aria-pressed={selected === player.id}
                onClick={() => setSelected(player.id)}
              >
                <Avatar index={player.avatar} />
                <span>{player.name}</span>
                <span className="vote-radio">
                  {selected === player.id && (
                    <Check size={16} aria-hidden="true" />
                  )}
                </span>
              </button>
            ))}
          </div>
          <Button
            variant="primary"
            disabled={disabled || !selectedPlayer}
            onClick={() =>
              selectedPlayer &&
              send({
                type: 'vote',
                stageId: room.stageId,
                targetId: selectedPlayer.id,
              })
            }
          >
            {selectedPlayer
              ? t('vote.confirmPlayer', { name: selectedPlayer.name })
              : t('vote.confirm')}
          </Button>
          <span className="stage-footnote">{t('vote.note')}</span>
        </>
      ) : (
        <div className="vote-submitted">
          <ShieldCheck size={24} aria-hidden="true" />
          <span>{self.alive ? t('vote.submitted') : t('vote.eliminated')}</span>
        </div>
      )}
      {isHost && alive.some((player) => !player.connected) && (
        <button
          className="text-link"
          disabled={disabled || !room.voteCount}
          onClick={() => send({ type: 'finishVote', stageId: room.stageId })}
        >
          {t('vote.finish')}
        </button>
      )}
    </section>
  );
}
