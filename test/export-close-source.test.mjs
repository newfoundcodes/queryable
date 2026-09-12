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

const workbench = [
  await readFile(new URL('../src/ui/workbench.ts', import.meta.url), 'utf8'),
  await readFile(new URL('../webview/workbench.html', import.meta.url), 'utf8'),
].join('\n');
const home = [
  await readFile(new URL('../src/ui/homeView.ts', import.meta.url), 'utf8'),
  await readFile(new URL('../webview/home.html', import.meta.url), 'utf8'),
].join('\n');
const extension = await readFile(new URL('../src/extension.ts', import.meta.url), 'utf8');
const types = await readFile(new URL('../src/types.ts', import.meta.url), 'utf8');
const exporter = await readFile(new URL('../src/export/tableExport.ts', import.meta.url), 'utf8');

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

test('unsaved and edited workbenches offer to save configuration when closed', () => {
  assert.match(home, /saveOnClose: async \(\) =>/);
  assert.match(home, /this\.store\.save\(draft\)/);
  assert.match(home, /this\.store\.update\(existingId, draft\)/);

  assert.match(workbench, /Save connection “\$\{connection\.name\}” before closing\?/);
  assert.match(workbench, /'Save Connection'/);
  assert.match(workbench, /'Close Without Saving'/);
  assert.match(workbench, /panel\.onDidDispose/);
});

test('table toolbar places Export after Search', () => {
  assert.match(workbench, /apply\.textContent = 'Search'/);
  assert.match(workbench, /tools\.append\(search, pageSize, refreshRows, apply, exportRows\)/);
});

test('query result pagination includes the same Export control', () => {
  assert.match(workbench, /pager\.append\(sizeSelect, previous, next, info, exportRows\)/);
  assert.match(workbench, /query-result-' \+ \(index \+ 1\) \+ '-page-' \+ currentPage/);
});

test('Export button uses native VS Code webview context menu routing', () => {
  assert.match(workbench, /webviewSection: 'queryableExport'/);
  assert.match(workbench, /new MouseEvent\('contextmenu'/);
  assert.match(types, /command: 'exportData'/);
  assert.match(types, /command: 'exportRequested'/);

  assert.equal(packageJson.contributes.menus['webview/context'].length, 3);

  for (const item of packageJson.contributes.menus['webview/context']) {
    assert.match(item.when, /webviewId == 'queryable\.connection'/);
    assert.match(item.when, /webviewSection == 'queryableExport'/);
  }
});

test('extension registers JSON, CSV, and HTML export commands', () => {
  for (const format of ['Json', 'Csv', 'Html']) {
    assert.match(extension, new RegExp(`queryable\\.export${format}`));
  }

  assert.match(exporter, /case 'json'/);
  assert.match(exporter, /case 'csv'/);
  assert.match(exporter, /case 'html'/);

  assert.match(workbench, /showSaveDialog/);
  assert.match(workbench, /workspace\.fs\.writeFile/);
});
