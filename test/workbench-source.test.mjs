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

const source = await readFile(new URL('../src/ui/workbench.ts', import.meta.url), 'utf8');
const typesSource = await readFile(new URL('../src/types.ts', import.meta.url), 'utf8');
const baseSource = await readFile(new URL('../src/adapters/base.ts', import.meta.url), 'utf8');
const postgresSource = await readFile(
  new URL('../src/adapters/postgres.ts', import.meta.url),
  'utf8',
);

const mssqlSource = await readFile(new URL('../src/adapters/mssql.ts', import.meta.url), 'utf8');

test('registers the extension-host message listener before assigning HTML', () => {
  const listener = source.indexOf('panel.webview.onDidReceiveMessage');
  const htmlAssignment = source.indexOf('panel.webview.html = this.html');

  assert.ok(listener >= 0);
  assert.ok(htmlAssignment > listener);
});

test('registers the webview receive listener before requesting metadata', () => {
  const listener = source.lastIndexOf("window.addEventListener('message'");
  const ready = source.lastIndexOf("vscode.postMessage({ command: 'ready' });");

  assert.ok(listener >= 0);
  assert.ok(ready > listener);
});

test('initializes Monaco independently from the metadata handshake', () => {
  const initialize = source.indexOf('initializeMonaco();');
  const ready = source.lastIndexOf("vscode.postMessage({ command: 'ready' });");

  assert.ok(initialize >= 0);
  assert.ok(ready > initialize);
});

