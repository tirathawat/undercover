import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { I18nextProvider } from 'react-i18next';
import { i18n } from './i18n';
import { DocumentLocale } from './i18n/DocumentLocale';
import '@fontsource/ibm-plex-sans-thai/400.css';
import '@fontsource/ibm-plex-sans-thai/500.css';
import '@fontsource/ibm-plex-sans-thai/600.css';
import '@fontsource/sora/600.css';
import '@fontsource/sora/700.css';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <DocumentLocale />
      <App />
    </I18nextProvider>
  </StrictMode>,
);
