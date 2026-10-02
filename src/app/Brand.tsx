import { Eye } from 'lucide-react';
import { useTranslation } from '../i18n';

export function Brand({ small = false }: { small?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className={`brand ${small ? 'brand-small' : ''}`}>
      <span className="brand-icon">
        <Eye size={24} strokeWidth={2.5} />
      </span>
      <span>{t('brand.name')}</span>
    </div>
  );
}
