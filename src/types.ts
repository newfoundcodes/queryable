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

export type DatabaseKind =
  | 'postgres'
  | 'sqlite3'
  | 'mssql'
  | 'mysql'
  | 'duckdb'
  | 'd1'
  | 'mariadb'
  | 'cockroachdb'
  | 'oracle'
  | 'db2';

export type PasswordPolicy = 'keyring' | 'ask' | 'none';
export type TlsMode = 'preferred' | 'disabled' | 'required' | 'verify-ca' | 'verify-identity';
export type SshAuthMode = 'password' | 'private-key';

export interface SshTunnelConfig {
  readonly enabled: boolean;
  readonly host: string;
  readonly port: number;
  readonly username: string;
  readonly authMode: SshAuthMode;
  readonly privateKeyPath: string;
}

export interface BaseConnectionConfig {
  readonly id: string;
  readonly name: string;
  readonly kind: DatabaseKind;
  readonly createdAt: string;
}

export interface NetworkConnectionConfig extends BaseConnectionConfig {
  readonly hostOrSocket: string;
  readonly port: number;
  readonly username: string;
  readonly database: string;
  readonly passwordPolicy: PasswordPolicy;
  readonly tlsMode: TlsMode;
  readonly keyPath: string;
  readonly certPath: string;
  readonly caPath: string;
  readonly ssh: SshTunnelConfig;
}

export interface PostgresConnectionConfig extends NetworkConnectionConfig {
  readonly kind: 'postgres';
}

export interface CockroachConnectionConfig extends NetworkConnectionConfig {
  readonly kind: 'cockroachdb';
}

export interface MySqlConnectionConfig extends NetworkConnectionConfig {
  readonly kind: 'mysql';
}

export interface MariaDbConnectionConfig extends NetworkConnectionConfig {
  readonly kind: 'mariadb';
}

export interface MsSqlConnectionConfig extends NetworkConnectionConfig {
  readonly kind: 'mssql';
}

export interface OracleConnectionConfig extends NetworkConnectionConfig {
  readonly kind: 'oracle';
}

export interface Db2ConnectionConfig extends NetworkConnectionConfig {
  readonly kind: 'db2';
}

export interface FileConnectionConfig extends BaseConnectionConfig {
  readonly filePath: string;
}

export interface SqliteConnectionConfig extends FileConnectionConfig {
  readonly kind: 'sqlite3';
}

export interface DuckDbConnectionConfig extends FileConnectionConfig {
  readonly kind: 'duckdb';
}

export interface D1ConnectionConfig extends BaseConnectionConfig {
  readonly kind: 'd1';
  readonly accountId: string;
  readonly databaseId: string;
}

export type SavedConnection =
  | PostgresConnectionConfig
  | CockroachConnectionConfig
  | MySqlConnectionConfig
  | MariaDbConnectionConfig
  | MsSqlConnectionConfig
  | OracleConnectionConfig
  | Db2ConnectionConfig
  | SqliteConnectionConfig
  | DuckDbConnectionConfig
  | D1ConnectionConfig;

export interface RuntimeSecrets {
  readonly databasePassword: string;
  readonly d1Token: string;
  readonly sshPassword: string;
  readonly sshKeyPassphrase: string;
}

export interface SchemaInfo {
  readonly name: string;
}

export interface TableInfo {
  readonly schema: string;
  readonly name: string;
  readonly type: 'table' | 'view';
}

export interface ProcedureInfo {
  readonly schema: string;
  readonly name: string;
  readonly type: 'procedure' | 'function' | 'macro';
}

export interface DisplayRow {
  readonly [column: string]: string;
}

export interface RowIdentity {
  readonly [column: string]: string;
}

export interface QueryResultSet {
  readonly columns: readonly string[];
  readonly rows: readonly DisplayRow[];
  readonly affectedRows: number | null;
}

export type ExportFormat = 'json' | 'csv' | 'html';

export interface ExportTableData {
  readonly title: string;
  readonly columns: readonly string[];
  readonly rows: readonly DisplayRow[];
}

export interface QueryExecutionResult {
  readonly resultSets: readonly QueryResultSet[];
  readonly message: string;
  readonly durationMs: number;
}

export interface TablePage {
  readonly columns: readonly string[];
  readonly rows: readonly DisplayRow[];
  readonly rowIdentities: readonly RowIdentity[];
  readonly primaryKeyColumns: readonly string[];
  readonly editable: boolean;
  readonly page: number;
  readonly pageSize: number;
  readonly totalRows: number;
}

export interface CellUpdateRequest {
  readonly schema: string;
  readonly table: string;
  readonly column: string;
  readonly rowIdentity: RowIdentity;
  readonly value: string;
}

