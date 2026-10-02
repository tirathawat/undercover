import { thMessages } from './th-messages.ts';
import { thUI } from './th-ui.ts';

export const th = { ...thUI, messages: thMessages } as const;
