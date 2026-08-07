// Deprecation mappings for @agent-plugins-doctor/compatibility
// A deprecation lists a field that a client stopped honoring in a given spec
// version, so plugins still declaring it can be warned.

export interface Deprecation {
  field: string;
  specVersion: string;
  message: string;
  migration?: string;
}

// v1.0.0 has no deprecations (initial release).
// Future versions will add deprecations here, keyed by the spec version in
// which the field became deprecated.
export const DEPRECATIONS: Deprecation[] = [];

/** Return the deprecations that apply to the given spec version. */
export function getDeprecationsForVersion(version: string): Deprecation[] {
  return DEPRECATIONS.filter(
    (deprecation) => deprecation.specVersion === version,
  );
}
