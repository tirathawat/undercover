import { Check } from 'lucide-react';
import { avatars } from '../../../shared/game';
import { Avatar } from '../../game/Avatar';
import { useTranslation } from '../../i18n';

interface AvatarPickerProps {
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}

export function AvatarPicker({ value, disabled, onChange }: AvatarPickerProps) {
  const { t } = useTranslation();
  return (
    <fieldset className="avatar-field">
      <legend className="field-label">{t('avatarPicker.legend')}</legend>
      <div className="avatar-picker">
        {avatars.slice(0, 8).map((emoji, index) => (
          <button
            key={emoji}
            type="button"
            disabled={disabled}
            aria-label={t('avatarPicker.option', { emoji })}
            aria-pressed={value === index}
            onClick={() => onChange(index)}
          >
            <Avatar index={index} />
            {value === index && (
              <span className="avatar-check">
                <Check size={12} aria-hidden="true" />
              </span>
            )}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
