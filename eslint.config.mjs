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

import tseslint from 'typescript-eslint';
import stylistic from '@stylistic/eslint-plugin';

export default tseslint.config(
  {
    ignores: ['out/**', 'node_modules/**'],
  },
  ...tseslint.configs.recommended,
  {
    files: ['**/*.js', '**/*.mjs', '**/*.ts', '**/*.tsx'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        Headers: 'readonly',
        fetch: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        EventTarget: 'readonly',
        Event: 'readonly',
        document: 'readonly',
        window: 'readonly',
        location: 'readonly',
        HTMLElement: 'readonly',
        Element: 'readonly',
        CustomEvent: 'readonly',
        MutationObserver: 'readonly',
        Blob: 'readonly',
        File: 'readonly',
        FormData: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        DecompressionStream: 'readonly',
        CompressionStream: 'readonly',
        URLSearchParams: 'readonly',
        btoa: 'readonly',
        atob: 'readonly',
        structuredClone: 'readonly',
        AbortSignal: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': 'off',
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      '@typescript-eslint/no-wrapper-object-types': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-this-alias': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      'prefer-const': 'off',
      '@typescript-eslint/no-namespace': 'off',
      curly: ['error', 'all'],
      'padding-line-between-statements': 'off',
      '@stylistic/padding-line-between-statements': [
        'error',
        { blankLine: 'always', prev: 'import', next: '*' },
        { blankLine: 'any', prev: 'import', next: 'import' },
        { blankLine: 'never', prev: '*', next: 'return' },
        { blankLine: 'always', prev: 'block-like', next: '*' },
      ],
      '@stylistic/lines-between-class-members': [
        'error',
        {
          enforce: [
            { blankLine: 'never', prev: 'field', next: 'field' },
            { blankLine: 'always', prev: 'field', next: 'method' },
            { blankLine: 'always', prev: 'method', next: '*' },
          ],
        },
      ],
    },
    plugins: {
      '@stylistic': stylistic,
    },
  },
);
