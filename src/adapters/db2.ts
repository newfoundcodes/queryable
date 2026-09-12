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
  Db2ConnectionConfig,
  DisplayRow,
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
import * as db2Module from 'ibm_db';
import {
  columnsFromRows,
  errorText,
  positiveInteger,
  toDisplayRow,
  toRowIdentity,
} from '../util/format';
import { quoteDb2Identifier } from '../util/sql';
import type { DatabaseAdapter } from './base';

interface Endpoint {
  readonly host: string;
  readonly port: number;
}

type Db2BindValue = string | number | bigint | boolean | Date | Buffer | null;

interface Db2Database {
  query(sql: string, params?: readonly Db2BindValue[]): Promise<readonly object[]>;
  close(): Promise<void>;
}

interface Db2Module {
  open(connectionString: string): Promise<Db2Database>;
}

interface Db2Column {
  readonly name: string;
  readonly dataType: string;
}

const db2DatabaseModule = db2Module as never as Db2Module;

function checkedConnectionValue(label: string, value: string): string {
  if (value.includes(';')) {
    throw new Error(`${label} cannot contain a semicolon in a direct Db2 connection string.`);
  }

  return value;
}

function canFallbackFromTls(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    (lower.includes('ssl') && lower.includes('not supported')) ||
    (lower.includes('tls') && lower.includes('not supported')) ||
    (lower.includes('security') && lower.includes('not supported'))
  );
}

function searchExpression(column: Db2Column): string | undefined {
  const type = column.dataType.toUpperCase();
  if (type.includes('BLOB') || type.includes('BINARY') || type.includes('XML')) {
    return undefined;
  }

  return `CAST(${quoteDb2Identifier(column.name)} AS VARCHAR(32672))`;
}

function toRecord(
  row: object,
): Record<string, object | string | number | boolean | bigint | null | undefined> {
  return row as Record<string, object | string | number | boolean | bigint | null | undefined>;
}

function resultSet(rows: readonly object[]): QueryResultSet {
  const displayRows: readonly DisplayRow[] = rows.map((row) => toDisplayRow(row));
  return { columns: columnsFromRows(displayRows), rows: displayRows, affectedRows: null };
}

export class Db2Adapter implements DatabaseAdapter {
  private connection: Db2Database | undefined;

  public constructor(
    private readonly config: Db2ConnectionConfig,
    private readonly secrets: RuntimeSecrets,
    private readonly endpoint: Endpoint,
  ) {}

  private connectionString(mode: TlsMode): string {
    const database = checkedConnectionValue('Database name', this.config.database);
    const host = checkedConnectionValue('Database host', this.endpoint.host);
    const username = checkedConnectionValue('Database username', this.config.username);
    const password = checkedConnectionValue('Database password', this.secrets.databasePassword);

    const fields = [
      `DATABASE=${database}`,
      `HOSTNAME=${host}`,
      `PORT=${this.endpoint.port}`,
      'PROTOCOL=TCPIP',
      `UID=${username}`,
      `PWD=${password}`,
    ];

    if (mode !== 'disabled') {
      fields.push('Security=SSL');
      if (this.config.caPath) {
        fields.push(
          `SSLServerCertificate=${checkedConnectionValue('Server certificate path', this.config.caPath)}`,
        );
      }

      if (mode === 'verify-identity') {
        fields.push('SSLClientHostnameValidation=Basic');
      } else if (mode === 'required' || mode === 'verify-ca' || mode === 'preferred') {
        fields.push('SSLClientHostnameValidation=OFF');
      }
    }

    return `${fields.join(';')};`;
  }

  public async connect(): Promise<void> {
    if (this.config.ssh.enabled && this.config.tlsMode === 'verify-identity') {
      throw new Error(
        'Db2 Verify Identity cannot be combined with the built-in SSH tunnel because the TLS endpoint is local. Use Verify CA or connect without the Queryable tunnel.',
      );
    }

    if (this.config.tlsMode === 'disabled') {
      this.connection = await db2DatabaseModule.open(this.connectionString('disabled'));
      return;
    }

    try {
      this.connection = await db2DatabaseModule.open(this.connectionString(this.config.tlsMode));
    } catch (error) {
      if (this.config.tlsMode !== 'preferred' || !canFallbackFromTls(errorText(error))) {
        throw error;
      }

      this.connection = await db2DatabaseModule.open(this.connectionString('disabled'));
    }
  }

