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

import { randomUUID } from 'node:crypto';
import * as vscode from 'vscode';
import { validateDraft } from '../util/validate';
import type {
  ConnectionDraft,
  ConnectionDraftD1,
  ConnectionDraftFile,
  ConnectionDraftNetwork,
  RuntimeSecrets,
  SavedConnection,
  SshTunnelConfig,
} from '../types';

type SavedNetworkConnection = Extract<SavedConnection, { readonly hostOrSocket: string }>;

const CONNECTIONS_KEY = 'queryable.connections.v1';

function isNetworkDraft(draft: ConnectionDraft): draft is ConnectionDraftNetwork {
  return (
    draft.kind === 'postgres' ||
    draft.kind === 'cockroachdb' ||
    draft.kind === 'mysql' ||
    draft.kind === 'mariadb' ||
    draft.kind === 'mssql' ||
    draft.kind === 'oracle' ||
    draft.kind === 'db2'
  );
}

function dbPasswordKey(id: string): string {
  return `queryable.connection.${id}.databasePassword`;
}

function d1TokenKey(id: string): string {
  return `queryable.connection.${id}.d1Token`;
}

function sshPasswordKey(id: string): string {
  return `queryable.connection.${id}.sshPassword`;
}

function sshPassphraseKey(id: string): string {
  return `queryable.connection.${id}.sshKeyPassphrase`;
}

function baseFields(
  draft: ConnectionDraft,
  id: string,
  createdAt: string = new Date().toISOString(),
): { id: string; name: string; createdAt: string } {
  return {
    id,
    name: draft.name.trim(),
    createdAt,
  };
}

function sshFromDraft(draft: ConnectionDraftNetwork): SshTunnelConfig {
  return {
    enabled: draft.ssh.enabled,
    host: draft.ssh.host.trim(),
    port: draft.ssh.port,
    username: draft.ssh.username.trim(),
    authMode: draft.ssh.authMode,
    privateKeyPath: draft.ssh.privateKeyPath.trim(),
  };
}

function savedFromNetworkDraft(
  draft: ConnectionDraftNetwork,
  id: string,
  createdAt?: string,
): SavedConnection {
  const base = baseFields(draft, id, createdAt);
  const common = {
    ...base,
    hostOrSocket: draft.hostOrSocket.trim(),
    port: draft.port,
    username: draft.username.trim(),
    database: draft.database.trim(),
    passwordPolicy: draft.passwordPolicy,
    tlsMode: draft.tlsMode,
    keyPath: draft.keyPath.trim(),
    certPath: draft.certPath.trim(),
    caPath: draft.caPath.trim(),
    ssh: sshFromDraft(draft),
  };

  switch (draft.kind) {
    case 'postgres':
      return { ...common, kind: 'postgres' };

    case 'cockroachdb':
      return { ...common, kind: 'cockroachdb' };

    case 'mysql':
      return { ...common, kind: 'mysql' };

    case 'mariadb':
      return { ...common, kind: 'mariadb' };

    case 'mssql':
      return { ...common, kind: 'mssql' };

    case 'oracle':
      return { ...common, kind: 'oracle' };

    case 'db2':
      return { ...common, kind: 'db2' };
  }
}

function savedFromFileDraft(
  draft: ConnectionDraftFile,
  id: string,
  createdAt?: string,
): SavedConnection {
  const base = baseFields(draft, id, createdAt);
  if (draft.kind === 'sqlite3') {
    return { ...base, kind: 'sqlite3', filePath: draft.filePath.trim() };
  }

  return { ...base, kind: 'duckdb', filePath: draft.filePath.trim() };
}

function savedFromD1Draft(
  draft: ConnectionDraftD1,
  id: string,
  createdAt?: string,
): SavedConnection {
  return {
    ...baseFields(draft, id, createdAt),
    kind: 'd1',
    accountId: draft.accountId.trim(),
    databaseId: draft.databaseId.trim(),
  };
}

function savedFromDraft(draft: ConnectionDraft, id: string, createdAt?: string): SavedConnection {
  switch (draft.kind) {
    case 'postgres':
    case 'cockroachdb':
    case 'mysql':
    case 'mariadb':
    case 'mssql':
    case 'oracle':
    case 'db2':
      return savedFromNetworkDraft(draft, id, createdAt);

    case 'sqlite3':
    case 'duckdb':
      return savedFromFileDraft(draft, id, createdAt);

    case 'd1':
      return savedFromD1Draft(draft, id, createdAt);
  }
}

