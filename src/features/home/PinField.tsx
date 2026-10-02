import type { Ref } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useTranslation } from '../../i18n';

interface PinFieldProps {
  value: string;
  error: string | null;
  isRecovering: boolean;
  isVisible: boolean;
  disabled: boolean;
  inputRef: Ref<HTMLInputElement>;
  onChange: (value: string) => void;
  toggleVisibility: () => void;
}

export function PinField({
  value,
  error,
  isRecovering,
  isVisible,
  disabled,
  inputRef,
  onChange,
  toggleVisibility,
}: PinFieldProps) {
  const { t } = useTranslation();
  return (
    <div className="pin-field">
      <label className="field-label" htmlFor="room-pin">
        {isRecovering ? t('pin.recoveryLabel') : t('pin.createLabel')}
      </label>
      <div className="pin-input-control">
        <input
          ref={inputRef}
          id="room-pin"
          name="room-pin"
          className="pin-input"
          type={isVisible ? 'text' : 'password'}
          inputMode="numeric"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          maxLength={6}
          pattern="[0-9]{6}"
          required
          autoComplete="off"
          aria-describedby={`pin-help${error ? ' pin-error' : ''}`}
          aria-invalid={error ? true : undefined}
          disabled={disabled}
        />
        <button
          className="pin-visibility"
          type="button"
          aria-label={isVisible ? t('pin.hide') : t('pin.show')}
          disabled={disabled}
          onClick={toggleVisibility}
        >
          {isVisible ? (
            <EyeOff size={20} aria-hidden="true" />
          ) : (
            <Eye size={20} aria-hidden="true" />
          )}
        </button>
      </div>
      <p id="pin-help" className="field-help">
        {isRecovering ? t('pin.recoveryHelp') : t('pin.createHelp')}
      </p>
      {error && (
        <p id="pin-error" className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
