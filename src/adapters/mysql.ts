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
import mysql, {
  type Connection,
  type ConnectionOptions,
  type FieldPacket,
  type QueryResult,
  type RowDataPacket,
} from 'mysql2/promise';
import type {
  CellUpdateRequest,
  DatabaseMetadata,
  DisplayRow,
  MariaDbConnectionConfig,
  MySqlConnectionConfig,
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
import { isUnixSocketPath, quoteMySqlIdentifier } from '../util/sql';
import type { DatabaseAdapter } from './base';

interface Endpoint {
  readonly host: string;
  readonly port: number;
}

interface AffectedRowsPacket {
  readonly affectedRows: number;
  readonly fieldCount: number;
  readonly insertId: number;
  readonly serverStatus: number;
}

type QueryArrayItem = RowDataPacket | RowDataPacket[] | AffectedRowsPacket;

function sslOptions(
  mode: TlsMode,
  keyPath: string,
  certPath: string,
  caPath: string,
): ConnectionOptions['ssl'] {
  if (mode === 'disabled') {
    return undefined;
  }

  const key = keyPath ? readFileSync(keyPath) : undefined;
  const cert = certPath ? readFileSync(certPath) : undefined;
  const ca = caPath ? readFileSync(caPath) : undefined;

  if (mode === 'required' || mode === 'preferred') {
    return {
      rejectUnauthorized: false,
      verifyIdentity: false,
      ...(key ? { key } : {}),
      ...(cert ? { cert } : {}),
      ...(ca ? { ca } : {}),
    };
  }

  if (mode === 'verify-ca') {
    return {
      rejectUnauthorized: true,
      verifyIdentity: false,
      ...(key ? { key } : {}),
      ...(cert ? { cert } : {}),
      ...(ca ? { ca } : {}),
    };
  }

  return {
    rejectUnauthorized: true,
    verifyIdentity: true,
    ...(key ? { key } : {}),
    ...(cert ? { cert } : {}),
    ...(ca ? { ca } : {}),
  };
}

function canFallbackFromTls(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('does not support secure') ||
    lower.includes('ssl connection error') ||
    lower.includes('ssl is required but')
  );
}

function isAffectedRowsPacket(value: QueryArrayItem): value is AffectedRowsPacket {
  if (Array.isArray(value)) {
    return false;
  }

  return (
    'affectedRows' in value &&
    typeof value.affectedRows === 'number' &&
    'fieldCount' in value &&
    typeof value.fieldCount === 'number' &&
    'insertId' in value &&
    typeof value.insertId === 'number' &&
    'serverStatus' in value &&
    typeof value.serverStatus === 'number'
  );
}

function rowsToSet(
  rows: readonly RowDataPacket[],
  fields: readonly FieldPacket[] = [],
): QueryResultSet {
  const displayRows: readonly DisplayRow[] = rows.map((row) => toDisplayRow(row));
  return {
    columns: fields.length > 0 ? fields.map((field) => field.name) : columnsFromRows(displayRows),
    rows: displayRows,
    affectedRows: null,
  };
}

export class MySqlAdapter implements DatabaseAdapter {
  private connection: Connection | undefined;

  public constructor(
    private readonly config: MySqlConnectionConfig | MariaDbConnectionConfig,
    private readonly secrets: RuntimeSecrets,
    private readonly endpoint: Endpoint,
  ) {}

  private options(ssl: ConnectionOptions['ssl']): ConnectionOptions {
    const socket = isUnixSocketPath(this.config.hostOrSocket) && !this.config.ssh.enabled;
    return {
      user: this.config.username,
      password: this.secrets.databasePassword,
      ...(this.config.database ? { database: this.config.database } : {}),
      multipleStatements: true,
      namedPlaceholders: false,
      decimalNumbers: false,
      supportBigNumbers: true,
      bigNumberStrings: true,
      dateStrings: true,
      ...(socket
        ? { socketPath: this.config.hostOrSocket }
        : { host: this.endpoint.host, port: this.endpoint.port }),
      ...(ssl ? { ssl } : {}),
    };
  }

