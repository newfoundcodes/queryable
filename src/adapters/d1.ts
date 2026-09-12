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
  D1ConnectionConfig,
  DatabaseMetadata,
  DisplayRow,
  ProcedureDefinitionRequest,
  QueryExecutionResult,
  QueryResultSet,
  RuntimeSecrets,
  TableInfo,
  TablePage,
  TablePageRequest,
} from '../types';
import { columnsFromRows, toDisplayRow, toRowIdentity } from '../util/format';
import { quoteSqliteIdentifier } from '../util/sql';
import type { DatabaseAdapter } from './base';

interface D1ErrorInfo {
  readonly code?: number;
  readonly message?: string;
}

interface D1Meta {
  readonly changes?: number;
  readonly duration?: number;
  readonly rows_read?: number;
  readonly rows_written?: number;
}

interface D1QueryItem {
  readonly success?: boolean;
  readonly results?: readonly Record<string, object | string | number | boolean | null>[];
  readonly meta?: D1Meta;
}

interface D1Envelope {
  readonly success?: boolean;
  readonly errors?: readonly D1ErrorInfo[];
  readonly result?: readonly D1QueryItem[];
}

interface D1DatabaseEnvelope {
  readonly success?: boolean;
  readonly errors?: readonly D1ErrorInfo[];
  readonly result?: { readonly uuid?: string; readonly name?: string };
}

export class D1Adapter implements DatabaseAdapter {
  public constructor(
    private readonly config: D1ConnectionConfig,
    private readonly secrets: RuntimeSecrets,
  ) {}

  private baseUrl(): string {
    return `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(this.config.accountId)}/d1/database/${encodeURIComponent(this.config.databaseId)}`;
  }

  private headers(): HeadersInit {
    return {
      Authorization: `Bearer ${this.secrets.d1Token}`,
      'Content-Type': 'application/json',
    };
  }

  private errorMessage(errors: readonly D1ErrorInfo[] | undefined): string {
    const messages = (errors ?? []).map(
      (error) => error.message ?? `Cloudflare error ${error.code ?? 0}`,
    );
    return messages.length > 0 ? messages.join('; ') : 'Cloudflare D1 request failed.';
  }

  public async connect(): Promise<void> {
    const response = await fetch(this.baseUrl(), { method: 'GET', headers: this.headers() });
    const body = JSON.parse(await response.text()) as D1DatabaseEnvelope;
    if (!response.ok || !body.success) {
      throw new Error(this.errorMessage(body.errors));
    }
  }

  public async close(): Promise<void> {}

