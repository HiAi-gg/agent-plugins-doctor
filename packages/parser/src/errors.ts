// Parse error types

export class ParseError extends Error {
  constructor(
    message: string,
    public file: string,
    public cause?: unknown,
  ) {
    super(message);
    this.name = 'ParseError';
  }
}

export class LoadError extends Error {
  constructor(
    message: string,
    public path: string,
    public cause?: unknown,
  ) {
    super(message);
    this.name = 'LoadError';
  }
}

export class SchemaValidationError extends Error {
  constructor(
    message: string,
    public file: string,
    public errors: SchemaValidationErrorDetail[],
  ) {
    super(message);
    this.name = 'SchemaValidationError';
  }
}

/**
 * Thrown when plugin.json declares a `$schema` URL that Doctor does not
 * support (an unsupported or future Agent Plugins version). Subclasses
 * SchemaValidationError so existing error classification (`isPluginLoadError`,
 * instanceof checks) keeps working, but the loader maps it to a dedicated
 * DOC-1010 diagnostic instead of the schema's generic const violation.
 */
export class UnsupportedVersionError extends SchemaValidationError {
  constructor(
    message: string,
    file: string,
    public schemaUrl: string,
  ) {
    super(message, file, [
      {
        path: '/$schema',
        message: `unsupported schema URL ${schemaUrl}`,
        keyword: 'const',
      },
    ]);
    this.name = 'UnsupportedVersionError';
  }
}

export interface SchemaValidationErrorDetail {
  path: string;
  message: string;
  keyword: string;
}
