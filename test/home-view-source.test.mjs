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

const source = [
  await readFile(new URL('../src/ui/homeView.ts', import.meta.url), 'utf8'),
  await readFile(new URL('../webview/home.html', import.meta.url), 'utf8'),
].join('\n');

test('closes the connection dialog after Save or Connect', () => {
  assert.match(source, /action === 'save' \|\| action === 'connectDraft'/);
  assert.match(source, /dialog\.close\(\)/);
});

test('keeps Test separate from modal-closing actions', () => {
  const closeCondition = source.match(
    /if \(action === 'save' \|\| action === 'connectDraft'\) dialog\.close\(\);/,
  );
  assert.ok(closeCondition);
  assert.doesNotMatch(closeCondition[0], /test/);
});

test('network connection forms keep advanced settings collapsed by default', () => {
  assert.match(source, /id=\"advancedToggle\"/);
  assert.match(source, /id=\"advancedFields\" class=\"advanced-fields\" hidden/);
  assert.match(source, /aria-expanded=\"false\"/);
});

test('Advanced button toggles the advanced connection settings', () => {
  assert.match(source, /advancedToggle\.addEventListener\('click'/);
  assert.match(source, /advancedFields\.hidden = expanded/);
  assert.match(source, /advancedToggle\.setAttribute\('aria-expanded', String\(!expanded\)\)/);
});

test('TLS, certificate, password storage, and SSH controls are inside advanced settings', () => {
  const start = source.indexOf('id=\"advancedFields\"');
  const end = source.indexOf('function fileFields()', start);
  assert.ok(start >= 0 && end > start);

  const advanced = source.slice(start, end);
  assert.match(advanced, /passwordPolicy/);
  assert.match(advanced, /tlsMode/);
  assert.match(advanced, /certificateFields/);
  assert.match(source, /fileField\('keyPath'/);
  assert.match(source, /fileField\('certPath'/);
  assert.match(source, /fileField\('caPath'/);
  assert.match(advanced, /sshEnabled/);
});

test('Saved Connections and New Connections use a two-tab home view', () => {
  const savedIndex = source.indexOf('id="savedConnectionsTab"');
  const newIndex = source.indexOf('id="newConnectionsTab"');

  assert.ok(savedIndex >= 0 && newIndex > savedIndex);
  assert.match(source, /Saved Connections/);
  assert.match(source, /New Connections/);
  assert.match(source, /setHomeTab\(connections\.length === 0 \? 'new' : 'saved'\)/);
});

test('empty Saved Connections view offers Create Connection', () => {
  assert.match(source, /No saved connections\./);
  assert.match(source, /create\.textContent = 'Create Connection'/);
  assert.match(source, /create\.addEventListener\('click', \(\) => setHomeTab\('new'\)\)/);
});

test('saved connection shows a themed loading spinner while opening', () => {
  assert.match(source, /command: 'connectionLoading', id, value: true/);
  assert.match(source, /command: 'connectionLoading', id, value: false/);
  assert.match(source, /className = 'connection-spinner'/);
  assert.match(source, /--vscode-progressBar-background/);
  assert.match(source, /setConnectionLoading\(connection\.id, true\)/);
});

test('connection dialog is movable and resizable', () => {
  assert.match(source, /dialog \{[^}]*resize: both;/);
  assert.match(source, /id="connectionDialogHandle"/);

  assert.match(
    source,
    /makeDialogMovable\(dialog, document\.getElementById\('connectionDialogHandle'\)\)/,
  );
});

test('connection dialog closes when its backdrop is clicked', () => {
  assert.match(source, /dialog\.addEventListener\('click'/);
});

test('offers OracleDB and IBM Db2 connection cards with native default ports', () => {
  assert.match(source, /\['oracle',\s*'OracleDB',\s*1521\]/);
  assert.match(source, /\['db2',\s*'IBM Db2',\s*50000\]/);
});

test('uses database-specific advanced certificate fields for Oracle and Db2', () => {
  assert.match(source, /Wallet PEM \(ewallet\.pem\)/);
  assert.match(source, /Server \/ CA certificate/);
  assert.match(source, /kind === 'oracle' \? 'Service name' : 'Database name'/);
});

test('saved connections expose an Edit item from a right-click context menu', () => {
  assert.match(source, /id="savedContextMenu"/);
  assert.match(source, /id="editSavedConnection"[^>]*>Edit<\/button>/);
  assert.match(source, /row\.addEventListener\('contextmenu'/);
  assert.match(source, /openModal\(connection\.kind, connection\)/);
  assert.match(source, /--vscode-menu-background/);
});

test('editing a saved connection reuses the connection modal and update commands', () => {
  assert.match(source, /let editingConnectionId = null/);
  assert.match(source, /function populateConnection\(connection\)/);

  assert.match(source, /action === 'save'\s*\?\s*'updateSaved'/);

  assert.match(source, /Leave blank to keep the saved password/);
  assert.match(source, /Leave blank to keep the saved token/);
});
