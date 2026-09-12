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
import { randomUUID } from 'node:crypto';
import { buildTableExport, safeExportFileName } from '../export/tableExport';
import type { DatabaseAdapter } from '../adapters/base';
import type {
  ExportFormat,
  ExportTableData,
  SavedConnection,
  TablePageRequest,
  WorkbenchHostMessage,
  WorkbenchMessage,
} from '../types';
import { errorText, positiveInteger } from '../util/format';
import { procedureTabKey, tableTabKey } from '../util/sql';
import { nonce, readWebviewTemplate } from './html';

export interface WorkbenchOpenOptions {
  readonly saveOnClose?: () => Promise<void>;
  readonly savePromptDetail?: string;
}

export class WorkbenchManager {
  private readonly panels = new Set<vscode.WebviewPanel>();
  private activePanel: vscode.WebviewPanel | undefined;

  public constructor(private readonly context: vscode.ExtensionContext) {}

  public async exportActive(format: ExportFormat): Promise<void> {
    const panel = this.activePanel;
    if (!panel) {
      await vscode.window.showInformationMessage(
        'Open a Queryable table or query result before exporting.',
      );
      return;
    }

    await panel.webview.postMessage({
      command: 'exportRequested',
      format,
    } satisfies WorkbenchHostMessage);
  }

  private async writeExport(format: ExportFormat, target: ExportTableData): Promise<void> {
    const built = buildTableExport(format, target);
    const label = format.toUpperCase();

    const dialogOptions: vscode.SaveDialogOptions = {
      title: `Export ${target.title} as ${label}`,
      saveLabel: 'Export',
      filters: { [label]: [built.extension] },
    };

    const folder = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (folder) {
      dialogOptions.defaultUri = vscode.Uri.joinPath(
        folder,
        `${safeExportFileName(target.title)}.${built.extension}`,
      );
    }

    const destination = await vscode.window.showSaveDialog(dialogOptions);
    if (!destination) {
      return;
    }

    await vscode.workspace.fs.writeFile(destination, built.bytes);
    await vscode.window.showInformationMessage(
      `Exported ${target.rows.length} row(s) to ${destination.fsPath}.`,
    );
  }

