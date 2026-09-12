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
import test from 'node:test';
import { buildTableExport, safeExportFileName } from '../out/export/tableExport.js';

const data = {
  title: 'dbo.activity/logs',
  columns: ['id', 'description'],
  rows: [
    { id: '1', description: 'updated' },
    { id: '2', description: 'line 1\nline 2, "quoted"' },
  ],
};

test('JSON export preserves column order and row values', () => {
  const text = Buffer.from(buildTableExport('json', data).bytes).toString('utf8');
  const parsed = JSON.parse(text);
  assert.deepEqual(parsed, data.rows);
});

test('CSV export escapes commas, quotes, and newlines', () => {
  const text = Buffer.from(buildTableExport('csv', data).bytes).toString('utf8');
  assert.match(text, /^id,description\r?\n/);
  assert.match(text, /"line 1\nline 2, ""quoted"""/);
});

test('HTML export contains a complete table document', () => {
  const text = Buffer.from(buildTableExport('html', data).bytes).toString('utf8');
  assert.match(text, /<!doctype html>/i);
  assert.match(text, /<th>description<\/th>/);
  assert.match(text, /line 1\nline 2, &quot;quoted&quot;/);
});

test('PDF export emits a valid PDF header and catalog', () => {
  const bytes = buildTableExport('pdf', data).bytes;
  const text = Buffer.from(bytes).toString('ascii');

  assert.match(text, /^%PDF-1\.4/);
  assert.match(text, /\/Type \/Catalog/);
  assert.match(text, /%%EOF\n$/);
});

test('export filenames remove path separators and control characters', () => {
  assert.equal(safeExportFileName(' dbo/activity:logs\n '), 'dbo-activity-logs');
});
