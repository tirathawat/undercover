import { useEffect, useRef, useState } from 'react';
import { Copy, Gamepad2, Link, NotebookPen, Users } from 'lucide-react';
import type { GameAction, RoomView } from '../../../shared/game';
import { History } from './History';
import { People } from './People';
import { SecretWord } from './SecretWord';
import { Stage } from './stages/Stage';
import { useRoomPanelFocus } from './use-room-panel-focus';
import { Button } from '../../design-system/Button';
import { useTranslation } from '../../i18n';

interface Props {
  room: RoomView;
  disabled: boolean;
  send: (action: GameAction) => Promise<boolean>;
}

export function Room({ room, disabled, send }: Props) {
  const { t } = useTranslation();
  const [view, setView] = useState<'play' | 'history' | 'people'>('play');
  const [copied, setCopied] = useState(false);
  const [copyFallback, setCopyFallback] = useState(false);
  const layout = useRoomPanelFocus(view, room.stageId);
  const copyInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (copyFallback) {
      copyInput.current?.focus();
      copyInput.current?.select();
    }
  }, [copyFallback]);
  const phaseLabel = t(`room.phases.${room.phase}`);
  const shareUrl = `${window.location.origin}/?room=${room.code}`;
  const speaker = room.players.find((player) => player.id === room.speakerId);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setCopyFallback(false);
    } catch {
      setCopied(false);
      setCopyFallback(true);
    }
  }

  return (
    <main id="main-content" className="room-page">
      <div className="room-page-heading">
        <div>
          <h1 tabIndex={-1}>{t('room.title')}</h1>
          <p>
            {room.game
              ? room.round
                ? t('room.gameRound', { game: room.game, round: room.round })
                : t('room.game', { game: room.game })
              : t('room.inviteDescription')}
          </p>
        </div>
        <span className="phase-pill">{phaseLabel}</span>
      </div>
      <p className="sr-only" role="status">
        {room.phase === 'vote'
          ? speaker
            ? t('room.speakerVoteStatus', {
                phase: phaseLabel,
                name: speaker.name,
                count: room.voteCount,
              })
            : t('room.voteStatus', { phase: phaseLabel, count: room.voteCount })
          : speaker
            ? t('room.speakerStatus', { phase: phaseLabel, name: speaker.name })
            : phaseLabel}
      </p>
      <div className="share-bar">
        <div className="share-code">
          <span>{t('room.code')}</span>
          <strong>{room.code}</strong>
        </div>
        <Button variant="secondary" onClick={copyLink}>
          <Link size={18} aria-hidden="true" /> {t('room.invite')}
        </Button>
      </div>
      <p className="share-status" role="status">
        {copied ? t('room.copied') : copyFallback ? t('room.copyFallback') : ''}
      </p>
      {copyFallback && (
        <div className="copy-fallback">
          <label htmlFor="share-url">{t('room.shareLink')}</label>
          <input
            ref={copyInput}
            id="share-url"
            value={shareUrl}
            readOnly
            onFocus={(event) => event.target.select()}
          />
          <Copy size={18} aria-hidden="true" />
        </div>
      )}
      <div ref={layout} className={`room-layout view-${view}`}>
        <div id="play-view" className="play-view">
          {view === 'play' && room.phase !== 'finished' && room.self.word && (
            <SecretWord key={`secret-${room.stageId}`} room={room} />
          )}
          <Stage
            key={`stage-${room.stageId}`}
            room={room}
            disabled={disabled}
            send={send}
          />
          {room.phase === 'lobby' && (
            <button
              className="lobby-settings-link"
              onClick={() => setView('people')}
            >
              <span>
                {t('room.lobbySettings', {
                  category: t(`categories.${room.settings.category}`),
                  count: room.settings.undercovers,
                })}
              </span>
              <span>{t('room.viewSettings')}</span>
            </button>
          )}
        </div>
        <div id="history-view" className="history-view">
          <History room={room} />
        </div>
        <div id="people-view" className="people-view">
          <People room={room} disabled={disabled} send={send} />
        </div>
      </div>
      <nav className="room-navigation" aria-label={t('room.navigation')}>
        <button
          aria-current={view === 'play' ? 'page' : undefined}
          aria-controls="play-view"
          onClick={() => setView('play')}
        >
          <span className="nav-icon">
            <Gamepad2 size={24} aria-hidden="true" />
          </span>
          <span>{t('room.gameView')}</span>
        </button>
        <button
          aria-current={view === 'history' ? 'page' : undefined}
          aria-controls="history-view"
          onClick={() => setView('history')}
        >
          <span className="nav-icon">
            <NotebookPen size={24} aria-hidden="true" />
            {room.history.length > 0 && (
              <span className="nav-badge" aria-hidden="true">
                {room.history.length}
              </span>
            )}
          </span>
          <span>{t('room.historyView')}</span>
        </button>
        <button
          aria-current={view === 'people' ? 'page' : undefined}
          aria-controls="people-view"
          onClick={() => setView('people')}
        >
          <span className="nav-icon">
            <Users size={24} aria-hidden="true" />
          </span>
          <span>{t('room.peopleView')}</span>
        </button>
      </nav>
    </main>
  );
}
