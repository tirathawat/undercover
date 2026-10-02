import { Users } from 'lucide-react';
import { Button } from '../../../design-system/Button';
import { Avatar } from '../../../game/Avatar';
import { useTranslation } from '../../../i18n';
import type { StageProps } from './stage-props';

export function LobbyStage({ room, disabled, send }: StageProps) {
  const { t } = useTranslation();
  const isHost = room.hostId === room.self.id;
  const canStart =
    room.players.length >= 3 &&
    room.players.every((player) => player.connected) &&
    room.settings.undercovers * 2 < room.players.length;
  return (
    <section className="stage-panel lobby-stage">
      <span className="stage-symbol">
        <Users size={36} strokeWidth={1.5} aria-hidden="true" />
      </span>
      <h2 tabIndex={-1}>
        {room.players.length < 3
          ? t('lobby.inviteTitle')
          : t('lobby.readyTitle')}
      </h2>
      <p>
        {room.players.length < 3
          ? t('lobby.missingPlayers', { count: 3 - room.players.length })
          : t('lobby.readyDescription')}
      </p>
      <div className="lobby-avatars">
        {room.players.map((player) => (
          <Avatar key={player.id} index={player.avatar} />
        ))}
      </div>
      <span className="stage-footnote">
        {t('lobby.playerCount', { count: room.players.length })}
      </span>
      {isHost ? (
        <Button
          variant="primary"
          disabled={disabled || !canStart}
          onClick={() => send({ type: 'start', stageId: room.stageId })}
        >
          {t('lobby.start')}
        </Button>
      ) : (
        <span className="waiting-label">{t('lobby.waiting')}</span>
      )}
      {!canStart && room.players.length >= 3 && (
        <p className="stage-footnote">
          {room.players.some((player) => !player.connected)
            ? isHost
              ? t('lobby.hostDisconnected')
              : t('lobby.participantDisconnected')
            : t('lobby.civilianMajority')}
        </p>
      )}
    </section>
  );
}
