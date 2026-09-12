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

import { readFileSync } from 'node:fs';
import type { ConnectionOptions } from 'node:tls';
import { Client, type ClientConfig, type QueryResult, type QueryResultRow } from 'pg';
import type {
  CellUpdateRequest,
  CockroachConnectionConfig,
  DatabaseMetadata,
  DisplayRow,
  PostgresConnectionConfig,
  ProcedureDefinitionRequest,
  ProcedureInfo,
  QueryExecutionResult,
  QueryResultSet,
  RuntimeSecrets,
  SchemaInfo,
  TableInfo,
  TablePage,
  TablePageRequest,
  TlsMode,
} from '../types';
import { columnsFromRows, errorText, toDisplayRow, toRowIdentity } from '../util/format';
import { isUnixSocketPath, quotePostgresIdentifier } from '../util/sql';
import type { DatabaseAdapter } from './base';

interface PgRow extends QueryResultRow {}

interface Endpoint {
  readonly host: string;
  readonly port: number;
}

function readOptional(path: string): Buffer | undefined {
  return path ? readFileSync(path) : undefined;
}

function tlsConfig(
  mode: TlsMode,
  keyPath: string,
  certPath: string,
  caPath: string,
  serverName: string,
): boolean | ConnectionOptions {
  if (mode === 'disabled') {
    return false;
  }

  const key = readOptional(keyPath);
  const cert = readOptional(certPath);
  const ca = readOptional(caPath);

  if (mode === 'required' || mode === 'preferred') {
    return {
      rejectUnauthorized: false,
      ...(key ? { key } : {}),
      ...(cert ? { cert } : {}),
      ...(ca ? { ca } : {}),
    };
  }

  if (mode === 'verify-ca') {
    return {
      rejectUnauthorized: true,
      checkServerIdentity: () => undefined,
      ...(key ? { key } : {}),
      ...(cert ? { cert } : {}),
      ...(ca ? { ca } : {}),
    };
  }

  return {
    rejectUnauthorized: true,
    ...(key ? { key } : {}),
    ...(cert ? { cert } : {}),
    ...(ca ? { ca } : {}),
    ...(!isUnixSocketPath(serverName) ? { servername: serverName } : {}),
  };
}

function canFallbackFromTls(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('does not support ssl') ||
    lower.includes('ssl is not enabled') ||
    lower.includes('unsupported ssl')
  );
}

function resultSet(result: QueryResult<PgRow>): QueryResultSet {
  const rows: readonly DisplayRow[] = result.rows.map((row) => toDisplayRow(row));

  const columns =
    result.fields.length > 0 ? result.fields.map((field) => field.name) : columnsFromRows(rows);
  return {
    columns,
    rows,
    affectedRows: result.rowCount ?? null,
  };
}

export class PostgresAdapter implements DatabaseAdapter {
  private client: Client | undefined;

  public constructor(
    private readonly config: PostgresConnectionConfig | CockroachConnectionConfig,
    private readonly secrets: RuntimeSecrets,
    private readonly endpoint: Endpoint,
  ) {}

  private clientConfig(ssl: boolean | ConnectionOptions): ClientConfig {
    return {
      host: this.endpoint.host,
      port: this.endpoint.port,
      user: this.config.username,
      password: this.secrets.databasePassword,
      database: this.config.database,
      ssl,
      application_name: 'Queryable VS Code',
    };
  }

  public async connect(): Promise<void> {
    const ssl = tlsConfig(
      this.config.tlsMode,
      this.config.keyPath,
      this.config.certPath,
      this.config.caPath,
      this.config.hostOrSocket,
    );
    const first = new Client(this.clientConfig(ssl));
    try {
      await first.connect();

      this.client = first;
      return;
    } catch (error) {
      await first.end().catch(() => undefined);

      if (this.config.tlsMode !== 'preferred' || !canFallbackFromTls(errorText(error))) {
        throw error;
      }
    }

    const fallback = new Client(this.clientConfig(false));
    await fallback.connect();

    this.client = fallback;
  }

  public async close(): Promise<void> {
    const client = this.client;
    this.client = undefined;

    if (client) {
      await client.end();
    }
  }

