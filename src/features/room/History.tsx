import { useState } from 'react';
import { Check, ChevronDown, NotebookPen } from 'lucide-react';
import type { RoomView } from '../../../shared/game';
import { Button } from '../../design-system/Button';
import { Avatar } from '../../game/Avatar';
import { Trans, useTranslation } from '../../i18n';
import { translateMessage } from '../../i18n/messages';

export function History({ room }: { room: RoomView }) {
  const { t } = useTranslation();
  const [game, setGame] = useState('all');
  const [player, setPlayer] = useState('all');
  const [round, setRound] = useState('all');
  const games = [...new Set(room.history.map((entry) => entry.game))];
  const rounds = [
    ...new Set(
      room.history
        .filter((entry) => game === 'all' || entry.game === Number(game))
        .map((entry) => entry.round),
    ),
  ].sort((a, b) => a - b);
  const authors = [
    ...new Map(
      room.history.map((entry) => [entry.playerId, entry.name]),
    ).entries(),
  ];
  const entries = room.history.filter(
    (entry) =>
      (game === 'all' || entry.game === Number(game)) &&
      (player === 'all' || entry.playerId === player) &&
      (round === 'all' || entry.round === Number(round)),
  );

  function clearFilters() {
    setGame('all');
    setPlayer('all');
    setRound('all');
  }

  return (
    <section className="history-panel" aria-labelledby="history-title">
      <div className="panel-title">
        <h2 id="history-title" tabIndex={-1}>
          {t('history.title')}
        </h2>
        <span className="count-pill">
          {t('history.count', { count: room.history.length })}
        </span>
      </div>
      <p className="panel-subtitle">{t('history.description')}</p>
      {room.history.length > 0 && (
        <div className="history-controls">
          <label className="history-filter" data-active={game !== 'all'}>
            <span className="sr-only">{t('history.game')}</span>
            {game !== 'all' && (
              <Check className="filter-check" size={16} aria-hidden="true" />
            )}
            <select
              value={game}
              onChange={(event) => {
                setGame(event.target.value);
                setRound('all');
              }}
            >
              <option value="all">{t('history.allGames')}</option>
              {games.map((number) => (
                <option key={number} value={number}>
                  {t('history.gameOption', { game: number })}
                </option>
              ))}
            </select>
            <ChevronDown
              className="filter-chevron"
              size={16}
              aria-hidden="true"
            />
          </label>
          <label className="history-filter" data-active={round !== 'all'}>
            <span className="sr-only">{t('history.round')}</span>
            {round !== 'all' && (
              <Check className="filter-check" size={16} aria-hidden="true" />
            )}
            <select
              value={round}
              onChange={(event) => setRound(event.target.value)}
            >
              <option value="all">{t('history.allRounds')}</option>
              {rounds.map((number) => (
                <option key={number} value={number}>
                  {t('history.roundOption', { round: number })}
                </option>
              ))}
            </select>
            <ChevronDown
              className="filter-chevron"
              size={16}
              aria-hidden="true"
            />
          </label>
          <label className="history-filter" data-active={player !== 'all'}>
            <span className="sr-only">{t('history.player')}</span>
            {player !== 'all' && (
              <Check className="filter-check" size={16} aria-hidden="true" />
            )}
            <select
              value={player}
              onChange={(event) => setPlayer(event.target.value)}
            >
              <option value="all">{t('history.everyone')}</option>
              {authors.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
            <ChevronDown
              className="filter-chevron"
              size={16}
              aria-hidden="true"
            />
          </label>
        </div>
      )}
      {entries.length === 0 ? (
        <div className="empty-history">
          <NotebookPen size={40} strokeWidth={1.5} aria-hidden="true" />
          <h3>
            {room.history.length
              ? t('history.noMatch')
              : t('history.firstCluePending')}
          </h3>
          <p>
            {room.history.length
              ? t('history.noMatchDescription')
              : t('history.emptyDescription')}
          </p>
          {room.history.length > 0 && (
            <Button variant="secondary" onClick={clearFilters}>
              {t('history.showAll')}
            </Button>
          )}
        </div>
      ) : (
        <ol className="history-feed">
          {entries.map((entry, index) => (
            <li key={entry.id}>
              {(index === 0 ||
                entries[index - 1].round !== entry.round ||
                entries[index - 1].game !== entry.game) && (
                <h3 className="history-round">
                  <Trans
                    i18nKey="history.group"
                    values={{ game: entry.game, round: entry.round }}
                    components={{ round: <span /> }}
                  />
                </h3>
              )}
              <div className="history-entry">
                <Avatar index={entry.avatar} />
                <div>
                  <strong>
                    {entry.name}
                    {entry.playerId === room.self.id && (
                      <span className="you-label">{t('common.you')}</span>
                    )}
                  </strong>
                  <p>
                    {entry.messageId
                      ? translateMessage(t, {
                          messageId: entry.messageId,
                          messageParams: entry.messageParams,
                          fallback: entry.text,
                        })
                      : entry.text}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
      {entries.length > 0 && (
        <p className="history-note">
          {t('history.summary', { count: entries.length })}
        </p>
      )}
    </section>
  );
}