  public async connect(): Promise<void> {
    const ssl = sslOptions(
      this.config.tlsMode,
      this.config.keyPath,
      this.config.certPath,
      this.config.caPath,
    );

    try {
      this.connection = await mysql.createConnection(this.options(ssl));
      return;
    } catch (error) {
      if (this.config.tlsMode !== 'preferred' || !canFallbackFromTls(errorText(error))) {
        throw error;
      }
    }

    this.connection = await mysql.createConnection(this.options(undefined));
  }

  public async close(): Promise<void> {
    const connection = this.connection;
    this.connection = undefined;

    if (connection) {
      await connection.end();
    }
  }

  private requireConnection(): Connection {
    if (!this.connection) {
      throw new Error('Database connection is not open.');
    }

    return this.connection;
  }

  public async getMetadata(preferredSchema?: string): Promise<DatabaseMetadata> {
    const connection = this.requireConnection();
    const [schemaRows] = await connection.query<RowDataPacket[]>(`
      SELECT schema_name AS name
      FROM information_schema.schemata
      WHERE schema_name NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
      ORDER BY schema_name
    `);

    const schemas: readonly SchemaInfo[] = schemaRows.map((row) => ({
      name: String(row['name'] ?? ''),
    }));

    const [tableRows] = await connection.query<RowDataPacket[]>(`
      SELECT table_schema AS schema_name, table_name AS name, table_type
      FROM information_schema.tables
      WHERE table_schema NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
      ORDER BY table_schema, table_name
    `);

    const tables: readonly TableInfo[] = tableRows.map((row) => ({
      schema: String(row['schema_name'] ?? ''),
      name: String(row['name'] ?? ''),
      type: String(row['table_type'] ?? '')
        .toUpperCase()
        .includes('VIEW')
        ? 'view'
        : 'table',
    }));

    const [routineRows] = await connection.query<RowDataPacket[]>(`
      SELECT routine_schema AS schema_name, routine_name AS name, routine_type
      FROM information_schema.routines
      WHERE routine_schema NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
      ORDER BY routine_schema, routine_name
    `);

    const procedures: readonly ProcedureInfo[] = routineRows.map((row) => ({
      schema: String(row['schema_name'] ?? ''),
      name: String(row['name'] ?? ''),
      type:
        String(row['routine_type'] ?? '').toUpperCase() === 'PROCEDURE' ? 'procedure' : 'function',
    }));

    const names = new Set(schemas.map((schema) => schema.name));
    const selectedSchema =
      preferredSchema && names.has(preferredSchema)
        ? preferredSchema
        : this.config.database && names.has(this.config.database)
          ? this.config.database
          : (schemas[0]?.name ?? '');
    return { schemas, tables, procedures, selectedSchema };
  }

  private async columns(schema: string, table: string): Promise<readonly string[]> {
    const [rows] = await this.requireConnection().query<RowDataPacket[]>(
      `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = ? AND table_name = ?
      ORDER BY ordinal_position
    `,
      [schema, table],
    );
    return rows.map((row) => String(row['column_name'] ?? '')).filter((value) => value.length > 0);
  }

  private async primaryKey(schema: string, table: string): Promise<readonly string[]> {
    const [rows] = await this.requireConnection().query<RowDataPacket[]>(
      `
      SELECT column_name
      FROM information_schema.key_column_usage
      WHERE table_schema = ? AND table_name = ? AND constraint_name = 'PRIMARY'
      ORDER BY ordinal_position
    `,
      [schema, table],
    );
    return rows.map((row) => String(row['column_name'] ?? '')).filter((value) => value.length > 0);
  }

