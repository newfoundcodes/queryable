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

import type { DisplayRow, RowIdentity } from '../types';

export function displayValue(
  value: object | string | number | boolean | bigint | null | undefined,
): string {
  if (value === null) {
    return 'NULL';
  }

  if (value === undefined) {
    return '';
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Buffer.isBuffer(value)) {
    return `0x${value.toString('hex')}`;
  }

  if (value instanceof Uint8Array) {
    return `0x${Buffer.from(value).toString('hex')}`;
  }

  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  return String(value);
}

export function toDisplayRow(row: object): DisplayRow {
  const source = row as Record<
    string,
    object | string | number | boolean | bigint | null | undefined
  >;

  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    output[key] = displayValue(value);
  }

  return output;
}

export function toRowIdentity(row: object, keyColumns: readonly string[]): RowIdentity {
  const source = row as Record<
    string,
    object | string | number | boolean | bigint | null | undefined
  >;

  const identity: Record<string, string> = {};
  for (const column of keyColumns) {
    const value = source[column];
    if (value === null || value === undefined) {
      throw new Error(`Primary key column ${column} has no value.`);
    }

    identity[column] = displayValue(value);
  }

  return identity;
}

export function columnsFromRows(rows: readonly DisplayRow[]): readonly string[] {
  const first = rows[0];
  return first ? Object.keys(first) : [];
}

export function errorText<T>(error: T): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export function positiveInteger(value: number, fallback: number, maximum: number): number {
  if (!Number.isInteger(value) || value <= 0) {
    return fallback;
  }

  return Math.min(value, maximum);
}

export function nonNegativeInteger(value: number, fallback: number): number {
  if (!Number.isInteger(value) || value < 0) {
    return fallback;
  }

  return value;
}
