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

import { readFileSync } from 'node:fs';
import * as net from 'node:net';
import type { AddressInfo } from 'node:net';
import { Client, type ConnectConfig } from 'ssh2';
import type { RuntimeSecrets, SshTunnelConfig } from '../types';

export interface TunnelEndpoint {
  readonly host: string;
  readonly port: number;
}

export class SshTunnel {
  private readonly client = new Client();
  private server: net.Server | undefined;

  public constructor(
    private readonly config: SshTunnelConfig,
    private readonly secrets: RuntimeSecrets,
    private readonly target: TunnelEndpoint,
  ) {}

  public async open(): Promise<TunnelEndpoint> {
    await this.connectSsh();

    const server = net.createServer((socket) => {
      this.client.forwardOut(
        '127.0.0.1',
        0,
        this.target.host,
        this.target.port,
        (error, stream) => {
          if (error) {
            socket.destroy(error);
            return;
          }

          socket.pipe(stream).pipe(socket);

          stream.on('error', (streamError: Error) => socket.destroy(streamError));
          socket.on('error', () => stream.destroy());
        },
      );
    });
    this.server = server;

    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error): void => reject(error);

      server.once('error', onError);
      server.listen(0, '127.0.0.1', () => {
        server.off('error', onError);
        resolve();
      });
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Could not determine the local SSH forwarding port.');
    }

    return { host: '127.0.0.1', port: (address as AddressInfo).port };
  }

  private async connectSsh(): Promise<void> {
    const base: ConnectConfig = {
      host: this.config.host,
      port: this.config.port,
      username: this.config.username,
      readyTimeout: 20_000,
      keepaliveInterval: 10_000,
      keepaliveCountMax: 3,
    };

    const connectConfig: ConnectConfig =
      this.config.authMode === 'private-key'
        ? {
            ...base,
            privateKey: readFileSync(this.config.privateKeyPath),
            passphrase: this.secrets.sshKeyPassphrase,
          }
        : {
            ...base,
            password: this.secrets.sshPassword,
          };

    await new Promise<void>((resolve, reject) => {
      const onReady = (): void => {
        cleanup();
        resolve();
      };

      const onError = (error: Error): void => {
        cleanup();
        reject(error);
      };

      const cleanup = (): void => {
        this.client.off('ready', onReady);
        this.client.off('error', onError);
      };

      this.client.once('ready', onReady);
      this.client.once('error', onError);
      this.client.connect(connectConfig);
    });
  }

  public async close(): Promise<void> {
    const server = this.server;
    this.server = undefined;

    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }

    this.client.end();
  }
}
