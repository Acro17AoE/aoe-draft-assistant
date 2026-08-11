export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function compactName(name: string): string {
  return normalizeName(name).replace(/[^a-z0-9]/g, '')
}

export function namesMatch(left: string, right: string): boolean {
  const a = normalizeName(left)
  const b = normalizeName(right)
  if (!a || !b) return false
  if (a === b) return true
  const compactA = compactName(left)
  const compactB = compactName(right)
  if (compactA && compactB && (compactA.includes(compactB) || compactB.includes(compactA))) {
    return true
  }
  for (const token of a.split(/[.\s_|]+/)) {
    if (token.length >= 4 && token === b) return true
  }
  for (const token of b.split(/[.\s_|]+/)) {
    if (token.length >= 4 && token === a) return true
  }
  // Clan tag form: "NOC | Acro17" ↔ "Acro17"
  for (const token of a.split(/[.\s_|]+/)) {
    if (token.length >= 4 && b.includes(token)) return true
  }
  for (const token of b.split(/[.\s_|]+/)) {
    if (token.length >= 4 && a.includes(token)) return true
  }
  return false
}