  private requireClient(): Client {
    if (!this.client) {
      throw new Error('Database connection is not open.');
    }

    return this.client;
  }

  public async getMetadata(preferredSchema?: string): Promise<DatabaseMetadata> {
    const client = this.requireClient();
    const schemaRows = await client.query<PgRow>(`
      SELECT schema_name AS name
      FROM information_schema.schemata
      WHERE schema_name NOT IN ('pg_catalog', 'information_schema')
        AND schema_name NOT LIKE 'pg_toast%'
        AND schema_name NOT LIKE 'pg_temp_%'
      ORDER BY schema_name
    `);

    const schemas: readonly SchemaInfo[] = schemaRows.rows.map((row) => ({
      name: String(row['name'] ?? ''),
    }));

    const tableRows = await client.query<PgRow>(`
      SELECT table_schema AS schema, table_name AS name, table_type
      FROM information_schema.tables
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
        AND table_schema NOT LIKE 'pg_toast%'
        AND table_schema NOT LIKE 'pg_temp_%'
      ORDER BY table_schema, table_name
    `);

    const tables: readonly TableInfo[] = tableRows.rows.map((row) => ({
      schema: String(row['schema'] ?? ''),
      name: String(row['name'] ?? ''),
      type: String(row['table_type'] ?? '').toUpperCase() === 'VIEW' ? 'view' : 'table',
    }));

    let routineRecords: readonly PgRow[];
    try {
      const routineRows = await client.query<PgRow>(`
        SELECT n.nspname AS schema, p.proname AS name,
               CASE WHEN p.prokind = 'p' THEN 'PROCEDURE' ELSE 'FUNCTION' END AS routine_type
        FROM pg_catalog.pg_proc p
        JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
        WHERE p.prokind IN ('f', 'p')
          AND n.nspname NOT IN ('pg_catalog', 'information_schema')
          AND n.nspname NOT LIKE 'pg_toast%'
          AND n.nspname NOT LIKE 'pg_temp_%'
        ORDER BY n.nspname, p.proname
      `);
      routineRecords = routineRows.rows;
    } catch {
      const routineRows = await client.query<PgRow>(`
        SELECT routine_schema AS schema, routine_name AS name, routine_type
        FROM information_schema.routines
        WHERE routine_schema NOT IN ('pg_catalog', 'information_schema')
        ORDER BY routine_schema, routine_name
      `);
      routineRecords = routineRows.rows;
    }

    const procedures: readonly ProcedureInfo[] = routineRecords.map((row) => ({
      schema: String(row['schema'] ?? ''),
      name: String(row['name'] ?? ''),
      type:
        String(row['routine_type'] ?? '').toUpperCase() === 'PROCEDURE' ? 'procedure' : 'function',
    }));

    const names = new Set(schemas.map((schema) => schema.name));
    const selectedSchema =
      preferredSchema && names.has(preferredSchema)
        ? preferredSchema
        : names.has('public')
          ? 'public'
          : (schemas[0]?.name ?? '');
    return { schemas, tables, procedures, selectedSchema };
  }

  private async searchableColumns(schema: string, table: string): Promise<readonly string[]> {
    const result = await this.requireClient().query<PgRow>(
      `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2
      ORDER BY ordinal_position
    `,
      [schema, table],
    );
    return result.rows
      .map((row) => String(row['column_name'] ?? ''))
      .filter((value) => value.length > 0);
  }

  private async primaryKeyColumns(schema: string, table: string): Promise<readonly string[]> {
    const result = await this.requireClient().query<PgRow>(
      `
      SELECT kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.constraint_schema = kcu.constraint_schema
      WHERE tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_schema = $1
        AND tc.table_name = $2
      ORDER BY kcu.ordinal_position
    `,
      [schema, table],
    );
    return result.rows
      .map((row) => String(row['column_name'] ?? ''))
      .filter((value) => value.length > 0);
  }

