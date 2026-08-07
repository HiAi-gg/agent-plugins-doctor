// Agent Plugins Specification v1.0.0 constants

export const SPEC_VERSION = '1.0.0';

export const PLUGIN_SCHEMA_URL =
  'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json';
export const MCP_SCHEMA_URL =
  'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json';

// Plugin name: 1-64 chars, lowercase alphanumeric + hyphens + periods
// No consecutive hyphens (--) or periods (..)
// Must start and end with alphanumeric
export const NAME_PATTERN =
  /^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;
export const NAME_MAX_LENGTH = 64;

// Skill name: 1-64 chars, lowercase alphanumeric + hyphens
// No consecutive hyphens (--)
// Must start and end with alphanumeric (no leading/trailing hyphen)
export const SKILL_NAME_PATTERN = /^(?!.*--)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
export const SKILL_NAME_MAX_LENGTH = 64;

export const DESCRIPTION_MAX_LENGTH = 1024;
export const COMPATIBILITY_MAX_LENGTH = 500;

export const SUPPORTED_COMPONENT_TYPES = ['skills', 'mcp'] as const;
export type ComponentType = (typeof SUPPORTED_COMPONENT_TYPES)[number];
