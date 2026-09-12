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

import type {
  CellUpdateRequest,
  DatabaseMetadata,
  ProcedureDefinitionRequest,
  QueryExecutionResult,
  RuntimeSecrets,
  SavedConnection,
  TablePage,
  TablePageRequest,
} from '../types';
import { isUnixSocketPath } from '../util/sql';
import { SshTunnel } from '../ssh/tunnel';
import type { DatabaseAdapter } from './base';
import { D1Adapter } from './d1';
import { DuckDbAdapter } from './duckdb';
import { MsSqlAdapter } from './mssql';
import { OracleAdapter } from './oracle';
import { Db2Adapter } from './db2';
import { MySqlAdapter } from './mysql';
import { PostgresAdapter } from './postgres';
import { SqliteAdapter } from './sqlite';

interface Endpoint {
  readonly host: string;
  readonly port: number;
}

class AdapterSession implements DatabaseAdapter {
  public constructor(
    private readonly adapter: DatabaseAdapter,
    private readonly tunnel: SshTunnel | undefined,
  ) {}

  public connect(): Promise<void> {
    return this.adapter.connect();
  }

  public async close(): Promise<void> {
    try {
      await this.adapter.close();
    } finally {
      if (this.tunnel) {
        await this.tunnel.close();
      }
    }
  }

  public getMetadata(preferredSchema?: string): Promise<DatabaseMetadata> {
    return this.adapter.getMetadata(preferredSchema);
  }

  public fetchTablePage(request: TablePageRequest): Promise<TablePage> {
    return this.adapter.fetchTablePage(request);
  }

  public getProcedureDefinition(request: ProcedureDefinitionRequest): Promise<string> {
    return this.adapter.getProcedureDefinition(request);
  }

  public updateCell(request: CellUpdateRequest): Promise<void> {
    return this.adapter.updateCell(request);
  }

  public execute(sql: string): Promise<QueryExecutionResult> {
    return this.adapter.execute(sql);
  }
}

async function endpointForNetwork(
  connection: Extract<SavedConnection, { readonly hostOrSocket: string }>,
  secrets: RuntimeSecrets,
): Promise<{ endpoint: Endpoint; tunnel: SshTunnel | undefined }> {
  if (!connection.ssh.enabled) {
    return {
      endpoint: { host: connection.hostOrSocket, port: connection.port },
      tunnel: undefined,
    };
  }

  if (isUnixSocketPath(connection.hostOrSocket)) {
    throw new Error(
      'SSH tunneling to a database Unix socket is not supported. Use a TCP database host and port.',
    );
  }

  const tunnel = new SshTunnel(connection.ssh, secrets, {
    host: connection.hostOrSocket,
    port: connection.port,
  });

  const endpoint = await tunnel.open();
  return { endpoint, tunnel };
}

export async function createDatabaseSession(
  connection: SavedConnection,
  secrets: RuntimeSecrets,
): Promise<DatabaseAdapter> {
  if (connection.kind === 'sqlite3') {
    return new AdapterSession(new SqliteAdapter(connection, secrets), undefined);
  }

  if (connection.kind === 'duckdb') {
    return new AdapterSession(new DuckDbAdapter(connection, secrets), undefined);
  }

  if (connection.kind === 'd1') {
    return new AdapterSession(new D1Adapter(connection, secrets), undefined);
  }

  const { endpoint, tunnel } = await endpointForNetwork(connection, secrets);
  let adapter: DatabaseAdapter;

  switch (connection.kind) {
    case 'postgres':
    case 'cockroachdb':
      adapter = new PostgresAdapter(connection, secrets, endpoint);
      break;

    case 'mysql':
    case 'mariadb':
      adapter = new MySqlAdapter(connection, secrets, endpoint);
      break;

    case 'mssql':
      adapter = new MsSqlAdapter(connection, secrets, endpoint);
      break;

    case 'oracle':
      adapter = new OracleAdapter(connection, secrets, endpoint);
      break;

    case 'db2':
      adapter = new Db2Adapter(connection, secrets, endpoint);
      break;
  }

  return new AdapterSession(adapter, tunnel);
}
