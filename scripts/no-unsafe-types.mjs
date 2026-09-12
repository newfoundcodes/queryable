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

import { readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const root = new URL('../src/', import.meta.url);
const banned = [
  { label: 'explicit any type', pattern: /\bany\b/g },
  { label: 'explicit unknown type', pattern: /\bunknown\b/g },
];

async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const output = [];

  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      output.push(...(await files(full)));
    } else if (extname(entry.name) === '.ts') {
      output.push(full);
    }
  }

  return output;
}

let failed = false;
for (const file of await files(root.pathname)) {
  const text = await readFile(file, 'utf8');
  for (const rule of banned) {
    if (rule.pattern.test(text)) {
      console.error(`${file}: contains ${rule.label}`);
      failed = true;
    }

    rule.pattern.lastIndex = 0;
  }
}

if (failed) {
  process.exit(1);
}

console.log('Queryable source contains no explicit any or unknown type tokens.');
