/*
 * Queryable, A Newfoundcodes project.
 *
 * Copyright (C) 2026 Jonathan Eldy Baldivicio
 *
 * Author: Jonathan Eldy Baldivicio
 * Contact: jonathaneldy.baldivicio@newfoundcodes.com
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(
  new URL('../src/storage/connectionStore.ts', import.meta.url),
  'utf8',
);
const types = await readFile(new URL('../src/types.ts', import.meta.url), 'utf8');

test('editing updates the existing connection id and preserves creation time', () => {
  assert.match(source, /savedFromDraft\(draft, id, existing\.createdAt\)/);
  assert.match(source, /item\.id === id \? connection : item/);
  assert.match(source, /public async update\(id: string, draft: ConnectionDraft\)/);
});

test('editing never requires saved secrets to be sent into the webview', () => {
  assert.match(source, /draft\.token\.length > 0 \? draft\.token : storedToken/);
  assert.match(source, /secrets\.get\(dbPasswordKey\(id\)\)/);
  assert.match(source, /secrets\.get\(sshPasswordKey\(id\)\)/);
  assert.match(source, /secrets\.get\(sshPassphraseKey\(id\)\)/);
  assert.match(types, /command: 'connections'; readonly connections: readonly SavedConnection\[\]/);
});

test('home messages distinguish create and edit actions', () => {
  assert.match(types, /command: 'updateSaved'/);
  assert.match(types, /command: 'testEdited'/);
  assert.match(types, /command: 'connectEdited'/);
});