  public async fetchTablePage(request: TablePageRequest): Promise<TablePage> {
    const connection = this.requireConnection();
    const columns = await this.columns(request.schema, request.table);
    const qualified = `${quoteMySqlIdentifier(request.schema)}.${quoteMySqlIdentifier(request.table)}`;
    const search = request.search.trim();

    const where =
      search && columns.length > 0
        ? `WHERE ${columns.map((column) => `CAST(${quoteMySqlIdentifier(column)} AS CHAR) LIKE ?`).join(' OR ')}`
        : '';

    const searchParams = search ? columns.map(() => `%${search}%`) : [];
    const [countRows] = await connection.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS count FROM ${qualified} ${where}`,
      searchParams,
    );

    const totalRows = Number(String(countRows[0]?.['count'] ?? '0'));
    const key = await this.primaryKey(request.schema, request.table);
    const orderBy = key.length > 0 ? `ORDER BY ${key.map(quoteMySqlIdentifier).join(', ')}` : '';
    const offset = (request.page - 1) * request.pageSize;

    const [rows, fields] = await connection.query<RowDataPacket[]>(
      `SELECT * FROM ${qualified} ${where} ${orderBy} LIMIT ? OFFSET ?`,
      [...searchParams, request.pageSize, offset],
    );
    return {
      columns: fields.map((field) => field.name),
      rows: rows.map((row) => toDisplayRow(row)),
      rowIdentities: key.length > 0 ? rows.map((row) => toRowIdentity(row, key)) : [],
      primaryKeyColumns: key,
      editable: key.length > 0,
      page: request.page,
      pageSize: request.pageSize,
      totalRows,
    };
  }

  public async updateCell(request: CellUpdateRequest): Promise<void> {
    const columns = await this.columns(request.schema, request.table);
    if (!columns.includes(request.column)) {
      throw new Error('The selected column no longer exists. Refresh the table and try again.');
    }

    const primaryKey = await this.primaryKey(request.schema, request.table);
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

    const qualified = `${quoteMySqlIdentifier(request.schema)}.${quoteMySqlIdentifier(request.table)}`;
    const where = primaryKey.map((column) => `${quoteMySqlIdentifier(column)} = ?`).join(' AND ');

    const [result] = await this.requireConnection().query(
      `UPDATE ${qualified} SET ${quoteMySqlIdentifier(request.column)} = ? WHERE ${where}`,
      [request.value, ...keyValues],
    );

    if (Array.isArray(result)) {
      throw new Error('The database did not return an update status.');
    }

    if (result.affectedRows > 1) {
      throw new Error(`Cell update matched ${result.affectedRows} rows. The change was rejected.`);
    }

    if (result.affectedRows === 0) {
      const [rows] = await this.requireConnection().query<RowDataPacket[]>(
        `SELECT 1 AS present FROM ${qualified} WHERE ${where} LIMIT 1`,
        keyValues,
      );

      if (rows.length === 0) {
        throw new Error('The row no longer exists. Refresh the table and try again.');
      }
    }
  }

  public async getProcedureDefinition(request: ProcedureDefinitionRequest): Promise<string> {
    const kind = request.type === 'procedure' ? 'PROCEDURE' : 'FUNCTION';
    const [rows] = await this.requireConnection().query<RowDataPacket[]>(
      `SHOW CREATE ${kind} ${quoteMySqlIdentifier(request.schema)}.${quoteMySqlIdentifier(request.name)}`,
    );

    const row = rows[0];
    if (!row) {
      return '-- Definition is not available.';
    }

    for (const [key, value] of Object.entries(row)) {
      if (key.toLowerCase().startsWith('create ')) {
        return String(value ?? '');
      }
    }

    return '-- Definition is not available.';
  }

  public async execute(sql: string): Promise<QueryExecutionResult> {
    const started = performance.now();
    const [raw, fields] = await this.requireConnection().query<QueryResult>(sql);
    const resultSets: QueryResultSet[] = [];

    if (!Array.isArray(raw)) {
      resultSets.push({ columns: [], rows: [], affectedRows: raw.affectedRows });
    } else if (raw.length === 0) {
      resultSets.push(rowsToSet([], fields));
    } else {
      const simpleRows: RowDataPacket[] = [];
      let compound = false;

      for (const item of raw) {
        if (Array.isArray(item)) {
          compound = true;
          resultSets.push(rowsToSet(item));
        } else if (isAffectedRowsPacket(item)) {
          compound = true;
          resultSets.push({ columns: [], rows: [], affectedRows: item.affectedRows });
        } else {
          simpleRows.push(item);
        }
      }

      if (!compound) {
        resultSets.push(rowsToSet(simpleRows, fields));
      } else if (simpleRows.length > 0) {
        resultSets.unshift(rowsToSet(simpleRows));
      }
    }

    return {
      resultSets,
      message:
        resultSets.length === 1 ? 'Query completed.' : `${resultSets.length} statements completed.`,
      durationMs: Math.round((performance.now() - started) * 100) / 100,
    };
  }
}
