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

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const tsconfig = JSON.parse(await readFile(new URL('../tsconfig.json', import.meta.url), 'utf8'));
const npmrc = await readFile(new URL('../.npmrc', import.meta.url), 'utf8');

const ensureBuildDeps = await readFile(
  new URL('../scripts/ensure-build-deps.mjs', import.meta.url),
  'utf8',
);

test('pins the TypeScript compiler used by the source build', () => {
  assert.equal(packageJson.devDependencies.typescript, '5.9.2');
});

test('declares Node and VS Code build type packages', () => {
  assert.equal(typeof packageJson.devDependencies['@types/node'], 'string');
  assert.equal(typeof packageJson.devDependencies['@types/vscode'], 'string');
});

test('uses modern Node module resolution', () => {
  assert.equal(tsconfig.compilerOptions.module, 'Node16');
  assert.equal(tsconfig.compilerOptions.moduleResolution, 'Node16');
});

test('normal npm installs include development build dependencies', () => {
  assert.match(npmrc, /^include=dev\s*$/m);
});

test('npm config retries transient registry failures and prefers cache', () => {
  assert.match(npmrc, /^prefer-offline=true\s*$/m);
  assert.match(npmrc, /^fetch-retries=5\s*$/m);
  assert.match(npmrc, /^fetch-retry-maxtimeout=120000\s*$/m);
});

test('compile never performs an npm install', () => {
  assert.match(packageJson.scripts.compile, /ensure-build-deps/);

  assert.doesNotMatch(packageJson.scripts.compile, /npm install/);
  assert.doesNotMatch(ensureBuildDeps, /spawnSync|npmCommand|npm install/);

  assert.match(ensureBuildDeps, /node_modules\/@types\/node\/index\.d\.ts/);
  assert.match(ensureBuildDeps, /node_modules\/@types\/vscode\/index\.d\.ts/);
});

test('bootstrap is an explicit cache-first dependency install', () => {
  assert.equal(
    packageJson.scripts.bootstrap,
    'npm install --include=dev --prefer-offline --no-audit --no-fund && npm approve-scripts --allow-scripts-pending',
  );
});