test('provides a usable empty SQL textarea fallback and refresh action', () => {
  assert.match(source, /<textarea id="queryFallback"[^>]*><\/textarea>/);
  assert.doesNotMatch(source, /-- Write SQL here/);

  assert.match(source, /#queryEditor\.ready \{ display: block; \}/);
  assert.match(source, /queryEditor \? queryEditor\.getValue\(\) : queryFallback\.value/);
  assert.match(source, /id="refreshMetadata"/);
  assert.match(source, /command:'refreshMetadata'/);
});

test('uses database-aware object tabs and hides routine labels when unsupported', () => {
  assert.match(source, /connection\.kind !== 'sqlite3' && connection\.kind !== 'd1'/);
  assert.match(source, /connection\.kind === 'duckdb' \? 'Macros' : 'Procedures \/ Functions'/);
  assert.match(source, /data-object-mode="tables"/);
  assert.match(source, /data-object-mode="procedures"/);
  assert.match(source, /object-browser\$\{routineSectionVisible \? '' : ' no-tabs'\}/);
});

test('has one search field for table and routine discovery', () => {
  assert.match(source, /id="objectSearch"/);
  assert.match(source, /function searchObjects\(items\)/);
  assert.match(source, /objectSearch\.addEventListener\('input', renderObjects\)/);
  assert.match(source, /Search procedures \/ functions/);
});

test('adds a table-row refresh action immediately before Search', () => {
  assert.match(source, /refreshRows\.textContent = 'Refresh'/);
  assert.match(
    source,
    /refreshRows\.addEventListener\('click', \(\) => loadTable\(tab, page\.page, Number\(pageSize\.value\), search\.value\)\)/,
  );
  assert.match(source, /tools\.append\(search, pageSize, refreshRows, apply, exportRows\)/);
});

test('forces both table scrollbars and uses VS Code scrollbar variables', () => {
  assert.match(source, /\.grid-scroll \{[^}]*overflow: scroll;/);
  assert.match(source, /--vscode-scrollbarSlider-background/);
  assert.match(source, /--vscode-scrollbarSlider-hoverBackground/);
  assert.match(source, /--vscode-scrollbarSlider-activeBackground/);
});

test('single query result uses the full available result height', () => {
  assert.match(source, /result-scroll\.single-result \{[^}]*height: 100%;/);
  assert.match(source, /result-set\.single-result \{[^}]*height: 100%;/);
  assert.match(source, /result\.resultSets\.length === 1/);

  assert.doesNotMatch(source, /resultGrid\.style\.maxHeight/);
});

test('removes outer horizontal padding from the workbench content', () => {
  assert.match(source, /html, body \{[^}]*padding: 0;/);
  assert.match(source, /\.content-area \{[^}]*padding: 0;/);
  assert.match(source, /\.tabs \{[^}]*padding: 0;/);
  assert.match(source, /\.content \{[^}]*padding: 0;/);
});

test('supports reusing the active query result or opening a new result tab', () => {
  assert.match(source, /id="runQuery"[^>]*>Run<\/button>/);
  assert.match(source, /id="runQueryNewTab"[^>]*>Run \(New Tab\)<\/button>/);
  assert.match(source, /activeTab && activeTab\.kind === 'result' \? activeTab\.key : null/);
  assert.match(source, /openMode === 'reuse-active' && message\.targetResultId !== null/);
  assert.match(source, /runQuery\('new-tab'\)/);

  assert.match(typesSource, /openMode: 'reuse-active' \| 'new-tab'/);
  assert.match(typesSource, /targetResultId: string \| null/);
});

test('opens a Monaco-backed cell editor on double click', () => {
  assert.match(source, /td\.addEventListener\('dblclick'/);
  assert.match(source, /id="cellDialog"/);
  assert.match(source, /id="cellEditor"/);
  assert.match(source, /language: 'plaintext'/);
  assert.match(source, /id="cancelCell"[^>]*>Cancel<\/button>/);
  assert.match(source, /id="saveCell"[^>]*>Save<\/button>/);
});

test('cell writes require a primary-key row identity', () => {
  assert.match(typesSource, /interface RowIdentity/);
  assert.match(typesSource, /primaryKeyColumns: readonly string\[\]/);
  assert.match(typesSource, /editable: boolean/);
  assert.match(baseSource, /updateCell\(request: CellUpdateRequest\): Promise<void>/);
  assert.match(postgresSource, /has no primary key/);
});

test('cell editor asks before losing dirty changes on outside click', () => {
  assert.match(source, /Keep the changes\?/);
  assert.match(source, /cellDialog\.addEventListener\('click'.*requestCellEditorClose/);
  assert.match(source, /function cellIsDirty\(\)/);
  assert.match(source, /Discard/);
  assert.match(source, /Keep Editing/);
});

test('cell dialogs are movable, resizable, and theme-aware', () => {
  assert.match(source, /\.movable-dialog \{[^}]*resize: both;/);
  assert.match(source, /function makeDialogMovable\(node, handle\)/);
  assert.match(source, /--vscode-titleBar-activeBackground/);
  assert.match(source, /--vscode-editor-background/);
});

test('uses stronger routine catalog queries for PostgreSQL and SQL Server', () => {
  assert.match(postgresSource, /pg_catalog\.pg_proc/);
  assert.match(postgresSource, /p\.prokind IN \('f', 'p'\)/);
  assert.match(mssqlSource, /FROM sys\.procedures p/);
  assert.match(mssqlSource, /o\.type IN \('FN', 'IF', 'TF', 'FS', 'FT', 'AF'\)/);
});

test('query results have table-style pagination controls and page sizes', () => {
  assert.match(source, /function setQueryResultPage\(tab, index, page, pageSize\)/);
  assert.match(source, /resultPageSizes/);
  assert.match(source, /\[25,50,100,250,500\]/);
  assert.match(source, /sizeSelect\.setAttribute\('aria-label', 'Rows per page'\)/);
  assert.match(source, /previous\.textContent = 'Previous'/);
  assert.match(source, /next\.textContent = 'Next'/);
  assert.match(source, /set\.rows\.slice\(start, start \+ pageSize\)/);
  assert.match(
    source,
    /'Page ' \+ currentPage \+ ' \/ ' \+ totalPages \+ ' · ' \+ totalRows \+ ' rows'/,
  );
});
