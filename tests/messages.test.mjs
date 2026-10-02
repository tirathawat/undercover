import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { serverMessageIds } from '../shared/messages.ts';
import { thMessages } from '../src/i18n/locales/th-messages.ts';

test('Go and TypeScript share the same server message vocabulary and every identifier has Thai copy', async () => {
  const source = await readFile(
    new URL('../internal/game/messages.go', import.meta.url),
    'utf8',
  );
  const goIds = [
    ...source.matchAll(/^\s*MessageID\w+\s+(?:MessageID\s+)?=\s*"([^"]+)"/gm),
  ].map((match) => match[1]);
  assert.deepEqual(goIds.sort(), [...serverMessageIds].sort());
  assert.equal(new Set(goIds).size, goIds.length);
  for (const id of serverMessageIds)
    assert.ok(
      typeof thMessages[id] === 'string' && thMessages[id].length > 0,
      `Missing Thai message: ${id}`,
    );
});
