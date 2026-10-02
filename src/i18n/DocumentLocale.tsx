import { useEffect } from 'react';
import { useTranslation } from './index';
import { defaultLocale } from './resources';

export function DocumentLocale() {
  const { t, i18n } = useTranslation();
  useEffect(() => {
    document.documentElement.lang = i18n.resolvedLanguage ?? defaultLocale;
    document.documentElement.dir = i18n.dir();
    document.title = t('app.documentTitle');
    document
      .querySelector<HTMLMetaElement>('meta[name="description"]')
      ?.setAttribute('content', t('app.description'));
  }, [t, i18n, i18n.resolvedLanguage]);
  return null;
}
