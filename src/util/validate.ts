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

import type { ConnectionDraft, ConnectionDraftNetwork } from '../types';
import { isUnixSocketPath } from './sql';

function validPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65_535;
}

function isNetwork(draft: ConnectionDraft): draft is ConnectionDraftNetwork {
  return (
    draft.kind === 'postgres' ||
    draft.kind === 'cockroachdb' ||
    draft.kind === 'mysql' ||
    draft.kind === 'mariadb' ||
    draft.kind === 'mssql' ||
    draft.kind === 'oracle' ||
    draft.kind === 'db2'
  );
}

export function validateDraft(draft: ConnectionDraft): void {
  if (!draft.name.trim()) {
    throw new Error('Connection name is required.');
  }

  if (draft.kind === 'sqlite3' || draft.kind === 'duckdb') {
    if (!draft.filePath.trim()) {
      throw new Error('Database file is required.');
    }

    return;
  }

  if (draft.kind === 'd1') {
    if (!draft.accountId.trim()) {
      throw new Error('Cloudflare Account ID is required.');
    }

    if (draft.accountId.trim().length > 32) {
      throw new Error('Cloudflare Account ID must not exceed 32 characters.');
    }

    if (!draft.databaseId.trim()) {
      throw new Error('Cloudflare D1 Database ID is required.');
    }

    if (!draft.token) {
      throw new Error('Cloudflare API token is required.');
    }

    return;
  }

  if (!isNetwork(draft)) {
    throw new Error('Unsupported connection type.');
  }

  if (!draft.hostOrSocket.trim()) {
    throw new Error('Database host or socket is required.');
  }

  if (!draft.username.trim()) {
    throw new Error('Database username is required.');
  }

  const socket = isUnixSocketPath(draft.hostOrSocket.trim());
  if (!socket && !validPort(draft.port)) {
    throw new Error('Database port must be between 1 and 65535.');
  }

  if ((draft.kind === 'mssql' || draft.kind === 'oracle' || draft.kind === 'db2') && socket) {
    throw new Error('This database driver requires a TCP host in Queryable.');
  }

  if ((draft.kind === 'oracle' || draft.kind === 'db2') && !draft.database.trim()) {
    throw new Error(
      draft.kind === 'oracle'
        ? 'Oracle service name is required.'
        : 'Db2 database name is required.',
    );
  }

  if (
    (draft.kind === 'oracle' || draft.kind === 'db2') &&
    (draft.keyPath.trim() || draft.certPath.trim())
  ) {
    throw new Error(
      'Client key and certificate files are not supported by this driver configuration.',
    );
  }

  if (
    draft.kind !== 'oracle' &&
    draft.kind !== 'db2' &&
    Boolean(draft.keyPath) !== Boolean(draft.certPath)
  ) {
    throw new Error('Client key and client certificate must be supplied together.');
  }

  if (draft.ssh.enabled) {
    if (socket) {
      throw new Error('SSH tunneling requires a TCP database host, not a database socket.');
    }

    if (!draft.ssh.host.trim()) {
      throw new Error('SSH host is required when SSH tunneling is enabled.');
    }

    if (!validPort(draft.ssh.port)) {
      throw new Error('SSH port must be between 1 and 65535.');
    }

    if (!draft.ssh.username.trim()) {
      throw new Error('SSH username is required.');
    }

    if (draft.ssh.authMode === 'private-key' && !draft.ssh.privateKeyPath.trim()) {
      throw new Error('SSH private key file is required for private-key authentication.');
    }

    if (draft.ssh.authMode === 'password' && !draft.ssh.password) {
      throw new Error('SSH password is required for password authentication.');
    }
  }
}
