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

import { dirname } from 'node:path';
import * as oracleDb from 'oracledb';
import type {
  CellUpdateRequest,
  DatabaseMetadata,
  DisplayRow,
  OracleConnectionConfig,
  ProcedureDefinitionRequest,
  ProcedureInfo,
  QueryExecutionResult,
  QueryResultSet,
  RuntimeSecrets,
  SchemaInfo,
  TableInfo,
  TablePage,
  TablePageRequest,
} from '../types';
import {
  columnsFromRows,
  errorText,
  positiveInteger,
  toDisplayRow,
  toRowIdentity,
} from '../util/format';
import { quoteOracleIdentifier } from '../util/sql';
import type { DatabaseAdapter } from './base';

interface Endpoint {
  readonly host: string;
  readonly port: number;
}

type OracleBindValue = string | number | bigint | boolean | Date | Buffer | null;

interface OracleBinds {
  readonly [name: string]: OracleBindValue;
}

interface OracleMetaData {
  readonly name?: string;
}

interface OracleExecuteOptions {
  readonly outFormat?: number;
  readonly autoCommit?: boolean;
}

interface OracleExecuteResult {
  readonly rows?: readonly object[];
  readonly metaData?: readonly OracleMetaData[];
  readonly rowsAffected?: number;
}

interface OracleConnection {
  execute(
    sql: string,
    binds?: OracleBinds,
    options?: OracleExecuteOptions,
  ): Promise<OracleExecuteResult>;
  close(): Promise<void>;
}

interface OracleConnectionAttributes {
  readonly user: string;
  readonly password: string;
  readonly connectString: string;
  readonly walletLocation?: string;
  readonly sslServerDNMatch?: boolean;
}

interface OracleColumn {
  readonly name: string;
  readonly dataType: string;
}

function canFallbackFromTls(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    (lower.includes('tcps') && lower.includes('not supported')) ||
    (lower.includes('ssl') && lower.includes('not supported')) ||
    (lower.includes('tls') && lower.includes('not supported'))
  );
}

function stripSqlTerminator(sql: string): string {
  const trimmed = sql.trim();
  if (/^(begin|declare)\b/i.test(trimmed)) {
    return trimmed;
  }

  return trimmed.endsWith(';') ? trimmed.slice(0, -1).trimEnd() : trimmed;
}

function searchExpression(column: OracleColumn): string | undefined {
  const quoted = quoteOracleIdentifier(column.name);
  const type = column.dataType.toUpperCase();

  if (type === 'CLOB' || type === 'NCLOB') {
    return `DBMS_LOB.SUBSTR(${quoted}, 4000, 1)`;
  }

  if (type === 'RAW') {
    return `RAWTOHEX(${quoted})`;
  }

  if (type === 'BLOB' || type === 'BFILE' || type === 'LONG RAW') {
    return undefined;
  }

  if (type.includes('XMLTYPE') || type.includes('SDO_GEOMETRY')) {
    return undefined;
  }

  return `TO_CHAR(${quoted})`;
}

function resultSet(result: OracleExecuteResult): QueryResultSet {
  const sourceRows = result.rows ?? [];
  const rows: readonly DisplayRow[] = sourceRows.map((row) => toDisplayRow(row));

  const metadataColumns = (result.metaData ?? [])
    .map((entry) => entry.name ?? '')
    .filter((name) => name.length > 0);
  return {
    columns: metadataColumns.length > 0 ? metadataColumns : columnsFromRows(rows),
    rows,
    affectedRows: result.rowsAffected ?? null,
  };
}

export class OracleAdapter implements DatabaseAdapter {
  private connection: OracleConnection | undefined;

  public constructor(
    private readonly config: OracleConnectionConfig,
    private readonly secrets: RuntimeSecrets,
    private readonly endpoint: Endpoint,
  ) {}

  private attributes(useTls: boolean): OracleConnectionAttributes {
    const protocol = useTls ? 'tcps://' : '';
    const connectString = `${protocol}${this.endpoint.host}:${this.endpoint.port}/${this.config.database}`;

    const walletLocation = this.config.caPath ? dirname(this.config.caPath) : undefined;
    return {
      user: this.config.username,
      password: this.secrets.databasePassword,
      connectString,
      ...(walletLocation ? { walletLocation } : {}),
      ...(useTls ? { sslServerDNMatch: this.config.tlsMode === 'verify-identity' } : {}),
    };
  }

