import 'i18next';
import type { th } from './locales/th';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    enableSelector: false;
    strictKeyChecks: true;
    resources: { translation: typeof th };
  }
}
