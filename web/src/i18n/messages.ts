// Every language's messages, by locale. Data only: the web and the edge both import this.

import { de } from './de';
import { en, type Messages } from './en';
import { es } from './es';
import { fr } from './fr';
import { ja } from './ja';
import type { Locale } from './locales';
import { pt } from './pt';

export const MESSAGES: Record<Locale, Messages> = { en, es, pt, fr, de, ja };

export type { Messages };
