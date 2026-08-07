// Rule registry: stores rules by id and supports category / spec-version
// filtering. The default registry (see rules/index.ts) registers every rule in
// this package.

import type { RuleCategory } from '@agent-plugins-doctor/core';
import type { Rule } from './rule.js';

export class RuleRegistry {
  private rules: Map<string, Rule> = new Map();

  /** Register a rule. Throws if a rule with the same id already exists. */
  register(rule: Rule): void {
    if (this.rules.has(rule.id)) {
      throw new Error(`Rule already registered: ${rule.id}`);
    }
    this.rules.set(rule.id, rule);
  }

  get(id: string): Rule | undefined {
    return this.rules.get(id);
  }

  getAll(): Rule[] {
    return [...this.rules.values()];
  }

  getByCategory(category: RuleCategory): Rule[] {
    return this.getAll().filter((rule) => rule.category === category);
  }

  getForSpecVersion(version: string): Rule[] {
    return this.getAll().filter(
      (rule) =>
        rule.supportedSpecVersions.includes('*') ||
        rule.supportedSpecVersions.includes(version),
    );
  }

  clear(): void {
    this.rules.clear();
  }
}
