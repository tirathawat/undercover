import { useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { KeyRound } from 'lucide-react';
import { Button } from '../../../design-system/Button';
import { Avatar } from '../../../game/Avatar';
import { useTranslation } from '../../../i18n';
import type { StageProps } from './stage-props';

export function GuessStage({ room, disabled, send }: StageProps) {
  const { t } = useTranslation();
  const [guess, setGuess] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const stageHeading = useRef<HTMLHeadingElement>(null);
  const guessInput = useRef<HTMLInputElement>(null);
  const confirmGuessButton = useRef<HTMLButtonElement>(null);
  const guessReviewOpened = useRef(false);
  const submissionPending = useRef(false);
  const submittedStatus = useRef<HTMLSpanElement>(null);
  const guesser = room.players.find(
    (player) => player.id === room.result?.eliminatedId,
  );
  const isGuesser =
    guesser?.id === room.self.id && room.result?.role === 'whiteGuy';
  const canSkip =
    room.hostId === room.self.id && guesser !== undefined && !guesser.connected;
  const couldSkip = useRef(canSkip);
  const trimmedGuess = guess.trim();

  useLayoutEffect(() => {
    if (reviewing) {
      guessReviewOpened.current = true;
      confirmGuessButton.current?.focus();
    } else if (guessReviewOpened.current) {
      guessInput.current?.focus();
    }
  }, [reviewing]);

  useLayoutEffect(() => {
    if (couldSkip.current && !canSkip) stageHeading.current?.focus();
    couldSkip.current = canSkip;
  }, [canSkip]);

  useLayoutEffect(() => {
    if (submitted) submittedStatus.current?.focus();
  }, [submitted]);

  function reviewGuess(event: FormEvent) {
    event.preventDefault();
    if (trimmedGuess) setReviewing(true);
  }

  async function submitGuess() {
    if (
      submissionPending.current ||
      disabled ||
      trimmedGuess.length < 1 ||
      trimmedGuess.length > 80
    )
      return;
    submissionPending.current = true;
    setSubmitting(true);
    try {
      if (
        await send({
          type: 'guess',
          stageId: room.stageId,
          text: trimmedGuess,
        })
      )
        setSubmitted(true);
    } finally {
      submissionPending.current = false;
      setSubmitting(false);
    }
  }

  return (
    <section className="stage-panel guess-stage">
      {guesser ? (
        <Avatar index={guesser.avatar} large />
      ) : (
        <span className="stage-symbol">
          <KeyRound size={36} strokeWidth={1.5} aria-hidden="true" />
        </span>
      )}
      <h2 ref={stageHeading} tabIndex={-1}>
        {isGuesser ? t('guess.yourTitle') : t('guess.waitingTitle')}
      </h2>
      <p>
        {isGuesser
          ? t('guess.yourDescription')
          : t('guess.waitingDescription', { name: guesser?.name ?? '' })}
      </p>
      {isGuesser && !submitted ? (
        reviewing ? (
          <div className="guess-review">
            <span>{t('guess.reviewLabel')}</span>
            <strong>“{trimmedGuess}”</strong>
            <p>{t('guess.reviewWarning')}</p>
            <div className="guess-actions">
              <Button
                variant="secondary"
                disabled={disabled || submitting}
                onClick={() => setReviewing(false)}
              >
                {t('guess.edit')}
              </Button>
              <Button
                ref={confirmGuessButton}
                disabled={disabled || submitting}
                onClick={submitGuess}
              >
                {submitting ? t('guess.submitting') : t('guess.confirm')}
              </Button>
            </div>
          </div>
        ) : (
          <form className="guess-form" onSubmit={reviewGuess}>
            <label className="field-label" htmlFor="final-guess">
              {t('guess.label')}
            </label>
            <input
              ref={guessInput}
              id="final-guess"
              name="final-guess"
              value={guess}
              onChange={(event) => setGuess(event.target.value)}
              maxLength={80}
              placeholder={t('guess.placeholder')}
              required
              disabled={disabled}
              autoComplete="off"
              aria-describedby="final-guess-hint"
            />
            <div className="clue-form-footer">
              <span id="final-guess-hint">
                {t('guess.length', { count: guess.length })}
              </span>
            </div>
            <Button type="submit" disabled={disabled || !trimmedGuess}>
              {t('guess.review')}
            </Button>
          </form>
        )
      ) : (
        <span
          ref={submittedStatus}
          className="waiting-label"
          role="status"
          tabIndex={submitted ? -1 : undefined}
        >
          {isGuesser ? t('guess.submitted') : t('guess.waiting')}
        </span>
      )}
      {canSkip && (
        <SkipGuess
          disabled={disabled}
          guesserName={guesser.name}
          stageId={room.stageId}
          send={send}
        />
      )}
    </section>
  );
}

function SkipGuess({
  disabled,
  guesserName,
  stageId,
  send,
}: {
  disabled: boolean;
  guesserName: string;
  stageId: string;
  send: StageProps['send'];
}) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const skipButton = useRef<HTMLButtonElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const confirmationOpened = useRef(false);

  useLayoutEffect(() => {
    if (confirming) {
      confirmationOpened.current = true;
      confirmButton.current?.focus();
    } else if (confirmationOpened.current) {
      skipButton.current?.focus();
    }
  }, [confirming]);

  async function skipGuess() {
    if (skipping || disabled) return;
    setSkipping(true);
    try {
      await send({ type: 'skipGuess', stageId });
    } finally {
      setSkipping(false);
    }
  }

  return confirming ? (
    <div className="skip-guess-confirmation">
      <p>{t('guess.skipWarning', { name: guesserName })}</p>
      <div className="guess-actions">
        <Button
          variant="secondary"
          disabled={disabled || skipping}
          onClick={() => setConfirming(false)}
        >
          {t('guess.cancelSkip')}
        </Button>
        <Button
          ref={confirmButton}
          variant="danger"
          disabled={disabled || skipping}
          onClick={skipGuess}
        >
          {t('guess.confirmSkip')}
        </Button>
      </div>
    </div>
  ) : (
    <Button
      ref={skipButton}
      variant="secondary"
      disabled={disabled}
      onClick={() => setConfirming(true)}
    >
      {t('guess.skip')}
    </Button>
  );
}
