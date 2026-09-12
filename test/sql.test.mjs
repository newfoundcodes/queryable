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
import {
  isUnixSocketPath,
  procedureTabKey,
  quoteMsSqlIdentifier,
  quoteOracleIdentifier,
  quoteDb2Identifier,
  quoteMySqlIdentifier,
  quotePostgresIdentifier,
  quoteSqliteIdentifier,
  tableTabKey,
} from '../out/util/sql.js';

test('quotes PostgreSQL identifiers', () => {
  assert.equal(quotePostgresIdentifier('a"b'), '"a""b"');
});

test('quotes MySQL identifiers', () => {
  assert.equal(quoteMySqlIdentifier('a`b'), '`a``b`');
});

test('quotes SQL Server identifiers', () => {
  assert.equal(quoteMsSqlIdentifier('a]b'), '[a]]b]');
});

test('quotes Oracle identifiers', () => {
  assert.equal(quoteOracleIdentifier('a"b'), '"a""b"');
});

test('quotes Db2 identifiers', () => {
  assert.equal(quoteDb2Identifier('a"b'), '"a""b"');
});

test('quotes SQLite identifiers', () => {
  assert.equal(quoteSqliteIdentifier('a"b'), '"a""b"');
});

test('recognizes Unix socket paths', () => {
  assert.equal(isUnixSocketPath('/var/run/postgresql'), true);
  assert.equal(isUnixSocketPath('db.example.com'), false);
});

test('creates stable internal tab keys', () => {
  assert.equal(tableTabKey('public', 'users'), 'table:public:users');
  assert.equal(procedureTabKey('public', 'f', 'function'), 'routine:public:f:function');
});
