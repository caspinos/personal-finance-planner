import path from 'node:path';

/** Storage state written by global-setup.ts to force English UI in tests. */
export const LANGUAGE_STORAGE_STATE_PATH = path.join(__dirname, '..', '.auth', 'language-en.json');