  public async close(): Promise<void> {
    const connection = this.connection;
    this.connection = undefined;

    if (connection) {
      await connection.close();
    }
  }

  private requireConnection(): Db2Database {
    if (!this.connection) {
      throw new Error('Database connection is not open.');
    }

    return this.connection;
  }

  private rows(sql: string, params: readonly Db2BindValue[] = []): Promise<readonly object[]> {
    return this.requireConnection().query(sql, params);
  }

  public async getMetadata(preferredSchema?: string): Promise<DatabaseMetadata> {
    const schemaRows = await this.rows(`
      SELECT schemaname AS name
      FROM syscat.schemata
      WHERE schemaname NOT LIKE 'SYS%'
        AND schemaname NOT IN ('NULLID', 'SQLJ')
      ORDER BY schemaname
    `);

    const schemas: readonly SchemaInfo[] = schemaRows
      .map((row) => ({ name: String(toRecord(row)['NAME'] ?? '') }))
      .filter((schema) => schema.name.length > 0);

    const tableRows = await this.rows(`
      SELECT tabschema AS schema_name, tabname AS name, type
      FROM syscat.tables
      WHERE type IN ('T', 'U', 'V', 'W')
        AND tabschema NOT LIKE 'SYS%'
        AND tabschema NOT IN ('NULLID', 'SQLJ')
      ORDER BY tabschema, tabname
    `);

    const tables: readonly TableInfo[] = tableRows.map((row) => {
      const source = toRecord(row);
      const type = String(source['TYPE'] ?? '');
      return {
        schema: String(source['SCHEMA_NAME'] ?? ''),
        name: String(source['NAME'] ?? ''),
        type: type === 'V' || type === 'W' ? 'view' : 'table',
      };
    });

    const routineRows = await this.rows(`
      SELECT
        routineschema AS schema_name,
        CASE
          WHEN routinemodulename IS NULL THEN routinename
          ELSE routinemodulename || '.' || routinename
        END AS name,
        routinetype
      FROM syscat.routines
      WHERE routinetype IN ('P', 'F')
        AND routineschema NOT LIKE 'SYS%'
        AND routineschema NOT IN ('NULLID', 'SQLJ')
      ORDER BY routineschema, routinemodulename, routinename, specificname
    `);

    const procedures: readonly ProcedureInfo[] = routineRows.map((row) => {
      const source = toRecord(row);
      return {
        schema: String(source['SCHEMA_NAME'] ?? ''),
        name: String(source['NAME'] ?? ''),
        type: String(source['ROUTINETYPE'] ?? '') === 'P' ? 'procedure' : 'function',
      };
    });

    const names = new Set(schemas.map((schema) => schema.name));
    const usernameSchema = this.config.username.toUpperCase();

    const selectedSchema =
      preferredSchema && names.has(preferredSchema)
        ? preferredSchema
        : names.has(usernameSchema)
          ? usernameSchema
          : (schemas[0]?.name ?? '');
    return { schemas, tables, procedures, selectedSchema };
  }

  private async columns(schema: string, table: string): Promise<readonly Db2Column[]> {
    const rows = await this.rows(
      `
      SELECT colname AS name, typename AS data_type
      FROM syscat.columns
      WHERE tabschema = ? AND tabname = ?
      ORDER BY colno
    `,
      [schema, table],
    );
    return rows
      .map((row) => {
        const source = toRecord(row);
        return { name: String(source['NAME'] ?? ''), dataType: String(source['DATA_TYPE'] ?? '') };
      })
      .filter((column) => column.name.length > 0);
  }

  private async primaryKey(schema: string, table: string): Promise<readonly string[]> {
    const rows = await this.rows(
      `
      SELECT k.colname AS name
      FROM syscat.tabconst c
      JOIN syscat.keycoluse k
        ON k.tabschema = c.tabschema
       AND k.tabname = c.tabname
       AND k.constname = c.constname
      WHERE c.type = 'P'
        AND c.tabschema = ?
        AND c.tabname = ?
      ORDER BY k.colseq
    `,
      [schema, table],
    );
    return rows.map((row) => String(toRecord(row)['NAME'] ?? '')).filter((name) => name.length > 0);
  }

