/** Feature gates — prefer server-provided flags; never hardcode emails in source. */

import type { AuthUser } from './cloudStorage'

export function isAdminUser(user: AuthUser | null | undefined): boolean {
  return Boolean(user?.is_admin)
}

/** Opponent Analysis dropdown + report (Map Draft / Draft Preview). */
export function canUseOpponentAnalysis(user: AuthUser | null | undefined): boolean {
  return Boolean(user?.can_opponent_analysis)
}
