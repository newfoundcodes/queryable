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

import sqlite3 from 'sqlite3';
import type {
  CellUpdateRequest,
  DatabaseMetadata,
  DisplayRow,
  ProcedureDefinitionRequest,
  QueryExecutionResult,
  RuntimeSecrets,
  SchemaInfo,
  SqliteConnectionConfig,
  TableInfo,
  TablePage,
  TablePageRequest,
} from '../types';
import { columnsFromRows, toDisplayRow, toRowIdentity } from '../util/format';
import { quoteSqliteIdentifier } from '../util/sql';
import type { DatabaseAdapter } from './base';

interface SqliteRow {
  readonly [key: string]: string | number | boolean | bigint | Buffer | null;
}

interface RunInfo {
  readonly changes: number;
  readonly lastID: number;
}

function returnsRows(sql: string): boolean {
  const normalized = sql
    .trim()
    .replace(/^--.*$/gm, '')
    .trim()
    .toUpperCase();
  return (
    normalized.startsWith('SELECT') ||
    normalized.startsWith('PRAGMA') ||
    normalized.startsWith('EXPLAIN') ||
    normalized.startsWith('VALUES') ||
    normalized.startsWith('WITH') ||
    /\bRETURNING\b/.test(normalized)
  );
}

export class SqliteAdapter implements DatabaseAdapter {
  private database: sqlite3.Database | undefined;

  public constructor(
    private readonly config: SqliteConnectionConfig,
    private readonly secrets: RuntimeSecrets,
  ) {
    void this.secrets;
  }

  public async connect(): Promise<void> {
    this.database = await new Promise<sqlite3.Database>((resolve, reject) => {
      const database = new sqlite3.Database(
        this.config.filePath,
        sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
        (error) => {
          if (error) {
            reject(error);
          } else {
            resolve(database);
          }
        },
      );
    });

    await this.runOnly('PRAGMA foreign_keys = ON');
    await this.runOnly('PRAGMA busy_timeout = 5000');
  }

  public async close(): Promise<void> {
    const database = this.database;
    this.database = undefined;

    if (!database) {
      return;
    }

    await new Promise<void>((resolve, reject) =>
      database.close((error) => (error ? reject(error) : resolve())),
    );
  }

  private requireDatabase(): sqlite3.Database {
    if (!this.database) {
      throw new Error('Database connection is not open.');
    }

    return this.database;
  }

  private async all(
    sql: string,
    parameters: readonly (string | number)[] = [],
  ): Promise<readonly SqliteRow[]> {
    return new Promise<readonly SqliteRow[]>((resolve, reject) => {
      this.requireDatabase().all<SqliteRow>(sql, [...parameters], (error, rows) =>
        error ? reject(error) : resolve(rows),
      );
    });
  }

  private async runOnly(
    sql: string,
    parameters: readonly (string | number)[] = [],
  ): Promise<RunInfo> {
    return new Promise<RunInfo>((resolve, reject) => {
      this.requireDatabase().run(sql, [...parameters], function (error: Error | null): void {
        if (error) {
          reject(error);
        } else {
          resolve({ changes: this.changes, lastID: this.lastID });
        }
      });
    });
  }

  public async getMetadata(preferredSchema?: string): Promise<DatabaseMetadata> {
    const databases = await this.all('PRAGMA database_list');
    const schemas: readonly SchemaInfo[] = databases
      .map((row) => ({ name: String(row['name'] ?? '') }))
      .filter((schema) => schema.name.length > 0);

    const tables: TableInfo[] = [];
    for (const schema of schemas) {
      const rows = await this.all(`
        SELECT name, type
        FROM ${quoteSqliteIdentifier(schema.name)}.sqlite_master
        WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `);

      rows.forEach((row) =>
        tables.push({
          schema: schema.name,
          name: String(row['name'] ?? ''),
          type: String(row['type'] ?? '') === 'view' ? 'view' : 'table',
        }),
      );
    }

    const names = new Set(schemas.map((schema) => schema.name));
    const selectedSchema =
      preferredSchema && names.has(preferredSchema)
        ? preferredSchema
        : names.has('main')
          ? 'main'
          : (schemas[0]?.name ?? '');
    return { schemas, tables, procedures: [], selectedSchema };
  }