  public async open(
    connection: SavedConnection,
    session: DatabaseAdapter,
    options: WorkbenchOpenOptions = {},
  ): Promise<void> {
    const panel = vscode.window.createWebviewPanel(
      'queryable.connection',
      connection.name,
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.context.extensionUri, 'node_modules', 'monaco-editor', 'min'),
        ],
      },
    );

    panel.iconPath = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'queryable.svg');

    this.panels.add(panel);
    this.activePanel = panel;

    panel.onDidChangeViewState(
      (event) => {
        if (event.webviewPanel.active) {
          this.activePanel = event.webviewPanel;
        }
      },
      undefined,
      this.context.subscriptions,
    );

    let disposed = false;
    const post = async (message: WorkbenchHostMessage): Promise<void> => {
      if (!disposed) {
        await panel.webview.postMessage(message);
      }
    };

    const sendMetadata = async (schema?: string): Promise<void> => {
      const metadata = await session.getMetadata(schema);
      await post({ command: 'metadata', metadata });
    };

    panel.webview.onDidReceiveMessage(
      async (message: WorkbenchMessage) => {
        try {
          switch (message.command) {
            case 'ready':
              await sendMetadata();
              return;

            case 'refreshMetadata':
              await post({ command: 'busy', value: true, label: 'Refreshing database objects…' });
              try {
                await sendMetadata(message.schema);
              } finally {
                await post({ command: 'busy', value: false, label: '' });
              }

              return;

            case 'openTable': {
              const request: TablePageRequest = {
                schema: message.schema,
                table: message.table,
                page: 1,
                pageSize: 50,
                search: '',
              };

              const page = await session.fetchTablePage(request);
              await post({
                command: 'tablePage',
                key: tableTabKey(message.schema, message.table),
                request,
                page,
              });
              return;
            }

            case 'loadTablePage': {
              const request: TablePageRequest = {
                ...message.request,
                page: positiveInteger(message.request.page, 1, 2_000_000_000),
                pageSize: positiveInteger(message.request.pageSize, 50, 500),
              };

              const page = await session.fetchTablePage(request);
              await post({
                command: 'tablePage',
                key: tableTabKey(request.schema, request.table),
                request,
                page,
              });
              return;
            }

            case 'openProcedure': {
              const request = { schema: message.schema, name: message.name, type: message.type };
              const definition = await session.getProcedureDefinition(request);

              await post({
                command: 'procedureDefinition',
                key: procedureTabKey(message.schema, message.name, message.type),
                request,
                definition,
              });
              return;
            }

            case 'updateCell': {
              await post({ command: 'busy', value: true, label: 'Saving cell…' });

              try {
                await session.updateCell(message.request);

                const page = await session.fetchTablePage(message.pageRequest);
                await post({
                  command: 'tablePage',
                  key: tableTabKey(message.pageRequest.schema, message.pageRequest.table),
                  request: message.pageRequest,
                  page,
                });

                await post({ command: 'cellSaved', editId: message.editId });
              } finally {
                await post({ command: 'busy', value: false, label: '' });
              }

              return;
            }

            case 'executeQuery': {
              if (!message.sql.trim()) {
                return;
              }

              await post({ command: 'busy', value: true, label: 'Running query…' });
              try {
                const result = await session.execute(message.sql);
                const id =
                  message.openMode === 'reuse-active' && message.targetResultId !== null
                    ? message.targetResultId
                    : `query:${randomUUID()}`;

                await post({ command: 'queryResult', id, title: 'Query result', result });
              } finally {
                await post({ command: 'busy', value: false, label: '' });
              }

              return;
            }

            case 'exportData':
              this.activePanel = panel;
              await this.writeExport(message.format, message.target);
              return;

            case 'closeSession':
              panel.dispose();
              return;
          }
        } catch (error) {
          await post({ command: 'busy', value: false, label: '' });
          await post({ command: 'error', message: errorText(error) });
        }
      },
      undefined,
      this.context.subscriptions,
    );

    panel.webview.html = this.html(panel.webview, connection);
    panel.onDidDispose(
      () => {
        disposed = true;
        this.panels.delete(panel);

        if (this.activePanel === panel) {
          this.activePanel = Array.from(this.panels).find((candidate) => candidate.active);
        }

        void (async () => {
          await session.close().catch(() => undefined);
          if (!options.saveOnClose) {
            return;
          }

          const answer = await vscode.window.showWarningMessage(
            `Save connection “${connection.name}” before closing?`,
            {
              modal: true,
              detail:
                options.savePromptDetail ??
                'This connection has configuration changes that are not saved. Save them for later use, or continue closing without saving.',
            },
            'Save Connection',
            'Close Without Saving',
          );

          if (answer !== 'Save Connection') {
            return;
          }

          try {
            await options.saveOnClose();
            await vscode.window.showInformationMessage(`Connection “${connection.name}” saved.`);
          } catch (error) {
            await vscode.window.showErrorMessage(
              `Could not save connection “${connection.name}”: ${errorText(error)}`,
            );
          }
        })();
      },
      undefined,
      this.context.subscriptions,
    );
  }

  private html(webview: vscode.Webview, connection: SavedConnection): string {
    const token = nonce();
    const monacoRoot = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'node_modules', 'monaco-editor', 'min'),
    );
    const title = connection.name.replace(
      /[&<>"']/g,
      (character) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[character] ?? character,
    );
    const routineSectionVisible = connection.kind !== 'sqlite3' && connection.kind !== 'd1';
    const routineTabTitle = connection.kind === 'duckdb' ? 'Macros' : 'Procedures / Functions';
    const routineTabs = routineSectionVisible
      ? `<div class="object-tabs" id="objectTabs"><button class="object-tab active" id="tablesObjectTab" type="button" data-object-mode="tables">Tables</button><button class="object-tab" id="proceduresObjectTab" type="button" data-object-mode="procedures">${routineTabTitle}</button></div>`
      : '';
    return readWebviewTemplate(this.context.extensionPath, 'workbench.html')
      .replaceAll('{{NONCE}}', token)
      .replaceAll('{{CSP_SOURCE}}', webview.cspSource)
      .replaceAll('{{MONACO_ROOT}}', monacoRoot.toString())
      .replaceAll('{{TITLE}}', title)
      .replace('{{ROUTINE_CLASS}}', routineSectionVisible ? '' : ' no-tabs')
      .replace('{{ROUTINE_TABS}}', routineTabs)
      .replace(
        '{{ROUTINE_SEARCH_PLACEHOLDER}}',
        connection.kind === 'duckdb' ? 'Search macros…' : 'Search procedures / functions…',
      );
  }
}
