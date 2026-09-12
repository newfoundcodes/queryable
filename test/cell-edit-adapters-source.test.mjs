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

const adapterNames = ['postgres', 'mysql', 'mssql', 'sqlite', 'duckdb', 'd1', 'oracle', 'db2'];
const sources = new Map();

for (const name of adapterNames) {
  sources.set(
    name,
    await readFile(new URL('../src/adapters/' + name + '.ts', import.meta.url), 'utf8'),
  );
}

const factory = await readFile(new URL('../src/adapters/factory.ts', import.meta.url), 'utf8');

test('all concrete database adapters expose primary-key-backed row identities', () => {
  for (const name of adapterNames) {
    const source = sources.get(name);
    assert.match(source, /rowIdentities(?:\s*:|,)/, name + ' row identities');
    assert.match(source, /primaryKeyColumns:/, name + ' primary key metadata');
    assert.match(source, /editable:/, name + ' editability metadata');
  }
});

test('all concrete database adapters implement guarded cell updates', () => {
  for (const name of adapterNames) {
    const source = sources.get(name);
    assert.match(
      source,
      /public async updateCell\(request: CellUpdateRequest\): Promise<void>/,
      name + ' updateCell',
    );

    assert.match(source, /has no primary key/, name + ' primary key guard');
    assert.match(source, /row identity is incomplete/, name + ' row identity guard');
  }
});

test('adapter session forwards cell writes to the selected database adapter', () => {
  assert.match(factory, /public updateCell\(request: CellUpdateRequest\): Promise<void>/);
  assert.match(factory, /return this\.adapter\.updateCell\(request\)/);
});
