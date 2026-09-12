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

import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));

const requiredBuildFiles = [
  ['TypeScript compiler', 'node_modules/typescript/bin/tsc'],
  ['Node.js declarations', 'node_modules/@types/node/index.d.ts'],
  ['VS Code declarations', 'node_modules/@types/vscode/index.d.ts'],
  ['node-postgres declarations', 'node_modules/@types/pg/index.d.ts'],
  ['SSH2 declarations', 'node_modules/@types/ssh2/index.d.ts'],
  ['MSSQL declarations', 'node_modules/@types/mssql/index.d.ts'],
];

async function exists(relativePath) {
  try {
    await access(join(projectRoot, relativePath), constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

const missing = [];
for (const [label, relativePath] of requiredBuildFiles) {
  if (!(await exists(relativePath))) {
    missing.push(label);
  }
}

if (missing.length === 0) {
  process.exit(0);
}

console.error(`Queryable build dependencies are missing: ${missing.join(', ')}.`);
console.error('The compile task does not install packages or access the network.');
console.error('Run this once when npm registry access is available:');
console.error('  npm run bootstrap');
console.error('Then run:');
console.error('  npm run compile');
console.error(
  'If npm reports ECONNRESET, check npm ping, registry, proxy settings, and retry the bootstrap command.',
);

process.exit(1);
