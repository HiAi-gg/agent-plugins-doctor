import { describe, expect, test } from 'bun:test';
import { RuleRegistry } from '../src/registry.js';
import type { Rule } from '../src/rule.js';

function stubRule(overrides: Partial<Rule>): Rule {
  return {
    id: 'stub',
    code: 'DOC-0000',
    name: 'Stub',
    category: 'spec',
    severity: 'error',
    supportedSpecVersions: ['1.0.0'],
    description: 'Stub rule',
    enabledByDefault: true,
    check: () => [],
    ...overrides,
  };
}

describe('RuleRegistry', () => {
  test('rules can be registered and retrieved', () => {
    const registry = new RuleRegistry();
    const rule = stubRule({ id: 'a', code: 'DOC-0001' });
    registry.register(rule);
    expect(registry.get('a')).toBe(rule);
    expect(registry.getAll()).toEqual([rule]);
  });

  test('registering a duplicate id throws', () => {
    const registry = new RuleRegistry();
    registry.register(stubRule({ id: 'dup' }));
    expect(() => registry.register(stubRule({ id: 'dup' }))).toThrow(
      'already registered',
    );
  });

  test('get returns undefined for an unknown id', () => {
    const registry = new RuleRegistry();
    expect(registry.get('missing')).toBeUndefined();
  });

  test('rules can be filtered by category', () => {
    const registry = new RuleRegistry();
    registry.register(stubRule({ id: 'a', category: 'spec' }));
    registry.register(stubRule({ id: 'b', category: 'skills' }));
    registry.register(stubRule({ id: 'c', category: 'spec' }));
    const spec = registry.getByCategory('spec');
    expect(spec.map((rule) => rule.id).sort()).toEqual(['a', 'c']);
    expect(registry.getByCategory('security')).toEqual([]);
  });

  test('rules can be filtered by spec version', () => {
    const registry = new RuleRegistry();
    registry.register(stubRule({ id: 'v1', supportedSpecVersions: ['1.0.0'] }));
    registry.register(stubRule({ id: 'all', supportedSpecVersions: ['*'] }));
    registry.register(stubRule({ id: 'v2', supportedSpecVersions: ['2.0.0'] }));
    const forV1 = registry.getForSpecVersion('1.0.0');
    expect(forV1.map((rule) => rule.id).sort()).toEqual(['all', 'v1']);
    const forV2 = registry.getForSpecVersion('2.0.0');
    expect(forV2.map((rule) => rule.id).sort()).toEqual(['all', 'v2']);
    const forV3 = registry.getForSpecVersion('3.0.0');
    expect(forV3.map((rule) => rule.id)).toEqual(['all']);
  });

  test('clear removes every rule', () => {
    const registry = new RuleRegistry();
    registry.register(stubRule({ id: 'a' }));
    registry.clear();
    expect(registry.getAll()).toEqual([]);
    expect(registry.get('a')).toBeUndefined();
  });
});
