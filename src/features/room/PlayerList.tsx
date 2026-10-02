import type { RefObject } from 'react';
import { Crown, UserRoundMinus } from 'lucide-react';
import { IconButton } from '../../design-system/IconButton';
import { Avatar } from '../../game/Avatar';
import type { RoomView } from '../../../shared/game';
import { useTranslation } from '../../i18n';

interface Props {
  room: RoomView;
  disabled: boolean;
  heading: RefObject<HTMLHeadingElement | null>;
  onRemove: (playerId: string, button: HTMLButtonElement) => void;
}

export function PlayerList({ room, disabled, heading, onRemove }: Props) {
  const { t } = useTranslation();
  const isHost = room.hostId === room.self.id;
  return (
    <section className="players-panel">
      <div className="panel-title">
        <h2 ref={heading} tabIndex={-1}>
          {t('players.title')}
        </h2>
        <span className="count-pill">
          {t('players.count', { count: room.players.length })}
        </span>
      </div>
      <ul className="players-list">
        {room.players.map((player) => (
          <li
            className={`player-row ${!player.alive ? 'eliminated' : ''} ${room.speakerId === player.id ? 'speaking' : ''}`}
            key={player.id}
          >
            <Avatar index={player.avatar} />
            <div className="player-info">
              <strong>
                {player.name}
                {player.id === room.self.id && (
                  <span className="you-label">{t('common.you')}</span>
                )}
                {player.id === room.hostId && (
                  <Crown size={15} aria-label={t('common.host')} />
                )}
              </strong>
              <span>
                {player.role
                  ? player.role === 'undercover'
                    ? t('common.undercover')
                    : t('common.civilian')
                  : !player.alive
                    ? t('players.removed')
                    : !player.connected
                      ? t('players.disconnected')
                      : room.speakerId === player.id
                        ? t('players.speaking')
                        : room.phase === 'reveal'
                          ? player.ready
                            ? t('players.ready')
                            : t('players.viewingSecret')
                          : player.id === room.hostId
                            ? t('common.host')
                            : t('players.inRoom')}
              </span>
            </div>
            {isHost &&
              player.id !== room.self.id &&
              (room.phase === 'lobby' ||
                (!player.connected && player.alive)) && (
                <IconButton
                  className="remove-player"
                  aria-label={t('players.remove', { name: player.name })}
                  disabled={disabled}
                  onClick={(event) => onRemove(player.id, event.currentTarget)}
                >
                  <UserRoundMinus size={20} aria-hidden="true" />
                </IconButton>
              )}
          </li>
        ))}
      </ul>
    </section>
  );
}