  public async fetchTablePage(request: TablePageRequest): Promise<TablePage> {
    const client = this.requireClient();
    const columns = await this.searchableColumns(request.schema, request.table);
    const qualified = `${quotePostgresIdentifier(request.schema)}.${quotePostgresIdentifier(request.table)}`;
    const search = request.search.trim();

    const where =
      search && columns.length > 0
        ? `WHERE ${columns.map((column) => `CAST(${quotePostgresIdentifier(column)} AS TEXT) ILIKE $1`).join(' OR ')}`
        : '';

    const params: string[] = search ? [`%${search}%`] : [];
    const countResult = await client.query<PgRow>(
      `SELECT COUNT(*)::bigint AS count FROM ${qualified} ${where}`,
      params,
    );

    const totalRows = Number(String(countResult.rows[0]?.['count'] ?? '0'));
    const primaryKey = await this.primaryKeyColumns(request.schema, request.table);

    const orderBy =
      primaryKey.length > 0 ? `ORDER BY ${primaryKey.map(quotePostgresIdentifier).join(', ')}` : '';

    const offset = (request.page - 1) * request.pageSize;
    const valueOffset = params.length;

    const pageResult = await client.query<PgRow>(
      `SELECT * FROM ${qualified} ${where} ${orderBy} LIMIT $${valueOffset + 1} OFFSET $${valueOffset + 2}`,
      [...params, String(request.pageSize), String(offset)],
    );

    const rows = pageResult.rows.map((row) => toDisplayRow(row));
    const visibleColumns = pageResult.fields.map((field) => field.name);

    const rowIdentities =
      primaryKey.length > 0 ? pageResult.rows.map((row) => toRowIdentity(row, primaryKey)) : [];
    return {
      columns: visibleColumns,
      rows,
      rowIdentities,
      primaryKeyColumns: primaryKey,
      editable: primaryKey.length > 0,
      page: request.page,
      pageSize: request.pageSize,
      totalRows,
    };
  }

  public async updateCell(request: CellUpdateRequest): Promise<void> {
    const columns = await this.searchableColumns(request.schema, request.table);
    if (!columns.includes(request.column)) {
      throw new Error('The selected column no longer exists. Refresh the table and try again.');
    }

    const primaryKey = await this.primaryKeyColumns(request.schema, request.table);
    if (primaryKey.length === 0) {
      throw new Error('This table cannot be edited because it has no primary key.');
    }

    const keyValues = primaryKey.map((column) => {
      const value = request.rowIdentity[column];
      if (value === undefined) {
        throw new Error('The row identity is incomplete. Refresh the table and try again.');
      }

      return value;
    });

    const qualified = `${quotePostgresIdentifier(request.schema)}.${quotePostgresIdentifier(request.table)}`;
    const where = primaryKey
      .map((column, index) => `${quotePostgresIdentifier(column)} = $${index + 2}`)
      .join(' AND ');

    const result = await this.requireClient().query(
      `UPDATE ${qualified} SET ${quotePostgresIdentifier(request.column)} = $1 WHERE ${where}`,
      [request.value, ...keyValues],
    );

    if (result.rowCount !== 1) {
      throw new Error(
        `Cell update matched ${result.rowCount ?? 0} rows. The change was not accepted as a single-row update.`,
      );
    }
  }

  public async getProcedureDefinition(request: ProcedureDefinitionRequest): Promise<string> {
    const result = await this.requireClient().query<PgRow>(
      `
      SELECT pg_get_functiondef(p.oid) AS definition
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = $1 AND p.proname = $2
      ORDER BY p.oid
    `,
      [request.schema, request.name],
    );

    const definitions = result.rows
      .map((row) => String(row['definition'] ?? ''))
      .filter((value) => value.length > 0);
    return definitions.length > 0 ? definitions.join('\n\n') : '-- Definition is not available.';
  }

  public async execute(sql: string): Promise<QueryExecutionResult> {
    const started = performance.now();
    const raw = (await this.requireClient().query<PgRow>(sql)) as
      QueryResult<PgRow> | QueryResult<PgRow>[];

    const sets = Array.isArray(raw) ? raw.map(resultSet) : [resultSet(raw)];
    return {
      resultSets: sets,
      message: sets.length === 1 ? 'Query completed.' : `${sets.length} statements completed.`,
      durationMs: Math.round((performance.now() - started) * 100) / 100,
    };
  }
}
