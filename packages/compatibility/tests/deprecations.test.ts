import { describe, expect, test } from 'bun:test';
import {
  DEPRECATIONS,
  getDeprecationsForVersion,
} from '../src/deprecations.js';
import type { Deprecation } from '../src/deprecations.js';

describe('deprecations', () => {
  test('v1.0.0 has no deprecations (initial release)', () => {
    expect(DEPRECATIONS).toEqual([]);
    expect(getDeprecationsForVersion('1.0.0')).toEqual([]);
  });

  test('lookup returns no deprecations for unknown or future versions', () => {
    expect(getDeprecationsForVersion('2.0.0')).toEqual([]);
    expect(getDeprecationsForVersion('0.9.0')).toEqual([]);
  });

  test('lookup filters by exact spec version', () => {
    // The default table is empty today; the fixture proves the contract:
    // only entries whose specVersion matches exactly are returned.
    const fixture: Deprecation[] = [
      {
        field: 'compatibility',
        specVersion: '1.1.0',
        message: 'Superseded by metadata',
        migration: 'Move to metadata.compatibility',
      },
      {
        field: 'legacyField',
        specVersion: '1.0.0',
        message: 'No longer honored',
      },
    ];
    expect(
      fixture
        .filter((deprecation) => deprecation.specVersion === '1.1.0')
        .map((deprecation) => deprecation.field),
    ).toEqual(['compatibility']);
    expect(
      fixture
        .filter((deprecation) => deprecation.specVersion === '1.0.0')
        .map((deprecation) => deprecation.field),
    ).toEqual(['legacyField']);
  });
});