  private async columns(schema: string, table: string): Promise<readonly string[]> {
    const rows = await this.all(
      `PRAGMA ${quoteSqliteIdentifier(schema)}.table_info(${quoteSqliteIdentifier(table)})`,
    );
    return rows.map((row) => String(row['name'] ?? '')).filter((value) => value.length > 0);
  }

  private async primaryKey(schema: string, table: string): Promise<readonly string[]> {
    const rows = await this.all(
      `PRAGMA ${quoteSqliteIdentifier(schema)}.table_info(${quoteSqliteIdentifier(table)})`,
    );
    return rows
      .filter((row) => Number(row['pk'] ?? 0) > 0)
      .sort((left, right) => Number(left['pk'] ?? 0) - Number(right['pk'] ?? 0))
      .map((row) => String(row['name'] ?? ''));
  }

  public async fetchTablePage(request: TablePageRequest): Promise<TablePage> {
    const columns = await this.columns(request.schema, request.table);
    const qualified = `${quoteSqliteIdentifier(request.schema)}.${quoteSqliteIdentifier(request.table)}`;
    const search = request.search.trim();

    const where =
      search && columns.length > 0
        ? `WHERE ${columns.map((column) => `CAST(${quoteSqliteIdentifier(column)} AS TEXT) LIKE ?`).join(' OR ')}`
        : '';

    const searchParams = search ? columns.map(() => `%${search}%`) : [];
    const countRows = await this.all(
      `SELECT COUNT(*) AS count FROM ${qualified} ${where}`,
      searchParams,
    );

    const totalRows = Number(String(countRows[0]?.['count'] ?? '0'));
    const key = await this.primaryKey(request.schema, request.table);
    const orderBy = key.length > 0 ? `ORDER BY ${key.map(quoteSqliteIdentifier).join(', ')}` : '';
    const offset = (request.page - 1) * request.pageSize;

    const pageRows = await this.all(
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

    const qualified = `${quoteSqliteIdentifier(request.schema)}.${quoteSqliteIdentifier(request.table)}`;
    const where = primaryKey.map((column) => `${quoteSqliteIdentifier(column)} = ?`).join(' AND ');

    const info = await this.runOnly(
      `UPDATE ${qualified} SET ${quoteSqliteIdentifier(request.column)} = ? WHERE ${where}`,
      [request.value, ...keyValues],
    );

    if (info.changes > 1) {
      throw new Error(`Cell update matched ${info.changes} rows. The change was rejected.`);
    }

    if (info.changes === 0) {
      const existing = await this.all(
        `SELECT 1 AS present FROM ${qualified} WHERE ${where} LIMIT 1`,
        keyValues,
      );

      if (existing.length === 0) {
        throw new Error('The row no longer exists. Refresh the table and try again.');
      }
    }
  }

  public async getProcedureDefinition(request: ProcedureDefinitionRequest): Promise<string> {
    void request;
    return '-- SQLite does not provide stored procedures.';
  }

  public async execute(sql: string): Promise<QueryExecutionResult> {
    const started = performance.now();
    if (returnsRows(sql)) {
      const rawRows = await this.all(sql);
      const rows = rawRows.map((row) => toDisplayRow(row));
      return {
        resultSets: [{ columns: columnsFromRows(rows), rows, affectedRows: null }],
        message: 'Query completed.',
        durationMs: Math.round((performance.now() - started) * 100) / 100,
      };
    }

    const info = await this.runOnly(sql);
    return {
      resultSets: [{ columns: [], rows: [], affectedRows: info.changes }],
      message: `Statement completed. Last row id: ${info.lastID}.`,
      durationMs: Math.round((performance.now() - started) * 100) / 100,
    };
  }
}
