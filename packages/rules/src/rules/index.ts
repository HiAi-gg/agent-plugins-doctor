// Default rule registry: registers every rule in this package.

import type { Rule } from '../rule.js';
import { RuleRegistry } from '../registry.js';

// Import all rules
import * as manifestRules from './manifest/index.js';
import * as skillRules from './skill/index.js';
import * as mcpRules from './mcp/index.js';
import * as securityRules from './security/index.js';
import * as structureRules from './structure/index.js';
import * as compatibilityRules from './compatibility/index.js';
import * as formatRules from './format/index.js';

function isRule(value: unknown): value is Rule {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { id?: unknown }).id === 'string'
  );
}

export function createDefaultRegistry(): RuleRegistry {
  const registry = new RuleRegistry();

  // Register all rules
  Object.values(manifestRules)
    .filter(isRule)
    .forEach((rule) => registry.register(rule));
  Object.values(skillRules)
    .filter(isRule)
    .forEach((rule) => registry.register(rule));
  Object.values(mcpRules)
    .filter(isRule)
    .forEach((rule) => registry.register(rule));
  Object.values(securityRules)
    .filter(isRule)
    .forEach((rule) => registry.register(rule));
  Object.values(structureRules)
    .filter(isRule)
    .forEach((rule) => registry.register(rule));
  Object.values(compatibilityRules)
    .filter(isRule)
    .forEach((rule) => registry.register(rule));
  Object.values(formatRules)
    .filter(isRule)
    .forEach((rule) => registry.register(rule));

  return registry;
}
