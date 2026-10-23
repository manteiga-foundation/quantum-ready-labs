import '@fontsource/titillium-web/400.css';
import '@fontsource/titillium-web/600.css';
import '@fontsource/titillium-web/700.css';
import '@fontsource/jetbrains-mono/400.css';
import './theme.css';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { chooseLocale, STORAGE_KEY } from './i18n/locales';

// The language, before the first render: a prefixed path wins, then the selector's remembered
// choice, then the browser. A visitor sent to another language lands on its prefixed address.
function storedChoice(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
const { pathname, search, hash } = window.location;
const { redirect } = chooseLocale({ pathname, stored: storedChoice(), languages: navigator.languages ?? [navigator.language] });
if (redirect) window.history.replaceState({}, '', redirect + search + hash);

createRoot(document.getElementById('root')!).render(<App />);
