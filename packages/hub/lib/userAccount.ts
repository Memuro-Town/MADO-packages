// scripts/create-user.mjs と同じ値。CLIとUI(admin API)の両方から使う基準を揃える。
export const BCRYPT_COST = 10;
export const MIN_PASSWORD_LENGTH = 8;
export const VALID_ROLES = ['admin', 'staff'] as const;
export type UserRole = (typeof VALID_ROLES)[number];

export function isValidRole(role: unknown): role is UserRole {
  return typeof role === 'string' && (VALID_ROLES as readonly string[]).includes(role);
}
