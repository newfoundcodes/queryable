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

import * as vscode from 'vscode';
import { createDatabaseSession } from '../adapters/factory';
import { ConnectionStore } from '../storage/connectionStore';
import { errorText } from '../util/format';
import { nonce, readWebviewTemplate } from './html';
import type { DatabaseAdapter } from '../adapters/base';
import type { ConnectionDraft, HomeHostMessage, HomeMessage, SavedConnection } from '../types';
import type { WorkbenchOpenOptions } from './workbench';

export type OpenConnectionHandler = (
  connection: SavedConnection,
  session: DatabaseAdapter,
  options?: WorkbenchOpenOptions,
) => Promise<void>;

export class HomeViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'queryable.home';
  private view: vscode.WebviewView | undefined;

  public constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly store: ConnectionStore,
    private readonly openConnection: OpenConnectionHandler,
  ) {}

  public resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;

    webviewView.webview.options = { enableScripts: true, localResourceRoots: [] };
    webviewView.webview.html = this.html(webviewView.webview);
    webviewView.webview.onDidReceiveMessage(
      async (message: HomeMessage) => this.handle(message),
      undefined,
      this.context.subscriptions,
    );

    void this.sendConnections();
  }

  public async reveal(): Promise<void> {
    await vscode.commands.executeCommand('workbench.view.extension.queryable');
  }

  private async post(message: HomeHostMessage): Promise<void> {
    await this.view?.webview.postMessage(message);
  }

  private async sendConnections(): Promise<void> {
    await this.post({ command: 'connections', connections: this.store.list() });
  }

  private async withDraftSession(
    draft: ConnectionDraft,
    open: boolean,
    existingId?: string,
  ): Promise<void> {
    const connection = this.store.transientFromDraft(draft);
    const secrets = this.store.runtimeSecretsForDraft(draft);
    const session = await createDatabaseSession(connection, secrets);

    try {
      await session.connect();

      if (open) {
        const options: WorkbenchOpenOptions = {
          saveOnClose: async () => {
            if (existingId) {
              await this.store.update(existingId, draft);
            } else {
              await this.store.save(draft);
            }

            await this.sendConnections();
          },
          savePromptDetail: existingId
            ? 'This workbench was opened from edited connection settings that have not been saved. Save those changes, or continue closing without saving them.'
            : 'This connection has not been saved yet. Save it to Saved Connections, or continue closing without saving it.',
        };

        await this.openConnection(connection, session, options);
      } else {
        await session.close();
        await this.post({
          command: 'status',
          level: 'success',
          message: 'Connection test succeeded.',
        });
      }
    } catch (error) {
      await session.close().catch(() => undefined);
      throw error;
    }
  }

  private async withEditedDraftSession(
    id: string,
    draft: ConnectionDraft,
    open: boolean,
  ): Promise<void> {
    const effectiveDraft = await this.store.draftForSavedEdit(id, draft, true);
    await this.withDraftSession(effectiveDraft, open, id);
  }

  private async connectSaved(id: string): Promise<void> {
    const connection = this.store.get(id);
    if (!connection) {
      throw new Error('Saved connection no longer exists.');
    }

    await this.post({ command: 'connectionLoading', id, value: true });

    try {
      const secrets = await this.store.runtimeSecretsForSaved(connection);
      const session = await createDatabaseSession(connection, secrets);

      try {
        await session.connect();
        await this.openConnection(connection, session);
      } catch (error) {
        await session.close().catch(() => undefined);
        throw error;
      }
    } finally {
      await this.post({ command: 'connectionLoading', id, value: false });
    }
  }

  private async chooseFile(
    target: Extract<HomeMessage, { readonly command: 'chooseFile' }>['target'],
  ): Promise<void> {
    const selection = await vscode.window.showOpenDialog({
      canSelectMany: false,
      canSelectFiles: true,
      canSelectFolders: false,
      openLabel: 'Select',
      title: target === 'database' ? 'Select database file' : 'Select certificate or key file',
    });

    const file = selection?.[0];
    if (file) {
      await this.post({ command: 'chosenFile', target, filePath: file.fsPath });
    }
  }

  private async handle(message: HomeMessage): Promise<void> {
    try {
      switch (message.command) {
        case 'save': {
          await this.store.save(message.draft);
          await this.sendConnections();

          await this.post({ command: 'status', level: 'success', message: 'Connection saved.' });
          return;
        }

        case 'test':
          await this.withDraftSession(message.draft, false);
          return;

        case 'connectDraft':
          await this.withDraftSession(message.draft, true);
          return;

        case 'updateSaved':
          await this.store.update(message.id, message.draft);
          await this.sendConnections();
          await this.post({ command: 'status', level: 'success', message: 'Connection updated.' });
          return;

        case 'testEdited':
          await this.withEditedDraftSession(message.id, message.draft, false);
          return;

        case 'connectEdited':
          await this.withEditedDraftSession(message.id, message.draft, true);
          return;

        case 'connectSaved':
          await this.connectSaved(message.id);
          return;

        case 'deleteSaved': {
          const connection = this.store.get(message.id);
          if (!connection) {
            return;
          }

          const answer = await vscode.window.showWarningMessage(
            `Delete saved connection “${connection.name}”?`,
            { modal: true },
            'Delete',
          );

          if (answer === 'Delete') {
            await this.store.delete(message.id);
            await this.sendConnections();
          }

          return;
        }

        case 'chooseFile':
          await this.chooseFile(message.target);
          return;
      }
    } catch (error) {
      await this.post({ command: 'status', level: 'error', message: errorText(error) });
    }
  }

  private html(_: vscode.Webview): string {
    const token = nonce();
    return readWebviewTemplate(this.context.extensionPath, 'home.html').replaceAll(
      '{{NONCE}}',
      token,
    );
  }
}
