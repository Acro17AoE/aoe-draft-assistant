/** Admin gate — prefer server-provided `is_admin`; never hardcode emails in source. */

import type { AuthUser } from './cloudStorage'

export function isAdminUser(user: AuthUser | null | undefined): boolean {
  return Boolean(user?.is_admin)
}
