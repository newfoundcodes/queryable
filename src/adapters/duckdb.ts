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

import { DuckDBConnection, DuckDBInstance } from '@duckdb/node-api';
import type {
  CellUpdateRequest,
  DatabaseMetadata,
  DisplayRow,
  DuckDbConnectionConfig,
  ProcedureDefinitionRequest,
  ProcedureInfo,
  QueryExecutionResult,
  RuntimeSecrets,
  SchemaInfo,
  TableInfo,
  TablePage,
  TablePageRequest,
} from '../types';
import { columnsFromRows, toDisplayRow, toRowIdentity } from '../util/format';
import { quotePostgresIdentifier } from '../util/sql';
import type { DatabaseAdapter } from './base';

export class DuckDbAdapter implements DatabaseAdapter {
  private instance: DuckDBInstance | undefined;
  private connection: DuckDBConnection | undefined;

  public constructor(
    private readonly config: DuckDbConnectionConfig,
    private readonly secrets: RuntimeSecrets,
  ) {
    void this.secrets;
  }

  public async connect(): Promise<void> {
    this.instance = await DuckDBInstance.create(this.config.filePath);
    this.connection = await this.instance.connect();

    await this.connection.run('SELECT 1');
  }

  public async close(): Promise<void> {
    const connection = this.connection;
    this.connection = undefined;

    if (connection) {
      connection.closeSync();
    }

    this.instance = undefined;
  }

  private requireConnection(): DuckDBConnection {
    if (!this.connection) {
      throw new Error('Database connection is not open.');
    }

    return this.connection;
  }

  private async rows(
    sql: string,
    values: readonly (string | number)[] = [],
  ): Promise<readonly object[]> {
    const reader = await this.requireConnection().runAndReadAll(sql, [...values]);
    return reader.getRowObjectsJson();
  }

  public async getMetadata(preferredSchema?: string): Promise<DatabaseMetadata> {
    const schemaRows = await this.rows(`
      SELECT schema_name AS name
      FROM information_schema.schemata
      WHERE schema_name NOT IN ('information_schema', 'pg_catalog')
      ORDER BY schema_name
    `);

    const schemas: readonly SchemaInfo[] = schemaRows.map((row) => {
      const value = row as Record<string, object | string | number | boolean | null>;
      return { name: String(value['name'] ?? '') };
    });

    const tableRows = await this.rows(`
      SELECT table_schema AS schema_name, table_name AS name, table_type
      FROM information_schema.tables
      WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
      ORDER BY table_schema, table_name
    `);

    const tables: readonly TableInfo[] = tableRows.map((row) => {
      const value = row as Record<string, object | string | number | boolean | null>;
      return {
        schema: String(value['schema_name'] ?? ''),
        name: String(value['name'] ?? ''),
        type: String(value['table_type'] ?? '')
          .toUpperCase()
          .includes('VIEW')
          ? 'view'
          : 'table',
      };
    });

    const routineRows = await this.rows(`
      SELECT schema_name, function_name, function_type
      FROM duckdb_functions()
      WHERE internal = false AND function_type IN ('macro', 'table_macro')
      ORDER BY schema_name, function_name
    `);

    const procedures: readonly ProcedureInfo[] = routineRows.map((row) => {
      const value = row as Record<string, object | string | number | boolean | null>;
      return {
        schema: String(value['schema_name'] ?? 'main'),
        name: String(value['function_name'] ?? ''),
        type: 'macro',
      };
    });

    const names = new Set(schemas.map((schema) => schema.name));
    const selectedSchema =
      preferredSchema && names.has(preferredSchema)
        ? preferredSchema
        : names.has('main')
          ? 'main'
          : (schemas[0]?.name ?? '');
    return { schemas, tables, procedures, selectedSchema };
  }

  private async columns(schema: string, table: string): Promise<readonly string[]> {
    const rows = await this.rows(
      `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = ? AND table_name = ?
      ORDER BY ordinal_position
    `,
      [schema, table],
    );
    return rows
      .map((row) => {
        const value = row as Record<string, object | string | number | boolean | null>;
        return String(value['column_name'] ?? '');
      })
      .filter((value) => value.length > 0);
  }

