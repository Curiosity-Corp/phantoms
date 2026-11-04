import { createHash, timingSafeEqual } from 'node:crypto';

// Compare two secrets in constant time. Hashing first gives both sides the
// same length, so the comparison neither throws on a length mismatch nor
// leaks the expected token's length through timing.
export function tokenMatches(presented: string, expected: string): boolean {
  const a = createHash('sha256').update(presented).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

// Returns the token from an `Authorization: Bearer <token>` header, if any.
export function bearerToken(header: string | undefined): string | undefined {
  const match = /^Bearer +(\S+)$/i.exec(header ?? '');
  return match?.[1];
}
