import { useEffect, useRef, useState } from 'react';
import { HelpCircle, LogOut, X } from 'lucide-react';
import { Brand } from './Brand';
import { RulesModal } from './RulesModal';
import { LeaveModal } from './LeaveModal';
import { IconButton } from '../design-system/IconButton';
import { Home } from '../features/home/Home';
import { Room } from '../features/room/Room';
import { useGame } from '../game/use-game';
import { useTranslation } from '../i18n';
import { translateMessage } from '../i18n/messages';

type ModalState =
  | { type: 'rules' }
  | { type: 'leave'; roomCode: string; playerId: string }
  | null;

export function App() {
  const { t } = useTranslation();
  const game = useGame();
  const errorBanner = useRef<HTMLDivElement>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const disabled = !game.connected || game.pending || game.restoring;
  const page = game.room?.code ?? (game.restoring ? 'restoring' : 'home');
  useEffect(() => {
    document.querySelector<HTMLElement>('#main-content h1')?.focus();
  }, [page]);
  useEffect(() => {
    if (game.error && !document.querySelector('dialog[open]'))
      errorBanner.current?.focus();
  }, [game.error]);
  const leaveTarget = game.room
    ? { roomCode: game.room.code, playerId: game.room.self.id }
    : null;
  const errorText = game.error ? translateMessage(t, game.error) : '';

  return (
    <div className={`app-shell ${game.room ? 'in-room' : ''}`}>
      <a className="skip-link" href="#main-content">
        {t('app.skipToContent')}
      </a>
      <header className="site-header">
        <Brand />
        <div className="header-actions">
          <span
            className={`connection-status ${game.connected && !game.restoring ? 'connected' : ''}`}
            aria-hidden="true"
          >
            <span className="tiny-dot" />
            {game.restoring
              ? t('app.reconnectingShort')
              : game.connected
                ? t('app.ready')
                : t('app.connecting')}
          </span>
          <button
            className="text-link rules-button"
            aria-label={t('app.rules')}
            onClick={() => setModal({ type: 'rules' })}
          >
            <HelpCircle size={17} aria-hidden="true" />
            <span className="rules-label">{t('app.rules')}</span>
          </button>
          {leaveTarget && (
            <IconButton
              aria-label={t('app.leaveRoom')}
              onClick={() =>
                setModal({
                  type: 'leave',
                  ...leaveTarget,
                })
              }
            >
              <LogOut size={18} />
            </IconButton>
          )}
        </div>
      </header>
      <span className="sr-only" role="status">
        {game.restoring
          ? t('app.reconnecting')
          : game.connected
            ? t('app.connected')
            : t('app.reconnectingAgain')}
      </span>
      <p className="request-status" role="status">
        {game.pending && game.room ? t('app.updatingGame') : ''}
      </p>
      {game.error && (
        <div
          ref={errorBanner}
          className="error-banner"
          role="alert"
          tabIndex={-1}
        >
          <span>{errorText}</span>
          <IconButton
            aria-label={t('app.dismissAlert')}
            onClick={game.clearError}
          >
            <X size={17} />
          </IconButton>
        </div>
      )}
      {!game.connected && game.room && (
        <div className="offline-banner" role="status">
          {t('app.offline')}
        </div>
      )}
      {game.restoring && !game.room ? (
        <main id="main-content" className="restoring-state">
          <span className="typing-dots">
            <i />
            <i />
            <i />
          </span>
          <h1 tabIndex={-1}>{t('app.restoringTitle')}</h1>
          <p>{t('app.restoringDescription')}</p>
        </main>
      ) : game.room ? (
        <Room
          key={game.room.code}
          room={game.room}
          disabled={disabled}
          send={game.send}
        />
      ) : (
        <Home
          send={game.send}
          disabled={disabled}
          pending={game.pending}
          showRules={() => setModal({ type: 'rules' })}
        />
      )}
      {modal?.type === 'rules' && <RulesModal close={() => setModal(null)} />}
      {modal?.type === 'leave' &&
        game.room?.code === modal.roomCode &&
        game.room.self.id === modal.playerId && (
          <LeaveModal
            disabled={disabled}
            close={() => setModal(null)}
            leave={() => game.send({ type: 'leave' })}
          />
        )}
    </div>
  );
}
