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
import type { SecureContextOptions } from 'node:tls';
import * as mssql from 'mssql';
import type {
  CellUpdateRequest,
  DatabaseMetadata,
  DisplayRow,
  MsSqlConnectionConfig,
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
import { quoteMsSqlIdentifier } from '../util/sql';
import type { DatabaseAdapter } from './base';

interface Endpoint {
  readonly host: string;
  readonly port: number;
}

interface MsRow {
  readonly [key: string]: string | number | boolean | Date | Buffer | null;
}

function cryptoDetails(config: MsSqlConnectionConfig): SecureContextOptions | undefined {
  const key = config.keyPath ? readFileSync(config.keyPath) : undefined;
  const cert = config.certPath ? readFileSync(config.certPath) : undefined;
  const ca = config.caPath ? readFileSync(config.caPath) : undefined;

  if (!key && !cert && !ca) {
    return undefined;
  }

  return {
    ...(key ? { key } : {}),
    ...(cert ? { cert } : {}),
    ...(ca ? { ca } : {}),
  };
}

function tlsFlags(mode: TlsMode): { encrypt: boolean; trustServerCertificate: boolean } {
  if (mode === 'disabled') {
    return { encrypt: false, trustServerCertificate: false };
  }

  if (mode === 'required' || mode === 'preferred') {
    return { encrypt: true, trustServerCertificate: true };
  }

  return { encrypt: true, trustServerCertificate: false };
}

function canFallbackFromTls(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('server requires encryption') === false &&
    (lower.includes('encryption not supported') ||
      (lower.includes('tls') && lower.includes('unsupported')) ||
      (lower.includes('ssl') && lower.includes('unsupported')))
  );
}

function toResultSet(
  recordset: readonly MsRow[] | undefined,
  affectedRows: number | null,
): QueryResultSet {
  const rows: readonly DisplayRow[] = (recordset ?? []).map((row) => toDisplayRow(row));
  return {
    columns: columnsFromRows(rows),
    rows,
    affectedRows,
  };
}

export class MsSqlAdapter implements DatabaseAdapter {
  private pool: mssql.ConnectionPool | undefined;

  public constructor(
    private readonly config: MsSqlConnectionConfig,
    private readonly secrets: RuntimeSecrets,
    private readonly endpoint: Endpoint,
  ) {}

  private poolConfig(mode: TlsMode): mssql.config {
    const flags = tlsFlags(mode);
    const cryptoCredentialsDetails = cryptoDetails(this.config);
    return {
      server: this.endpoint.host,
      port: this.endpoint.port,
      user: this.config.username,
      password: this.secrets.databasePassword,
      ...(this.config.database ? { database: this.config.database } : {}),
      options: {
        encrypt: flags.encrypt,
        trustServerCertificate: flags.trustServerCertificate,
        enableArithAbort: true,
        ...(this.config.ssh.enabled ? { serverName: this.config.hostOrSocket } : {}),
        ...(cryptoCredentialsDetails ? { cryptoCredentialsDetails } : {}),
      },
      pool: {
        max: 5,
        min: 0,
        idleTimeoutMillis: 30_000,
      },
      connectionTimeout: 20_000,
      requestTimeout: 120_000,
    };
  }

  public async connect(): Promise<void> {
    const first = new mssql.ConnectionPool(this.poolConfig(this.config.tlsMode));
    try {
      this.pool = await first.connect();
      return;
    } catch (error) {
      await first.close().catch(() => undefined);
      if (this.config.tlsMode !== 'preferred' || !canFallbackFromTls(errorText(error))) {
        throw error;
      }
    }

    const fallback = new mssql.ConnectionPool(this.poolConfig('disabled'));
    this.pool = await fallback.connect();
  }

  public async close(): Promise<void> {
    const pool = this.pool;
    this.pool = undefined;

    if (pool) {
      await pool.close();
    }
  }