function isNetworkConnection(connection: SavedConnection): connection is SavedNetworkConnection {
  return (
    connection.kind === 'postgres' ||
    connection.kind === 'cockroachdb' ||
    connection.kind === 'mysql' ||
    connection.kind === 'mariadb' ||
    connection.kind === 'mssql' ||
    connection.kind === 'oracle' ||
    connection.kind === 'db2'
  );
}

export class ConnectionStore {
  public constructor(private readonly context: vscode.ExtensionContext) {}

  public list(): readonly SavedConnection[] {
    return this.context.globalState.get<readonly SavedConnection[]>(CONNECTIONS_KEY, []);
  }

  public get(id: string): SavedConnection | undefined {
    return this.list().find((connection) => connection.id === id);
  }

  public async save(draft: ConnectionDraft): Promise<SavedConnection> {
    validateDraft(draft);

    const id = randomUUID();
    const connection = savedFromDraft(draft, id);

    if (draft.kind === 'd1') {
      if (!draft.token.trim()) {
        throw new Error('Cloudflare API token is required.');
      }

      await this.context.secrets.store(d1TokenKey(id), draft.token);
    }

    if (
      draft.kind === 'postgres' ||
      draft.kind === 'cockroachdb' ||
      draft.kind === 'mysql' ||
      draft.kind === 'mariadb' ||
      draft.kind === 'mssql' ||
      draft.kind === 'oracle' ||
      draft.kind === 'db2'
    ) {
      if (draft.passwordPolicy === 'keyring' && draft.password.length > 0) {
        await this.context.secrets.store(dbPasswordKey(id), draft.password);
      }

      if (draft.ssh.password.length > 0) {
        await this.context.secrets.store(sshPasswordKey(id), draft.ssh.password);
      }

      if (draft.ssh.keyPassphrase.length > 0) {
        await this.context.secrets.store(sshPassphraseKey(id), draft.ssh.keyPassphrase);
      }
    }

    await this.context.globalState.update(CONNECTIONS_KEY, [...this.list(), connection]);
    return connection;
  }

  public async draftForSavedEdit(
    id: string,
    draft: ConnectionDraft,
    promptForAsk: boolean,
  ): Promise<ConnectionDraft> {
    const existing = this.get(id);
    if (!existing) {
      throw new Error('Saved connection no longer exists.');
    }

    if (existing.kind !== draft.kind) {
      throw new Error('The database type of a saved connection cannot be changed.');
    }

    if (draft.kind === 'd1') {
      const storedToken = (await this.context.secrets.get(d1TokenKey(id))) ?? '';
      const token = draft.token.length > 0 ? draft.token : storedToken;
      return { ...draft, token };
    }

    if (!isNetworkDraft(draft)) {
      return draft;
    }

    if (!isNetworkConnection(existing)) {
      throw new Error('Saved connection type does not match the edited configuration.');
    }

    let password = draft.password;
    if (draft.passwordPolicy === 'keyring' && password.length === 0) {
      password = (await this.context.secrets.get(dbPasswordKey(id))) ?? '';
    } else if (draft.passwordPolicy === 'ask' && password.length === 0 && promptForAsk) {
      const enteredPassword = await vscode.window.showInputBox({
        title: `Queryable: ${draft.name}`,
        prompt: 'Enter the database password for this connection.',
        password: true,
        ignoreFocusOut: true,
      });

      if (enteredPassword === undefined) {
        throw new Error('Password entry was canceled.');
      }

      password = enteredPassword;
    }

    let sshPassword = draft.ssh.password;
    let keyPassphrase = draft.ssh.keyPassphrase;

    if (draft.ssh.enabled && draft.ssh.authMode === 'password' && sshPassword.length === 0) {
      sshPassword = (await this.context.secrets.get(sshPasswordKey(id))) ?? '';
    }

    if (draft.ssh.enabled && draft.ssh.authMode === 'private-key' && keyPassphrase.length === 0) {
      keyPassphrase = (await this.context.secrets.get(sshPassphraseKey(id))) ?? '';
    }

    return {
      ...draft,
      password,
      ssh: {
        ...draft.ssh,
        password: sshPassword,
        keyPassphrase,
      },
    };
  }

