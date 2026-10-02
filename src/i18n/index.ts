import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { defaultLocale, resources } from './resources';

export const i18n = createInstance();

void i18n.use(initReactI18next).init({
  lng: defaultLocale,
  fallbackLng: defaultLocale,
  supportedLngs: Object.keys(resources),
  load: 'languageOnly',
  resources,
  initAsync: false,
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

export { Trans, useTranslation } from 'react-i18next';