  private requirePool(): mssql.ConnectionPool {
    if (!this.pool) {
      throw new Error('Database connection is not open.');
    }

    return this.pool;
  }

  public async getMetadata(preferredSchema?: string): Promise<DatabaseMetadata> {
    const pool = this.requirePool();
    const schemaResult = await pool.request().query<MsRow>(`
      SELECT name
      FROM sys.schemas
      WHERE name NOT IN ('sys', 'INFORMATION_SCHEMA')
      ORDER BY name
    `);

    const schemas: readonly SchemaInfo[] = schemaResult.recordset.map((row) => ({
      name: String(row['name'] ?? ''),
    }));

    const tableResult = await pool.request().query<MsRow>(`
      SELECT s.name AS schema_name, o.name, o.type
      FROM sys.objects o
      JOIN sys.schemas s ON s.schema_id = o.schema_id
      WHERE o.type IN ('U', 'V') AND o.is_ms_shipped = 0
      ORDER BY s.name, o.name
    `);

    const tables: readonly TableInfo[] = tableResult.recordset.map((row) => ({
      schema: String(row['schema_name'] ?? ''),
      name: String(row['name'] ?? ''),
      type: String(row['type'] ?? '') === 'V' ? 'view' : 'table',
    }));

    const routineResult = await pool.request().query<MsRow>(`
      SELECT s.name AS schema_name, p.name, 'P' AS type
      FROM sys.procedures p
      JOIN sys.schemas s ON s.schema_id = p.schema_id
      WHERE p.is_ms_shipped = 0
      UNION ALL
      SELECT s.name AS schema_name, o.name, o.type
      FROM sys.objects o
      JOIN sys.schemas s ON s.schema_id = o.schema_id
      WHERE o.type IN ('FN', 'IF', 'TF', 'FS', 'FT', 'AF') AND o.is_ms_shipped = 0
      ORDER BY schema_name, name
    `);

    const procedures: readonly ProcedureInfo[] = routineResult.recordset.map((row) => ({
      schema: String(row['schema_name'] ?? ''),
      name: String(row['name'] ?? ''),
      type: String(row['type'] ?? '') === 'P' ? 'procedure' : 'function',
    }));

    const names = new Set(schemas.map((schema) => schema.name));
    const selectedSchema =
      preferredSchema && names.has(preferredSchema)
        ? preferredSchema
        : names.has('dbo')
          ? 'dbo'
          : (schemas[0]?.name ?? '');
    return { schemas, tables, procedures, selectedSchema };
  }