  private async primaryKey(schema: string, table: string): Promise<readonly string[]> {
    const rows = await this.rows(
      `
      SELECT kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_catalog = kcu.constraint_catalog
       AND tc.constraint_schema = kcu.constraint_schema
       AND tc.constraint_name = kcu.constraint_name
      WHERE tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_schema = ? AND tc.table_name = ?
      ORDER BY kcu.ordinal_position
    `,
      [schema, table],
    );
    return rows
      .map((row) => {
        const value = row as Record<string, object | string | number | boolean | null>;
        return String(value['column_name'] ?? '');
      })
      .filter((value) => value.length > 0);
  }

  public async fetchTablePage(request: TablePageRequest): Promise<TablePage> {
    const columns = await this.columns(request.schema, request.table);
    const qualified = `${quotePostgresIdentifier(request.schema)}.${quotePostgresIdentifier(request.table)}`;
    const search = request.search.trim();

    const where =
      search && columns.length > 0
        ? `WHERE ${columns.map((column) => `CAST(${quotePostgresIdentifier(column)} AS VARCHAR) ILIKE ?`).join(' OR ')}`
        : '';
    const searchParams = search ? columns.map(() => `%${search}%`) : [];
    const countRows = await this.rows(
      `SELECT COUNT(*) AS count FROM ${qualified} ${where}`,
      searchParams,
    );
    const countValue = countRows[0] as
      Record<string, object | string | number | boolean | null> | undefined;

    const totalRows = Number(String(countValue?.['count'] ?? '0'));
    const key = await this.primaryKey(request.schema, request.table);
    const orderBy = key.length > 0 ? `ORDER BY ${key.map(quotePostgresIdentifier).join(', ')}` : '';
    const offset = (request.page - 1) * request.pageSize;

    const pageRows = await this.rows(
      `SELECT * FROM ${qualified} ${where} ${orderBy} LIMIT ? OFFSET ?`,
      [...searchParams, request.pageSize, offset],
    );

    const rows: readonly DisplayRow[] = pageRows.map((row) => toDisplayRow(row));
    return {
      columns: columns.length > 0 ? columns : columnsFromRows(rows),
      rows,
      rowIdentities: key.length > 0 ? pageRows.map((row) => toRowIdentity(row, key)) : [],
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

    const qualified = `${quotePostgresIdentifier(request.schema)}.${quotePostgresIdentifier(request.table)}`;
    const where = primaryKey
      .map((column) => `${quotePostgresIdentifier(column)} = ?`)
      .join(' AND ');
    const before = await this.rows(
      `SELECT 1 AS present FROM ${qualified} WHERE ${where} LIMIT 2`,
      keyValues,
    );

    if (before.length !== 1) {
      throw new Error(
        `Cell update matched ${before.length} rows before writing. The change was rejected.`,
      );
    }

    await this.requireConnection().run(
      `UPDATE ${qualified} SET ${quotePostgresIdentifier(request.column)} = ? WHERE ${where}`,
      [request.value, ...keyValues],
    );
  }

  public async getProcedureDefinition(request: ProcedureDefinitionRequest): Promise<string> {
    const rows = await this.rows(
      `
      SELECT function_type, parameters, macro_definition
      FROM duckdb_functions()
      WHERE internal = false AND schema_name = ? AND function_name = ?
      ORDER BY function_oid
    `,
      [request.schema, request.name],
    );

    if (rows.length === 0) {
      return '-- Definition is not available.';
    }

    return rows
      .map((row) => {
        const value = row as Record<string, object | string | number | boolean | null>;
        const type = String(value['function_type'] ?? 'macro');
        const parameters = String(value['parameters'] ?? '[]').replace(/^\[|\]$/g, '');
        const definition = String(value['macro_definition'] ?? '');
        const keyword = type === 'table_macro' ? 'AS TABLE' : 'AS';
        return `CREATE MACRO ${quotePostgresIdentifier(request.schema)}.${quotePostgresIdentifier(request.name)}(${parameters}) ${keyword} ${definition};`;
      })
      .join('\n\n');
  }

  public async execute(sql: string): Promise<QueryExecutionResult> {
    const started = performance.now();
    const reader = await this.requireConnection().runAndReadAll(sql);
    const rawRows = reader.getRowObjectsJson();
    const rows: readonly DisplayRow[] = rawRows.map((row) => toDisplayRow(row));

    const columns = reader.columnNames();
    return {
      resultSets: [{ columns, rows, affectedRows: null }],
      message: 'Query completed.',
      durationMs: Math.round((performance.now() - started) * 100) / 100,
    };
  }
}
