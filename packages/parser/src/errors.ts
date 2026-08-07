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

export interface SchemaValidationErrorDetail {
  path: string;
  message: string;
  keyword: string;
}
