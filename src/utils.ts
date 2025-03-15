import {
  guessedTag,
  notGuessedTag,
  overrideTag,
} from './config';

async function suppressConsoleLogsAsync(callback: () => Promise<void>) {
  const originalConsoleLog = console.log;
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  console.log = () => {}; // Empty arrow function
  const result = await callback();
  console.log = originalConsoleLog;

  return result;
}

const LEGACY_NOTES_NOT_GUESSED = 'actual-ai could not guess this category';
const LEGACY_NOTES_GUESSED = 'actual-ai guessed this category';
export function clearPreviousTags(notes: string | undefined): string | undefined {
  return notes?.replace(new RegExp(` (${guessedTag}|${notGuessedTag}|${overrideTag})($|(?!-))`, 'g'), '')
    .replace(new RegExp(` \\| ${LEGACY_NOTES_NOT_GUESSED}`, 'g'), '')
    .replace(new RegExp(` \\| ${LEGACY_NOTES_GUESSED}`, 'g'), '')
    .trim();
}

export default suppressConsoleLogsAsync;
