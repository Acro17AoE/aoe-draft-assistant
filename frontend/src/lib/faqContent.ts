import { PRODUCT_EXPANSION, PRODUCT_NAME, PRODUCT_TAGLINE } from './brand'

export interface FaqEntry {
  id: string
  question: string
  answer: string
}

export const FAQ_INTRO = `${PRODUCT_NAME} — ${PRODUCT_EXPANSION}.

${PRODUCT_TAGLINE}

DRAFT is a companion for Age of Empires II Captain’s Mode on aoe2cm. You prepare map-specific civ rankings (and optional unit pools), lock the maps for a set, then get live decision support while bans and picks happen under time pressure: which civs remain strong across the series, which pools are getting scarce, and how to assign picks to maps.`

export const FAQ_ENTRIES: FaqEntry[] = [
  {
    id: 'what-is-draft',
    question: `What does ${PRODUCT_NAME} stand for?`,
    answer: `${PRODUCT_NAME} means ${PRODUCT_EXPANSION}. Ranking is your TierMaker-style presets per map. Assignment is dragging picks onto map slots. Forecasting is pressure and Top picks before and during the civ draft — so you decide with the full constraint picture, not from memory or a spreadsheet.`,
  },
  {
    id: 'who-for',
    question: 'Who is it for?',
    answer:
      'Captains, analysts, and practice groups running AoE2 Captain’s Mode. Solo prep works in the browser; login unlocks cloud sync and shared sessions for teammates.',
  },
  {
    id: 'workflow',
    question: 'What is the recommended workflow?',
    answer:
      'Presets → Map Draft (team name + maps) → check Draft Preview → Civ Draft (paste aoe2cm link → Go) → optional Results and Analysis. Use New Here? for a guided tour of each tab.',
  },
  {
    id: 'preview',
    question: 'What is Draft Preview?',
    answer:
      'After maps are locked, Preview shows how your active preset connects to those maps before the first ban: portfolio civs strong across the set, map specialists, per-map Top 3, and starting pool or S/A pressure. Hover a civ to see why it ranks that way (map contributions). The same language continues on the live Civ Draft board.',
  },
  {
    id: 'presets-pools',
    question: 'How do presets and Advanced pools work?',
    answer:
      'Each map in a preset tournament has S–F tiers. Advanced mode adds pools (e.g. Halb SO, Paladin, Flank). A civ can sit in multiple pools. Civ Draft sorts and shows scarcity so you do not empty a pool the opponent still needs.',
  },
  {
    id: 'time',
    question: 'How does it help under time constraints?',
    answer:
      'Live aoe2cm drafts move quickly. DRAFT keeps tiers, pool remaining counts, Top picks, and map assignment in one board so captains spend attention on decisions — deny, pick, assign — not on reconstructing Excel mid-draft.',
  },
  {
    id: 'not-affiliated',
    question: 'Is this official?',
    answer:
      'No. Fan tooling for practice only — not affiliated with tournament organizers, aoe2cm, or Microsoft. See the footer for Game Content Usage Rules.',
  },
]