export interface DatabaseMetadata {
  readonly schemas: readonly SchemaInfo[];
  readonly tables: readonly TableInfo[];
  readonly procedures: readonly ProcedureInfo[];
  readonly selectedSchema: string;
}

export interface TablePageRequest {
  readonly schema: string;
  readonly table: string;
  readonly page: number;
  readonly pageSize: number;
  readonly search: string;
}

export interface ProcedureDefinitionRequest {
  readonly schema: string;
  readonly name: string;
  readonly type: ProcedureInfo['type'];
}

export interface ConnectionDraftNetwork {
  readonly name: string;
  readonly kind: 'postgres' | 'cockroachdb' | 'mysql' | 'mariadb' | 'mssql' | 'oracle' | 'db2';
  readonly hostOrSocket: string;
  readonly port: number;
  readonly username: string;
  readonly password: string;
  readonly database: string;
  readonly passwordPolicy: PasswordPolicy;
  readonly tlsMode: TlsMode;
  readonly keyPath: string;
  readonly certPath: string;
  readonly caPath: string;
  readonly ssh: SshTunnelDraft;
}

export interface SshTunnelDraft extends SshTunnelConfig {
  readonly password: string;
  readonly keyPassphrase: string;
}

export interface ConnectionDraftFile {
  readonly name: string;
  readonly kind: 'sqlite3' | 'duckdb';
  readonly filePath: string;
}

export interface ConnectionDraftD1 {
  readonly name: string;
  readonly kind: 'd1';
  readonly accountId: string;
  readonly databaseId: string;
  readonly token: string;
}

export type ConnectionDraft = ConnectionDraftNetwork | ConnectionDraftFile | ConnectionDraftD1;

export type HomeMessage =
  | { readonly command: 'save'; readonly draft: ConnectionDraft }
  | { readonly command: 'test'; readonly draft: ConnectionDraft }
  | { readonly command: 'connectDraft'; readonly draft: ConnectionDraft }
  | { readonly command: 'updateSaved'; readonly id: string; readonly draft: ConnectionDraft }
  | { readonly command: 'testEdited'; readonly id: string; readonly draft: ConnectionDraft }
  | { readonly command: 'connectEdited'; readonly id: string; readonly draft: ConnectionDraft }
  | { readonly command: 'connectSaved'; readonly id: string }
  | { readonly command: 'deleteSaved'; readonly id: string }
  | {
      readonly command: 'chooseFile';
      readonly target: 'database' | 'key' | 'cert' | 'ca' | 'ssh-key';
    };

export type HomeHostMessage =
  | { readonly command: 'connections'; readonly connections: readonly SavedConnection[] }
  | { readonly command: 'connectionLoading'; readonly id: string; readonly value: boolean }
  | {
      readonly command: 'status';
      readonly level: 'info' | 'error' | 'success';
      readonly message: string;
    }
  | {
      readonly command: 'chosenFile';
      readonly target: 'database' | 'key' | 'cert' | 'ca' | 'ssh-key';
      readonly filePath: string;
    };

export type WorkbenchMessage =
  | { readonly command: 'ready' }
  | { readonly command: 'refreshMetadata'; readonly schema: string }
  | { readonly command: 'openTable'; readonly schema: string; readonly table: string }
  | {
      readonly command: 'openProcedure';
      readonly schema: string;
      readonly name: string;
      readonly type: ProcedureInfo['type'];
    }
  | { readonly command: 'loadTablePage'; readonly request: TablePageRequest }
  | {
      readonly command: 'updateCell';
      readonly editId: string;
      readonly request: CellUpdateRequest;
      readonly pageRequest: TablePageRequest;
    }
  | {
      readonly command: 'executeQuery';
      readonly sql: string;
      readonly openMode: 'reuse-active' | 'new-tab';
      readonly targetResultId: string | null;
    }
  | {
      readonly command: 'exportData';
      readonly format: ExportFormat;
      readonly target: ExportTableData;
    }
  | { readonly command: 'closeSession' };

export type WorkbenchHostMessage =
  | { readonly command: 'metadata'; readonly metadata: DatabaseMetadata }
  | {
      readonly command: 'tablePage';
      readonly key: string;
      readonly request: TablePageRequest;
      readonly page: TablePage;
    }
  | {
      readonly command: 'procedureDefinition';
      readonly key: string;
      readonly request: ProcedureDefinitionRequest;
      readonly definition: string;
    }
  | { readonly command: 'cellSaved'; readonly editId: string }
  | {
      readonly command: 'queryResult';
      readonly id: string;
      readonly title: string;
      readonly result: QueryExecutionResult;
    }
  | { readonly command: 'exportRequested'; readonly format: ExportFormat }
  | { readonly command: 'busy'; readonly value: boolean; readonly label: string }
  | { readonly command: 'error'; readonly message: string };