  private async query(
    sql: string,
    params: readonly string[] = [],
  ): Promise<readonly D1QueryItem[]> {
    const response = await fetch(`${this.baseUrl()}/query`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ sql, params }),
    });

    const body = JSON.parse(await response.text()) as D1Envelope;
    if (!response.ok || !body.success) {
      throw new Error(this.errorMessage(body.errors));
    }

    return body.result ?? [];
  }

  private itemRows(
    item: D1QueryItem | undefined,
  ): readonly Record<string, object | string | number | boolean | null>[] {
    return item?.results ?? [];
  }

  public async getMetadata(preferredSchema?: string): Promise<DatabaseMetadata> {
    void preferredSchema;

    const items = await this.query(`
      SELECT name, type
      FROM sqlite_master
      WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'
      ORDER BY name
    `);

    const tables: readonly TableInfo[] = this.itemRows(items[0]).map((row) => ({
      schema: 'main',
      name: String(row['name'] ?? ''),
      type: String(row['type'] ?? '') === 'view' ? 'view' : 'table',
    }));
    return {
      schemas: [{ name: 'main' }],
      tables,
      procedures: [],
      selectedSchema: 'main',
    };
  }

  private async columns(table: string): Promise<readonly string[]> {
    const items = await this.query(`PRAGMA table_info(${quoteSqliteIdentifier(table)})`);
    return this.itemRows(items[0])
      .map((row) => String(row['name'] ?? ''))
      .filter((value) => value.length > 0);
  }

  private async primaryKey(table: string): Promise<readonly string[]> {
    const items = await this.query(`PRAGMA table_info(${quoteSqliteIdentifier(table)})`);
    return this.itemRows(items[0])
      .filter((row) => Number(row['pk'] ?? 0) > 0)
      .sort((left, right) => Number(left['pk'] ?? 0) - Number(right['pk'] ?? 0))
      .map((row) => String(row['name'] ?? ''));
  }

  public async fetchTablePage(request: TablePageRequest): Promise<TablePage> {
    const columns = await this.columns(request.table);
    const qualified = quoteSqliteIdentifier(request.table);
    const search = request.search.trim();
    const where =
      search && columns.length > 0
        ? `WHERE ${columns.map((column) => `CAST(${quoteSqliteIdentifier(column)} AS TEXT) LIKE ?`).join(' OR ')}`
        : '';

    const searchParams = search ? columns.map(() => `%${search}%`) : [];
    const countItems = await this.query(
      `SELECT COUNT(*) AS count FROM ${qualified} ${where}`,
      searchParams,
    );

    const totalRows = Number(String(this.itemRows(countItems[0])[0]?.['count'] ?? '0'));
    const key = await this.primaryKey(request.table);
    const orderBy = key.length > 0 ? `ORDER BY ${key.map(quoteSqliteIdentifier).join(', ')}` : '';
    const offset = (request.page - 1) * request.pageSize;

    const pageItems = await this.query(
      `SELECT * FROM ${qualified} ${where} ${orderBy} LIMIT ${request.pageSize} OFFSET ${offset}`,
      searchParams,
    );

    const rawRows = this.itemRows(pageItems[0]);
    const rows: readonly DisplayRow[] = rawRows.map((row) => toDisplayRow(row));
    return {
      columns: columns.length > 0 ? columns : columnsFromRows(rows),
      rows,
      rowIdentities: key.length > 0 ? rawRows.map((row) => toRowIdentity(row, key)) : [],
      primaryKeyColumns: key,
      editable: key.length > 0,
      page: request.page,
      pageSize: request.pageSize,
      totalRows,
    };
  }

  public async updateCell(request: CellUpdateRequest): Promise<void> {
    const columns = await this.columns(request.table);
    if (!columns.includes(request.column)) {
      throw new Error('The selected column no longer exists. Refresh the table and try again.');
    }

    const primaryKey = await this.primaryKey(request.table);
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

    const qualified = quoteSqliteIdentifier(request.table);
    const where = primaryKey.map((column) => `${quoteSqliteIdentifier(column)} = ?`).join(' AND ');
    const items = await this.query(
      `UPDATE ${qualified} SET ${quoteSqliteIdentifier(request.column)} = ? WHERE ${where}`,
      [request.value, ...keyValues],
    );

    const changes = items[0]?.meta?.changes ?? 0;
    if (changes > 1) {
      throw new Error(`Cell update matched ${changes} rows. The change was rejected.`);
    }

    if (changes === 0) {
      const existing = await this.query(
        `SELECT 1 AS present FROM ${qualified} WHERE ${where} LIMIT 1`,
        keyValues,
      );

      if (this.itemRows(existing[0]).length === 0) {
        throw new Error('The row no longer exists. Refresh the table and try again.');
      }
    }
  }

  public async getProcedureDefinition(request: ProcedureDefinitionRequest): Promise<string> {
    void request;
    return '-- Cloudflare D1 uses SQLite semantics and does not provide stored procedures.';
  }

  public async execute(sql: string): Promise<QueryExecutionResult> {
    const started = performance.now();
    const items = await this.query(sql);

    const resultSets: QueryResultSet[] = items.map((item) => {
      const rows = this.itemRows(item).map((row) => toDisplayRow(row));
      return {
        columns: columnsFromRows(rows),
        rows,
        affectedRows: item.meta?.changes ?? null,
      };
    });
    return {
      resultSets,
      message:
        resultSets.length === 1 ? 'Query completed.' : `${resultSets.length} statements completed.`,
      durationMs: Math.round((performance.now() - started) * 100) / 100,
    };
  }
}
