import { useEffect, useState } from 'react';
import { Eye, EyeOff, Fingerprint } from 'lucide-react';
import type { RoomView } from '../../../shared/game';
import { Button } from '../../design-system/Button';
import { useTranslation } from '../../i18n';

export function SecretWord({ room }: { room: RoomView }) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const conceal = () => setVisible(false);
    window.addEventListener('blur', conceal);
    document.addEventListener('visibilitychange', conceal);
    return () => {
      window.removeEventListener('blur', conceal);
      document.removeEventListener('visibilitychange', conceal);
    };
  }, []);

  return (
    <section
      className={`secret-card ${visible ? 'revealed' : ''}`}
      aria-label={t('secretWord.region')}
    >
      <Fingerprint size={28} strokeWidth={1.5} aria-hidden="true" />
      <div>
        <span className="secret-label">{t('secretWord.label')}</span>
        <strong className={`secret-word ${visible ? '' : 'word-hidden'}`}>
          {visible ? room.self.word : '••••••'}
        </strong>
      </div>
      <Button
        variant="secondary"
        onClick={() => setVisible(!visible)}
        aria-pressed={visible}
      >
        {visible ? (
          <EyeOff size={18} aria-hidden="true" />
        ) : (
          <Eye size={18} aria-hidden="true" />
        )}
        {visible ? t('secretWord.hide') : t('secretWord.show')}
      </Button>
    </section>
  );
}