  public async connect(): Promise<void> {
    if (this.config.ssh.enabled && this.config.tlsMode === 'verify-identity') {
      throw new Error(
        'Oracle Verify Identity cannot be combined with the built-in SSH tunnel because the TLS endpoint is local. Use Verify CA or connect without the Queryable tunnel.',
      );
    }

    if (this.config.tlsMode === 'disabled') {
      this.connection = await oracleDb.getConnection(this.attributes(false));
      return;
    }

    try {
      this.connection = await oracleDb.getConnection(this.attributes(true));
    } catch (error) {
      if (this.config.tlsMode !== 'preferred' || !canFallbackFromTls(errorText(error))) {
        throw error;
      }

      this.connection = await oracleDb.getConnection(this.attributes(false));
    }
  }

  public async close(): Promise<void> {
    const connection = this.connection;
    this.connection = undefined;

    if (connection) {
      await connection.close();
    }
  }

  private requireConnection(): OracleConnection {
    if (!this.connection) {
      throw new Error('Database connection is not open.');
    }

    return this.connection;
  }

  private async rows(sql: string, binds: OracleBinds = {}): Promise<readonly object[]> {
    const result = await this.requireConnection().execute(sql, binds, {
      outFormat: oracleDb.OUT_FORMAT_OBJECT,
    });
    return result.rows ?? [];
  }