  public async update(id: string, draft: ConnectionDraft): Promise<SavedConnection> {
    const existing = this.get(id);
    if (!existing) {
      throw new Error('Saved connection no longer exists.');
    }

    const effectiveDraft = await this.draftForSavedEdit(id, draft, false);
    validateDraft(effectiveDraft);

    const connection = savedFromDraft(draft, id, existing.createdAt);
    if (draft.kind === 'd1') {
      if (draft.token.length > 0) {
        await this.context.secrets.store(d1TokenKey(id), draft.token);
      }
    } else if (isNetworkDraft(draft)) {
      if (draft.passwordPolicy === 'keyring') {
        if (draft.password.length > 0) {
          await this.context.secrets.store(dbPasswordKey(id), draft.password);
        }
      } else {
        await this.context.secrets.delete(dbPasswordKey(id));
      }

      if (!draft.ssh.enabled) {
        await Promise.all([
          this.context.secrets.delete(sshPasswordKey(id)),
          this.context.secrets.delete(sshPassphraseKey(id)),
        ]);
      } else if (draft.ssh.authMode === 'password') {
        if (draft.ssh.password.length > 0) {
          await this.context.secrets.store(sshPasswordKey(id), draft.ssh.password);
        }

        await this.context.secrets.delete(sshPassphraseKey(id));
      } else {
        await this.context.secrets.delete(sshPasswordKey(id));
        if (draft.ssh.keyPassphrase.length > 0) {
          await this.context.secrets.store(sshPassphraseKey(id), draft.ssh.keyPassphrase);
        }
      }
    }

    const next = this.list().map((item) => (item.id === id ? connection : item));
    await this.context.globalState.update(CONNECTIONS_KEY, next);
    return connection;
  }

  public async delete(id: string): Promise<void> {
    const next = this.list().filter((connection) => connection.id !== id);

    await this.context.globalState.update(CONNECTIONS_KEY, next);
    await Promise.all([
      this.context.secrets.delete(dbPasswordKey(id)),
      this.context.secrets.delete(d1TokenKey(id)),
      this.context.secrets.delete(sshPasswordKey(id)),
      this.context.secrets.delete(sshPassphraseKey(id)),
    ]);
  }

  public async runtimeSecretsForSaved(connection: SavedConnection): Promise<RuntimeSecrets> {
    let databasePassword = '';
    let d1Token = '';
    let sshPassword = '';
    let sshKeyPassphrase = '';

    if (connection.kind === 'd1') {
      d1Token = (await this.context.secrets.get(d1TokenKey(connection.id))) ?? '';

      if (!d1Token) {
        throw new Error('The saved Cloudflare D1 token is missing from SecretStorage.');
      }
    }

    if (
      connection.kind === 'postgres' ||
      connection.kind === 'cockroachdb' ||
      connection.kind === 'mysql' ||
      connection.kind === 'mariadb' ||
      connection.kind === 'mssql' ||
      connection.kind === 'oracle' ||
      connection.kind === 'db2'
    ) {
      if (connection.passwordPolicy === 'keyring') {
        databasePassword = (await this.context.secrets.get(dbPasswordKey(connection.id))) ?? '';
      } else if (connection.passwordPolicy === 'ask') {
        const enteredPassword = await vscode.window.showInputBox({
          title: `Queryable: ${connection.name}`,
          prompt: 'Enter the database password for this connection.',
          password: true,
          ignoreFocusOut: true,
        });

        if (enteredPassword === undefined) {
          throw new Error('Password entry was canceled.');
        }

        databasePassword = enteredPassword;
      }

      sshPassword = (await this.context.secrets.get(sshPasswordKey(connection.id))) ?? '';
      sshKeyPassphrase = (await this.context.secrets.get(sshPassphraseKey(connection.id))) ?? '';
    }

    return { databasePassword, d1Token, sshPassword, sshKeyPassphrase };
  }

  public runtimeSecretsForDraft(draft: ConnectionDraft): RuntimeSecrets {
    if (draft.kind === 'd1') {
      return { databasePassword: '', d1Token: draft.token, sshPassword: '', sshKeyPassphrase: '' };
    }

    if (isNetworkDraft(draft)) {
      return {
        databasePassword: draft.passwordPolicy === 'none' ? '' : draft.password,
        d1Token: '',
        sshPassword: draft.ssh.password,
        sshKeyPassphrase: draft.ssh.keyPassphrase,
      };
    }

    return { databasePassword: '', d1Token: '', sshPassword: '', sshKeyPassphrase: '' };
  }

  public transientFromDraft(draft: ConnectionDraft): SavedConnection {
    validateDraft(draft);
    return savedFromDraft(draft, `transient-${randomUUID()}`);
  }
}
