// Spec version registry
// Maps $schema URLs to spec versions

import * as v1 from './v1/index.js';

export * from './v1/index.js';

export interface SpecVersion {
  version: string;
  pluginSchemaUrl: string;
  mcpSchemaUrl: string;
  namePattern: RegExp;
  nameMaxLength: number;
  skillNamePattern: RegExp;
  skillNameMaxLength: number;
  descriptionMaxLength: number;
  compatibilityMaxLength: number;
  supportedComponentTypes: readonly string[];
}

const specVersions: Record<string, SpecVersion> = {
  '1.0.0': {
    version: v1.SPEC_VERSION,
    pluginSchemaUrl: v1.PLUGIN_SCHEMA_URL,
    mcpSchemaUrl: v1.MCP_SCHEMA_URL,
    namePattern: v1.NAME_PATTERN,
    nameMaxLength: v1.NAME_MAX_LENGTH,
    skillNamePattern: v1.SKILL_NAME_PATTERN,
    skillNameMaxLength: v1.SKILL_NAME_MAX_LENGTH,
    descriptionMaxLength: v1.DESCRIPTION_MAX_LENGTH,
    compatibilityMaxLength: v1.COMPATIBILITY_MAX_LENGTH,
    supportedComponentTypes: v1.SUPPORTED_COMPONENT_TYPES,
  },
};

export function resolveSpecVersion(schemaUrl: string): SpecVersion | null {
  // Map schema URLs to versions
  if (schemaUrl === v1.PLUGIN_SCHEMA_URL || schemaUrl === v1.MCP_SCHEMA_URL) {
    return specVersions['1.0.0'];
  }
  return null;
}

export function getSpecVersion(version: string): SpecVersion | null {
  return specVersions[version] ?? null;
}

export function getCurrentSpecVersion(): SpecVersion {
  return specVersions[v1.SPEC_VERSION];
}

export { v1 };
