export const AOE2_CIVS = [
  'Armenians', 'Aztecs', 'Bengalis', 'Berbers', 'Bohemians', 'Britons', 'Bulgarians',
  'Burgundians', 'Burmese', 'Byzantines', 'Celts', 'Chinese', 'Cumans', 'Dravidians',
  'Ethiopians', 'Franks', 'Georgians', 'Goths', 'Gurjaras', 'Hindustanis', 'Huns',
  'Incas', 'Italians', 'Japanese', 'Jurchens', 'Khmer', 'Khitans', 'Koreans',
  'Lithuanians', 'Magyars', 'Malay', 'Malians', 'Mapuche', 'Mayans', 'Mongols',
  'Muisca', 'Persians', 'Poles', 'Portuguese', 'Romans', 'Saracens', 'Shu',
  'Sicilians', 'Slavs', 'Spanish', 'Tatars', 'Teutons', 'Tupi', 'Turks',
  'Vietnamese', 'Vikings', 'Wei', 'Wu',
] as const

/** Common result-entry spellings → canonical AoE2 civ name. */
const CIV_NAME_ALIASES: Record<string, string> = {
  maya: 'Mayans',
  aztec: 'Aztecs',
  hindustani: 'Hindustanis',
  hindustan: 'Hindustanis',
  italian: 'Italians',
  viking: 'Vikings',
  mongol: 'Mongols',
  frank: 'Franks',
  briton: 'Britons',
  korean: 'Koreans',
  chinese: 'Chinese',
  japanese: 'Japanese',
  spanish: 'Spanish',
  turk: 'Turks',
  saracen: 'Saracens',
  persian: 'Persians',
  hun: 'Huns',
  goth: 'Goths',
  celt: 'Celts',
  slav: 'Slavs',
  magyar: 'Magyars',
  malian: 'Malians',
  malay: 'Malay',
  khmer: 'Khmer',
  burmese: 'Burmese',
  vietnamese: 'Vietnamese',
  bengali: 'Bengalis',
  dravidian: 'Dravidians',
  gurjara: 'Gurjaras',
  roman: 'Romans',
  armenian: 'Armenians',
  georgian: 'Georgians',
  bohemian: 'Bohemians',
  burgundian: 'Burgundians',
  sicilian: 'Sicilians',
  bulgarian: 'Bulgarians',
  lithuanian: 'Lithuanians',
  polish: 'Poles',
  portuguese: 'Portuguese',
  teuton: 'Teutons',
  tatar: 'Tatars',
  cuman: 'Cumans',
}

export function civSlug(civName: string): string {
  return civName.toLowerCase().replace(/\s+/g, '')
}

/** Map free-text civ names (e.g. from results) to a known civ for icons. */
export function resolveCivDisplayName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return trimmed

  const exact = AOE2_CIVS.find((civ) => civ.toLowerCase() === trimmed.toLowerCase())
  if (exact) return exact

  const slug = civSlug(trimmed)
  const alias = CIV_NAME_ALIASES[slug]
  if (alias) return alias

  const prefix = AOE2_CIVS.find(
    (civ) =>
      civSlug(civ).startsWith(slug) ||
      slug.startsWith(civSlug(civ)) ||
      civ.toLowerCase().startsWith(trimmed.toLowerCase()),
  )
  if (prefix && slug.length >= 3) return prefix

  return trimmed
}

const AOE2CM_CIV_ICON = 'https://aoe2cm.net/images/civs'

export function civIconUrl(civName: string, imageFromDraft?: string): string {
  if (imageFromDraft) {
    if (imageFromDraft.startsWith('http')) return imageFromDraft
    return `https://aoe2cm.net${imageFromDraft}`
  }
  const canonical = resolveCivDisplayName(civName)
  const slug = civSlug(canonical)
  return `${AOE2CM_CIV_ICON}/${slug}.png`
}

/** CDN URL for civ icons (use when local /civs/ asset may be missing). */
export function civIconCdnUrl(civName: string): string {
  const slug = civSlug(resolveCivDisplayName(civName))
  return `${AOE2CM_CIV_ICON}/${slug}.png`
}

export function extractDraftId(urlOrId: string): string {
  const match = urlOrId.trim().match(/\/draft\/([^/?#]+)/)
  return match ? match[1] : urlOrId.trim()
}
