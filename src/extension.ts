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
import { ConnectionStore } from './storage/connectionStore';
import { HomeViewProvider } from './ui/homeView';
import { WorkbenchManager } from './ui/workbench';

export function activate(context: vscode.ExtensionContext): void {
  const store = new ConnectionStore(context);
  const workbench = new WorkbenchManager(context);
  const home = new HomeViewProvider(context, store, async (connection, session, options) =>
    workbench.open(connection, session, options),
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(HomeViewProvider.viewType, home, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand('queryable.openHome', async () => home.reveal()),
    vscode.commands.registerCommand('queryable.exportJson', async () =>
      workbench.exportActive('json'),
    ),
    vscode.commands.registerCommand('queryable.exportCsv', async () =>
      workbench.exportActive('csv'),
    ),
    vscode.commands.registerCommand('queryable.exportHtml', async () =>
      workbench.exportActive('html'),
    ),
  );
}

export function deactivate(): void {}
