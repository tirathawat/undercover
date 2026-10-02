import { useEffect, useRef, useState, type FormEvent } from 'react';
import { KeyRound, Plus, Users } from 'lucide-react';
import type { GameAction } from '../../../shared/game';
import { Button } from '../../design-system/Button';
import { AvatarPicker } from './AvatarPicker';
import { PinField } from './PinField';
import { Trans, useTranslation } from '../../i18n';

type EntryMode = 'create' | 'join' | 'recover';
type FocusTarget = 'recovery-heading' | 'recovery-trigger' | null;

const PIN_PATTERN = /^[0-9]{6}$/;

interface Props {
  send: (action: GameAction) => Promise<boolean>;
  disabled: boolean;
  pending: boolean;
  showRules: () => void;
}

export function Home({ send, disabled, pending, showRules }: Props) {
  const { t } = useTranslation();
  const initialCode =
    new URLSearchParams(window.location.search).get('room') ?? '';
  const [mode, setMode] = useState<EntryMode>(initialCode ? 'join' : 'create');
  const [name, setName] = useState('');
  const [code, setCode] = useState(initialCode.toUpperCase());
  const [avatar, setAvatar] = useState(0);
  const [pin, setPin] = useState('');
  const [hasPinError, setHasPinError] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const pinRef = useRef<HTMLInputElement>(null);
  const recoveryHeadingRef = useRef<HTMLHeadingElement>(null);
  const recoveryTriggerRef = useRef<HTMLButtonElement>(null);
  const focusTargetRef = useRef<FocusTarget>(null);
  const isSubmitting = pending || submitting;

  useEffect(() => {
    if (focusTargetRef.current === 'recovery-heading' && mode === 'recover')
      recoveryHeadingRef.current?.focus();
    if (focusTargetRef.current === 'recovery-trigger' && mode === 'join')
      recoveryTriggerRef.current?.focus();
    focusTargetRef.current = null;
  }, [mode]);

  function changeMode(nextMode: EntryMode, focusTarget: FocusTarget = null) {
    if (mode === nextMode || isSubmitting) return;
    focusTargetRef.current = focusTarget;
    setMode(nextMode);
    setPin('');
    setHasPinError(false);
    setShowPin(false);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (isSubmitting || disabled) return;
    if (!PIN_PATTERN.test(pin)) {
      setHasPinError(true);
      pinRef.current?.focus();
      return;
    }
    const form = event.currentTarget as HTMLFormElement;
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    setHasPinError(false);
    setSubmitting(true);
    try {
      if (mode === 'create')
        await send({ type: 'create', name: name.trim(), avatar, pin });
      else if (mode === 'join')
        await send({
          type: 'join',
          code: code.trim().toUpperCase(),
          name: name.trim(),
          avatar,
          pin,
        });
      else
        await send({
          type: 'recover',
          code: code.trim().toUpperCase(),
          name: name.trim(),
          pin,
        });
    } finally {
      setSubmitting(false);
    }
  }

  const submitLabel = isSubmitting
    ? mode === 'create'
      ? t('home.submit.creating')
      : mode === 'join'
        ? t('home.submit.joining')
        : t('home.submit.recovering')
    : disabled
      ? t('home.submit.connecting')
      : mode === 'create'
        ? t('home.submit.create')
        : mode === 'join'
          ? t('home.submit.join')
          : t('home.submit.recover');

  return (
    <main id="main-content" className="home">
      <section className="home-intro">
        <div className="watchful-eyes" aria-hidden="true">
          <span />
          <span />
        </div>
        <h1 tabIndex={-1}>
          <Trans i18nKey="home.heroTitle" components={{ br: <br /> }} />
        </h1>
        <p>
          <Trans i18nKey="home.heroDescription" components={{ br: <br /> }} />
        </p>
        <span className="home-meta">
          <Users size={18} aria-hidden="true" /> {t('home.heroMeta')}
        </span>
      </section>
      <section className="entry-card" aria-label={t('home.entryRegion')}>
        <div
          className="segmented-control"
          role="group"
          aria-label={t('home.entryMethod')}
        >
          <button
            type="button"
            disabled={isSubmitting}
            aria-pressed={mode === 'create'}
            onClick={() => changeMode('create')}
          >
            <Plus size={18} aria-hidden="true" /> {t('home.createRoom')}
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            aria-pressed={mode !== 'create'}
            onClick={() => changeMode('join')}
          >
            <KeyRound size={18} aria-hidden="true" /> {t('home.joinFriend')}
          </button>
        </div>
        {mode === 'recover' && (
          <div className="recovery-intro">
            <h2 ref={recoveryHeadingRef} tabIndex={-1}>
              {t('home.recoveryTitle')}
            </h2>
            <p>{t('home.recoveryDescription')}</p>
          </div>
        )}
        <form onSubmit={submit} noValidate>
          <label className="field-label" htmlFor="nickname">
            {t('home.nickname')}
          </label>
          <input
            id="nickname"
            name="nickname"
            placeholder={t('home.nicknamePlaceholder')}
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={20}
            disabled={isSubmitting}
            required
            autoComplete="nickname"
          />
          {mode !== 'create' && (
            <div className="room-code-field">
              <label className="field-label" htmlFor="room-code">
                {t('home.roomCode')}
              </label>
              <input
                id="room-code"
                name="room-code"
                className="code-input"
                value={code}
                placeholder={t('home.roomCodePlaceholder')}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                minLength={6}
                maxLength={6}
                pattern="[A-Z2-9]{6}"
                required
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                disabled={isSubmitting}
              />
            </div>
          )}
          <PinField
            value={pin}
            error={hasPinError ? t('home.invalidPin') : null}
            isRecovering={mode === 'recover'}
            isVisible={showPin}
            disabled={isSubmitting}
            inputRef={pinRef}
            onChange={(value) => {
              setPin(value);
              setHasPinError(false);
            }}
            toggleVisibility={() => setShowPin((visible) => !visible)}
          />
          {mode !== 'recover' && (
            <AvatarPicker
              value={avatar}
              disabled={isSubmitting}
              onChange={setAvatar}
            />
          )}
          <Button
            className="entry-submit"
            type="submit"
            disabled={disabled || isSubmitting}
          >
            {submitLabel}
          </Button>
        </form>
        <p className="entry-note">
          {mode === 'create'
            ? t('home.createNote')
            : mode === 'join'
              ? t('home.joinNote')
              : t('home.recoveryNote')}
        </p>
        {mode === 'join' && (
          <button
            ref={recoveryTriggerRef}
            className="text-link recovery-switch"
            type="button"
            disabled={isSubmitting}
            onClick={() => changeMode('recover', 'recovery-heading')}
          >
            {t('home.recoveryTitle')}
          </button>
        )}
        {mode === 'recover' && (
          <button
            className="text-link recovery-switch"
            type="button"
            disabled={isSubmitting}
            onClick={() => changeMode('join', 'recovery-trigger')}
          >
            {t('home.firstTime')}
          </button>
        )}
        <button className="text-link" onClick={showRules}>
          {t('home.readRules')}
        </button>
      </section>
      <p className="home-footnote">{t('home.footnote')}</p>
    </main>
  );
}