  public async getMetadata(preferredSchema?: string): Promise<DatabaseMetadata> {
    const schemaRows = await this.rows(`
      SELECT DISTINCT owner AS name
      FROM all_objects
      WHERE object_type IN ('TABLE', 'VIEW', 'PROCEDURE', 'FUNCTION', 'PACKAGE')
        AND owner NOT IN ('SYS', 'SYSTEM', 'XDB', 'MDSYS', 'CTXSYS', 'ORDSYS', 'OUTLN', 'DBSNMP', 'AUDSYS')
      ORDER BY owner
    `);

    const schemas: readonly SchemaInfo[] = schemaRows
      .map((row) => ({
        name: String(
          (row as Record<string, object | string | number | boolean | bigint | null>)['NAME'] ?? '',
        ),
      }))
      .filter((schema) => schema.name.length > 0);

    const tableRows = await this.rows(`
      SELECT owner AS schema_name, object_name AS name, object_type
      FROM all_objects
      WHERE object_type IN ('TABLE', 'VIEW')
        AND owner NOT IN ('SYS', 'SYSTEM', 'XDB', 'MDSYS', 'CTXSYS', 'ORDSYS', 'OUTLN', 'DBSNMP', 'AUDSYS')
      ORDER BY owner, object_name
    `);
    const tables: readonly TableInfo[] = tableRows.map((row) => {
      const source = row as Record<string, object | string | number | boolean | bigint | null>;
      return {
        schema: String(source['SCHEMA_NAME'] ?? ''),
        name: String(source['NAME'] ?? ''),
        type: String(source['OBJECT_TYPE'] ?? '') === 'VIEW' ? 'view' : 'table',
      };
    });

    const routineRows = await this.rows(`
      SELECT DISTINCT
        p.owner AS schema_name,
        CASE
          WHEN p.procedure_name IS NULL THEN p.object_name
          ELSE p.object_name || '.' || p.procedure_name
        END AS name,
        CASE
          WHEN p.object_type = 'FUNCTION' THEN 'FUNCTION'
          WHEN p.object_type = 'PROCEDURE' THEN 'PROCEDURE'
          WHEN EXISTS (
            SELECT 1
            FROM all_arguments a
            WHERE a.owner = p.owner
              AND a.package_name = p.object_name
              AND a.object_name = p.procedure_name
              AND a.position = 0
              AND a.data_level = 0
          ) THEN 'FUNCTION'
          ELSE 'PROCEDURE'
        END AS routine_type
      FROM all_procedures p
      WHERE (
          (p.object_type IN ('PROCEDURE', 'FUNCTION') AND p.procedure_name IS NULL)
          OR (p.object_type = 'PACKAGE' AND p.procedure_name IS NOT NULL)
        )
        AND p.owner NOT IN ('SYS', 'SYSTEM', 'XDB', 'MDSYS', 'CTXSYS', 'ORDSYS', 'OUTLN', 'DBSNMP', 'AUDSYS')
      ORDER BY schema_name, name, routine_type
    `);

    const procedures: readonly ProcedureInfo[] = routineRows.map((row) => {
      const source = row as Record<string, object | string | number | boolean | bigint | null>;
      return {
        schema: String(source['SCHEMA_NAME'] ?? ''),
        name: String(source['NAME'] ?? ''),
        type: String(source['ROUTINE_TYPE'] ?? '') === 'PROCEDURE' ? 'procedure' : 'function',
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

  private async columns(schema: string, table: string): Promise<readonly OracleColumn[]> {
    const rows = await this.rows(
      `
      SELECT column_name, data_type
      FROM all_tab_columns
      WHERE owner = :owner AND table_name = :table_name
      ORDER BY column_id
    `,
      { owner: schema, table_name: table },
    );
    return rows
      .map((row) => {
        const source = row as Record<string, object | string | number | boolean | bigint | null>;
        return {
          name: String(source['COLUMN_NAME'] ?? ''),
          dataType: String(source['DATA_TYPE'] ?? ''),
        };
      })
      .filter((column) => column.name.length > 0);
  }

  private async primaryKey(schema: string, table: string): Promise<readonly string[]> {
    const rows = await this.rows(
      `
      SELECT cols.column_name
      FROM all_constraints cons
      JOIN all_cons_columns cols
        ON cols.owner = cons.owner
       AND cols.constraint_name = cons.constraint_name
       AND cols.table_name = cons.table_name
      WHERE cons.constraint_type = 'P'
        AND cons.owner = :owner
        AND cons.table_name = :table_name
      ORDER BY cols.position
    `,
      { owner: schema, table_name: table },
    );
    return rows
      .map((row) =>
        String(
          (row as Record<string, object | string | number | boolean | bigint | null>)[
            'COLUMN_NAME'
          ] ?? '',
        ),
      )
      .filter((name) => name.length > 0);
  }

  public async fetchTablePage(request: TablePageRequest): Promise<TablePage> {
    const page = positiveInteger(request.page, 1, 2_147_483_647);
    const pageSize = positiveInteger(request.pageSize, 50, 1000);
    const columnInfo = await this.columns(request.schema, request.table);
    const qualified = `${quoteOracleIdentifier(request.schema)}.${quoteOracleIdentifier(request.table)}`;
    const search = request.search.trim();

    const searchable = columnInfo
      .map(searchExpression)
      .filter((expression): expression is string => expression !== undefined);
    const where =
      search && searchable.length > 0
        ? `WHERE ${searchable.map((expression) => `${expression} LIKE :search_value`).join(' OR ')}`
        : '';
    const searchBinds: OracleBinds =
      search && searchable.length > 0 ? { search_value: `%${search}%` } : {};
    const countRows = await this.rows(
      `SELECT COUNT(*) AS row_count FROM ${qualified} ${where}`,
      searchBinds,
    );

    const totalRows = Number(
      String(
        (
          countRows[0] as
            Record<string, object | string | number | boolean | bigint | null> | undefined
        )?.['ROW_COUNT'] ?? '0',
      ),
    );

    const primaryKey = await this.primaryKey(request.schema, request.table);
    const orderColumns =
      primaryKey.length > 0 ? primaryKey : columnInfo.slice(0, 1).map((column) => column.name);
    const orderBy =
      orderColumns.length > 0
        ? `ORDER BY ${orderColumns.map(quoteOracleIdentifier).join(', ')}`
        : '';
    const offset = (page - 1) * pageSize;

    const pageResult = await this.requireConnection().execute(
      `SELECT * FROM ${qualified} ${where} ${orderBy} OFFSET :row_offset ROWS FETCH NEXT :row_limit ROWS ONLY`,
      { ...searchBinds, row_offset: offset, row_limit: pageSize },
      { outFormat: oracleDb.OUT_FORMAT_OBJECT },
    );

    const sourceRows = pageResult.rows ?? [];
    const visibleColumns = (pageResult.metaData ?? [])
      .map((entry) => entry.name ?? '')
      .filter((name) => name.length > 0);
    return {
      columns: visibleColumns.length > 0 ? visibleColumns : columnInfo.map((column) => column.name),
      rows: sourceRows.map((row) => toDisplayRow(row)),
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
    const names = columnInfo.map((column) => column.name);

    if (!names.includes(request.column)) {
      throw new Error('The selected column no longer exists. Refresh the table and try again.');
    }

    const primaryKey = await this.primaryKey(request.schema, request.table);
    if (primaryKey.length === 0) {
      throw new Error('This table cannot be edited because it has no primary key.');
    }

    const binds: Record<string, OracleBindValue> = { new_value: request.value };
    const whereParts: string[] = [];

    primaryKey.forEach((column, index) => {
      const value = request.rowIdentity[column];
      if (value === undefined) {
        throw new Error('The row identity is incomplete. Refresh the table and try again.');
      }

      const bindName = `key_${index}`;
      binds[bindName] = value;

      whereParts.push(`${quoteOracleIdentifier(column)} = :${bindName}`);
    });

    const qualified = `${quoteOracleIdentifier(request.schema)}.${quoteOracleIdentifier(request.table)}`;
    const result = await this.requireConnection().execute(
      `UPDATE ${qualified} SET ${quoteOracleIdentifier(request.column)} = :new_value WHERE ${whereParts.join(' AND ')}`,
      binds,
      { autoCommit: true },
    );

    const affected = result.rowsAffected ?? 0;
    if (affected > 1) {
      throw new Error(`Cell update matched ${affected} rows. The change was rejected.`);
    }

    if (affected === 0) {
      throw new Error(
        'The row no longer exists or the value could not be changed. Refresh the table and try again.',
      );
    }
  }

  public async getProcedureDefinition(request: ProcedureDefinitionRequest): Promise<string> {
    if (request.type === 'macro') {
      return '-- Oracle does not use DuckDB-style macros.';
    }

    const separator = request.name.indexOf('.');
    if (separator > 0 && separator < request.name.length - 1) {
      const packageName = request.name.slice(0, separator);
      const memberName = request.name.slice(separator + 1);
      const sourceRows = await this.rows(
        `
        SELECT type, line, text
        FROM all_source
        WHERE owner = :owner
          AND name = :package_name
          AND type IN ('PACKAGE', 'PACKAGE BODY')
        ORDER BY CASE type WHEN 'PACKAGE' THEN 0 ELSE 1 END, line
      `,
        { owner: request.schema, package_name: packageName },
      );

      if (sourceRows.length === 0) {
        return '-- Definition is not available to this database user.';
      }

      const specification: string[] = [];
      const body: string[] = [];

      for (const row of sourceRows) {
        const source = row as Record<string, object | string | number | boolean | bigint | null>;
        const text = String(source['TEXT'] ?? '');

        if (String(source['TYPE'] ?? '') === 'PACKAGE BODY') {
          body.push(text);
        } else {
          specification.push(text);
        }
      }

      const sections: string[] = [`-- Package member: ${packageName}.${memberName}`];
      if (specification.length > 0) {
        sections.push(`CREATE OR REPLACE ${specification.join('')}`);
      }

      if (body.length > 0) {
        sections.push(`CREATE OR REPLACE ${body.join('')}`);
      }

      return sections.join('\n\n');
    }

    const sourceRows = await this.rows(
      `
      SELECT text
      FROM all_source
      WHERE owner = :owner
        AND name = :object_name
        AND type = :object_type
      ORDER BY line
    `,
      {
        owner: request.schema,
        object_name: request.name,
        object_type: request.type === 'procedure' ? 'PROCEDURE' : 'FUNCTION',
      },
    );

    const body = sourceRows
      .map((row) =>
        String(
          (row as Record<string, object | string | number | boolean | bigint | null>)['TEXT'] ?? '',
        ),
      )
      .join('');
    return body.trim()
      ? `CREATE OR REPLACE ${body}`
      : '-- Definition is not available to this database user.';
  }

  public async execute(sql: string): Promise<QueryExecutionResult> {
    const statement = stripSqlTerminator(sql);
    if (!statement) {
      throw new Error('Enter a SQL or PL/SQL statement to run.');
    }

    const started = performance.now();
    const result = await this.requireConnection().execute(
      statement,
      {},
      {
        outFormat: oracleDb.OUT_FORMAT_OBJECT,
        autoCommit: true,
      },
    );
    return {
      resultSets: [resultSet(result)],
      message: 'Query completed.',
      durationMs: Math.round((performance.now() - started) * 100) / 100,
    };
  }
}
