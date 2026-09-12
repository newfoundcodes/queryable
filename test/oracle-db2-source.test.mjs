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

const oracle = await readFile(new URL('../src/adapters/oracle.ts', import.meta.url), 'utf8');
const db2 = await readFile(new URL('../src/adapters/db2.ts', import.meta.url), 'utf8');
const factory = await readFile(new URL('../src/adapters/factory.ts', import.meta.url), 'utf8');
const store = await readFile(new URL('../src/storage/connectionStore.ts', import.meta.url), 'utf8');
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

test('pins supported Oracle and Db2 drivers', () => {
  assert.equal(packageJson.dependencies.oracledb, '7.0.1');
  assert.equal(packageJson.dependencies.ibm_db, '4.0.1');
  assert.equal(packageJson.allowScripts['ibm_db@4.0.1'], true);
});

test('factory creates Oracle and Db2 adapters', () => {
  assert.match(factory, /case 'oracle':[\s\S]*new OracleAdapter/);
  assert.match(factory, /case 'db2':[\s\S]*new Db2Adapter/);
});

test('connection store treats Oracle and Db2 as secured network connections', () => {
  assert.match(store, /draft\.kind === 'oracle'/);
  assert.match(store, /draft\.kind === 'db2'/);
  assert.match(store, /connection\.kind === 'oracle'/);
  assert.match(store, /connection\.kind === 'db2'/);
});

test('Oracle adapter discovers accessible objects and supports paging and cell updates', () => {
  assert.match(oracle, /FROM all_objects/);
  assert.match(oracle, /FROM all_procedures/);
  assert.match(oracle, /FROM all_tab_columns/);
  assert.match(oracle, /FROM all_constraints cons/);
  assert.match(oracle, /OFFSET :row_offset ROWS FETCH NEXT :row_limit ROWS ONLY/);
  assert.match(oracle, /UPDATE \$\{qualified\} SET/);
  assert.match(oracle, /FROM all_source/);
});

test('Db2 adapter uses Db2 catalogs and supports paging and cell updates', () => {
  assert.match(db2, /FROM syscat\.tables/);
  assert.match(db2, /FROM syscat\.routines/);
  assert.match(db2, /FROM syscat\.columns/);
  assert.match(db2, /syscat\.keycoluse/);
  assert.match(db2, /OFFSET \$\{offset\} ROWS FETCH NEXT \$\{pageSize\} ROWS ONLY/);
  assert.match(db2, /UPDATE \$\{qualified\} SET/);
});

test('Oracle and Db2 support TLS modes and reject identity checks through local SSH endpoints', () => {
  assert.match(oracle, /tcps:\/\//);
  assert.match(oracle, /sslServerDNMatch/);
  assert.match(oracle, /walletLocation/);

  assert.match(db2, /Security=SSL/);
  assert.match(db2, /SSLServerCertificate/);
  assert.match(db2, /SSLClientHostnameValidation=Basic/);

  assert.match(oracle, /Verify Identity cannot be combined/);
  assert.match(db2, /Verify Identity cannot be combined/);
});

test('Oracle includes packaged routines and Db2 includes module routines', () => {
  assert.match(oracle, /p\.object_type = 'PACKAGE' AND p\.procedure_name IS NOT NULL/);
  assert.match(oracle, /FROM all_arguments a/);
  assert.match(oracle, /a\.position = 0/);
  assert.match(oracle, /type IN \('PACKAGE', 'PACKAGE BODY'\)/);

  assert.match(db2, /routinemodulename \|\| '\.' \|\| routinename/);
  assert.match(db2, /routinemodulename = \?/);
});