  private async columns(schema: string, table: string): Promise<readonly string[]> {
    const result = await this.requirePool()
      .request()
      .input('schema', mssql.NVarChar, schema)
      .input('table', mssql.NVarChar, table).query<MsRow>(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = @schema AND table_name = @table
        ORDER BY ordinal_position
      `);
    return result.recordset
      .map((row) => String(row['column_name'] ?? ''))
      .filter((value) => value.length > 0);
  }

  private async primaryKey(schema: string, table: string): Promise<readonly string[]> {
    const result = await this.requirePool()
      .request()
      .input('schema', mssql.NVarChar, schema)
      .input('table', mssql.NVarChar, table).query<MsRow>(`
        SELECT c.name AS column_name
        FROM sys.indexes i
        JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
        JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
        JOIN sys.tables t ON t.object_id = i.object_id
        JOIN sys.schemas s ON s.schema_id = t.schema_id
        WHERE i.is_primary_key = 1 AND s.name = @schema AND t.name = @table
        ORDER BY ic.key_ordinal
      `);
    return result.recordset
      .map((row) => String(row['column_name'] ?? ''))
      .filter((value) => value.length > 0);
  }

  public async fetchTablePage(request: TablePageRequest): Promise<TablePage> {
    const pool = this.requirePool();
    const columns = await this.columns(request.schema, request.table);
    const qualified = `${quoteMsSqlIdentifier(request.schema)}.${quoteMsSqlIdentifier(request.table)}`;
    const search = request.search.trim();

    const where =
      search && columns.length > 0
        ? `WHERE ${columns.map((column) => `TRY_CONVERT(nvarchar(max), ${quoteMsSqlIdentifier(column)}) LIKE @search`).join(' OR ')}`
        : '';

    const countRequest = pool.request();
    if (search) {
      countRequest.input('search', mssql.NVarChar, `%${search}%`);
    }

    const countResult = await countRequest.query<MsRow>(
      `SELECT COUNT_BIG(*) AS count FROM ${qualified} ${where}`,
    );

    const totalRows = Number(String(countResult.recordset[0]?.['count'] ?? '0'));
    const key = await this.primaryKey(request.schema, request.table);
    const orderBy =
      key.length > 0
        ? `ORDER BY ${key.map(quoteMsSqlIdentifier).join(', ')}`
        : 'ORDER BY (SELECT NULL)';

    const offset = (request.page - 1) * request.pageSize;
    const pageRequest = pool
      .request()
      .input('offset', mssql.Int, offset)
      .input('pageSize', mssql.Int, request.pageSize);

    if (search) {
      pageRequest.input('search', mssql.NVarChar, `%${search}%`);
    }

    const pageResult = await pageRequest.query<MsRow>(`
      SELECT * FROM ${qualified}
      ${where}
      ${orderBy}
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
    `);

    const rows = pageResult.recordset.map((row) => toDisplayRow(row));
    return {
      columns,
      rows,
      rowIdentities:
        key.length > 0 ? pageResult.recordset.map((row) => toRowIdentity(row, key)) : [],
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

    const query = this.requirePool().request().input('newValue', mssql.NVarChar, request.value);
    const predicates: string[] = [];

    primaryKey.forEach((column, index) => {
      const value = request.rowIdentity[column];
      if (value === undefined) {
        throw new Error('The row identity is incomplete. Refresh the table and try again.');
      }

      const parameter = `key${index}`;
      query.input(parameter, mssql.NVarChar, value);
      predicates.push(`${quoteMsSqlIdentifier(column)} = @${parameter}`);
    });

    const qualified = `${quoteMsSqlIdentifier(request.schema)}.${quoteMsSqlIdentifier(request.table)}`;
    const result = await query.query<MsRow>(
      `UPDATE ${qualified} SET ${quoteMsSqlIdentifier(request.column)} = @newValue WHERE ${predicates.join(' AND ')}`,
    );

    const matched = result.rowsAffected.reduce((sum, value) => sum + value, 0);
    if (matched !== 1) {
      throw new Error(
        `Cell update matched ${matched} rows. The change was not accepted as a single-row update.`,
      );
    }
  }

  public async getProcedureDefinition(request: ProcedureDefinitionRequest): Promise<string> {
    const qualified = `${request.schema}.${request.name}`;
    const result = await this.requirePool()
      .request()
      .input('qualified', mssql.NVarChar, qualified)
      .query<MsRow>('SELECT OBJECT_DEFINITION(OBJECT_ID(@qualified)) AS definition');
    return String(result.recordset[0]?.['definition'] ?? '-- Definition is not available.');
  }

  public async execute(sqlText: string): Promise<QueryExecutionResult> {
    const started = performance.now();
    const result = await this.requirePool().request().query<MsRow>(sqlText);
    const resultSets: QueryResultSet[] = [];
    const sets = result.recordsets;

    if (sets.length === 0) {
      resultSets.push({
        columns: [],
        rows: [],
        affectedRows: result.rowsAffected.reduce((sum, value) => sum + value, 0),
      });
    } else {
      sets.forEach((recordset, index) => {
        resultSets.push(toResultSet(recordset, result.rowsAffected[index] ?? null));
      });
    }

    return {
      resultSets,
      message:
        resultSets.length === 1 ? 'Query completed.' : `${resultSets.length} result sets returned.`,
      durationMs: Math.round((performance.now() - started) * 100) / 100,
    };
  }
}
