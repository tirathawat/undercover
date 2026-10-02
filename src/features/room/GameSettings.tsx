import { Check, Minus, Plus, Settings as SettingsIcon } from 'lucide-react';
import { IconButton } from '../../design-system/IconButton';
import { useTranslation } from '../../i18n';
import {
  categories,
  type GameAction,
  type RoomView,
} from '../../../shared/game';
import { minimumPlayers } from './room-rules';

interface Props {
  room: RoomView;
  disabled: boolean;
  send: (action: GameAction) => Promise<boolean>;
}

export function GameSettings({ room, disabled, send }: Props) {
  const { t } = useTranslation();
  const isHost = room.hostId === room.self.id;
  const requiredPlayers = minimumPlayers(room.settings);
  if (room.phase !== 'lobby') return null;
  return (
    <section className="settings-panel">
      <div className="panel-title">
        <h2>
          <SettingsIcon size={21} aria-hidden="true" /> {t('settings.title')}
        </h2>
      </div>
      <p className="panel-subtitle">
        {isHost
          ? t('settings.hostDescription')
          : t('settings.participantDescription')}
      </p>
      <h3 className="field-label">{t('settings.category')}</h3>
      <div className="category-grid">
        {categories.map((category) => (
          <button
            key={category.value}
            disabled={disabled || !isHost}
            aria-pressed={room.settings.category === category.value}
            onClick={() =>
              send({
                type: 'settings',
                stageId: room.stageId,
                settings: { ...room.settings, category: category.value },
              })
            }
          >
            {room.settings.category === category.value && (
              <Check size={17} aria-hidden="true" />
            )}
            {t(`categories.${category.value}`)}
          </button>
        ))}
      </div>
      <div className="undercover-setting">
        <div>
          <strong>{t('common.undercover')}</strong>
          <p>{t('settings.undercoverDescription')}</p>
        </div>
        <div className="stepper">
          <IconButton
            aria-label={t('settings.decreaseUndercover')}
            disabled={disabled || !isHost || room.settings.undercovers <= 1}
            onClick={() =>
              send({
                type: 'settings',
                stageId: room.stageId,
                settings: {
                  ...room.settings,
                  undercovers: room.settings.undercovers - 1,
                },
              })
            }
          >
            <Minus size={20} aria-hidden="true" />
          </IconButton>
          <strong>{room.settings.undercovers}</strong>
          <IconButton
            aria-label={t('settings.increaseUndercover')}
            disabled={
              disabled ||
              !isHost ||
              room.settings.undercovers >= 3 ||
              (!room.settings.whiteGuys &&
                room.players.length >= 3 &&
                (room.settings.undercovers + 1) * 2 >= room.players.length)
            }
            onClick={() =>
              send({
                type: 'settings',
                stageId: room.stageId,
                settings: {
                  ...room.settings,
                  undercovers: room.settings.undercovers + 1,
                },
              })
            }
          >
            <Plus size={20} aria-hidden="true" />
          </IconButton>
        </div>
      </div>
      <div className="white-guy-setting">
        <div>
          <strong>{t('common.whiteGuy')}</strong>
          <p>{t('settings.whiteGuyDescription')}</p>
        </div>
        <button
          className="setting-toggle"
          disabled={
            disabled ||
            !isHost ||
            (room.settings.whiteGuys === 1 &&
              room.players.length >= 3 &&
              room.settings.undercovers * 2 >= room.players.length)
          }
          aria-label={t('settings.toggleWhiteGuy')}
          aria-pressed={room.settings.whiteGuys === 1}
          onClick={() =>
            send({
              type: 'settings',
              stageId: room.stageId,
              settings: {
                ...room.settings,
                whiteGuys: room.settings.whiteGuys ? 0 : 1,
              },
            })
          }
        >
          {room.settings.whiteGuys ? t('settings.on') : t('settings.off')}
        </button>
      </div>
      <p className="settings-note">
        {room.settings.whiteGuys
          ? t('settings.whiteGuyMinimum', { count: requiredPlayers })
          : t('settings.note')}
      </p>
    </section>
  );
}