  public async fetchTablePage(request: TablePageRequest): Promise<TablePage> {
    const page = positiveInteger(request.page, 1, 2_147_483_647);
    const pageSize = positiveInteger(request.pageSize, 50, 1000);
    const columnInfo = await this.columns(request.schema, request.table);
    const qualified = `${quoteDb2Identifier(request.schema)}.${quoteDb2Identifier(request.table)}`;
    const search = request.search.trim();

    const searchable = columnInfo
      .map(searchExpression)
      .filter((expression): expression is string => expression !== undefined);
    const where =
      search && searchable.length > 0
        ? `WHERE ${searchable.map((expression) => `${expression} LIKE ?`).join(' OR ')}`
        : '';
    const searchParams: Db2BindValue[] =
      search && searchable.length > 0 ? searchable.map(() => `%${search}%`) : [];
    const countRows = await this.rows(
      `SELECT COUNT(*) AS row_count FROM ${qualified} ${where}`,
      searchParams,
    );
    const totalRows = Number(
      String(countRows[0] ? (toRecord(countRows[0])['ROW_COUNT'] ?? '0') : '0'),
    );

    const primaryKey = await this.primaryKey(request.schema, request.table);
    const orderColumns =
      primaryKey.length > 0 ? primaryKey : columnInfo.slice(0, 1).map((column) => column.name);
    const orderBy =
      orderColumns.length > 0 ? `ORDER BY ${orderColumns.map(quoteDb2Identifier).join(', ')}` : '';
    const offset = (page - 1) * pageSize;
    const sourceRows = await this.rows(
      `SELECT * FROM ${qualified} ${where} ${orderBy} OFFSET ${offset} ROWS FETCH NEXT ${pageSize} ROWS ONLY`,
      searchParams,
    );

    const displayRows = sourceRows.map((row) => toDisplayRow(row));
    return {
      columns:
        columnsFromRows(displayRows).length > 0
          ? columnsFromRows(displayRows)
          : columnInfo.map((column) => column.name),
      rows: displayRows,
      rowIdentities:
        primaryKey.length > 0 ? sourceRows.map((row) => toRowIdentity(row, primaryKey)) : [],
      primaryKeyColumns: primaryKey,
      editable: primaryKey.length > 0,
      page,
      pageSize,
      totalRows,
    };
  }

  public async updateCell(request: CellUpdateRequest): Promise<void> {
    const columnInfo = await this.columns(request.schema, request.table);
    if (!columnInfo.some((column) => column.name === request.column)) {
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

    const qualified = `${quoteDb2Identifier(request.schema)}.${quoteDb2Identifier(request.table)}`;
    const where = primaryKey.map((column) => `${quoteDb2Identifier(column)} = ?`).join(' AND ');

    await this.rows(
      `UPDATE ${qualified} SET ${quoteDb2Identifier(request.column)} = ? WHERE ${where}`,
      [request.value, ...keyValues],
    );
  }

  public async getProcedureDefinition(request: ProcedureDefinitionRequest): Promise<string> {
    if (request.type === 'macro') {
      return '-- Db2 does not use DuckDB-style macros.';
    }

    const separator = request.name.indexOf('.');
    const moduleName =
      separator > 0 && separator < request.name.length - 1 ? request.name.slice(0, separator) : '';
    const routineName = moduleName ? request.name.slice(separator + 1) : request.name;
    const routineType = request.type === 'procedure' ? 'P' : 'F';

    const rows = moduleName
      ? await this.rows(
          `
          SELECT text
          FROM syscat.routines
          WHERE routineschema = ?
            AND routinemodulename = ?
            AND routinename = ?
            AND routinetype = ?
          ORDER BY specificname
          FETCH FIRST 1 ROW ONLY
        `,
          [request.schema, moduleName, routineName, routineType],
        )
      : await this.rows(
          `
          SELECT text
          FROM syscat.routines
          WHERE routineschema = ?
            AND routinemodulename IS NULL
            AND routinename = ?
            AND routinetype = ?
          ORDER BY specificname
          FETCH FIRST 1 ROW ONLY
        `,
          [request.schema, routineName, routineType],
        );

    const text = rows[0] ? String(toRecord(rows[0])['TEXT'] ?? '') : '';
    return text.trim() ? text : '-- Definition is not available to this database user.';
  }

  public async execute(sql: string): Promise<QueryExecutionResult> {
    const statement = sql.trim();
    if (!statement) {
      throw new Error('Enter a SQL statement to run.');
    }

    const started = performance.now();
    const rows = await this.rows(statement);
    return {
      resultSets: [resultSet(rows)],
      message: 'Query completed.',
      durationMs: Math.round((performance.now() - started) * 100) / 100,
    };
  }
}
