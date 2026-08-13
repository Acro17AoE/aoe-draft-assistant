import { PRODUCT_EXPANSION, PRODUCT_NAME, PRODUCT_TAGLINE } from './brand'

export interface FaqEntry {
  id: string
  question: string
  answer: string
}

export const FAQ_INTRO = `${PRODUCT_NAME} — ${PRODUCT_EXPANSION}.

${PRODUCT_TAGLINE}

DRAFT is a companion for Age of Empires II Captain’s Mode on aoe2cm. You prepare map-specific civ rankings (optional unit pools, Key civs, and Nemesis civs), lock the maps for a set, plan ban targets with Prepared bans, then get live decision support while bans and picks happen under time pressure: which civs remain strong across the series, which pools are getting scarce, and how to assign picks to maps.`

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
      'Presets (tiers, optional pools, Key/Nemesis markers) → Map Draft (team name + maps) → Civ Draft (paste aoe2cm link, plan Prepared bans, then Go) → optional Results and Analysis. Use New Here? for a guided tour of each tab.',
  },
  {
    id: 'preview',
    question: 'What is Draft Preview?',
    answer:
      'After maps are locked, Preview shows how your active preset connects to those maps before the first ban: portfolio civs strong across the set, map specialists, per-map Top 3, and starting pool or S/A pressure. Hover a civ to see why it ranks that way (map contributions). The same language continues on the live Civ Draft board.',
  },
  {
    id: 'key-nemesis',
    question: 'What are Key civs and Nemesis civs?',
    answer:
      'In Presets, double-click a civ icon to cycle markers: none → ★ Key → ☠ Nemesis → none. Key civs are your must-have picks for that map — they appear in a dedicated Key civs column on the live Civ Draft board (next to Top 3) while still available. Nemesis civs are civs you especially want to ban; they are highlighted in red with a skull in Prepared bans. Markers are saved per map in your preset.',
  },
  {
    id: 'presets-pools',
    question: 'How do presets and Advanced pools work?',
    answer:
      'Each map in a preset tournament has S–F tiers. Advanced mode adds pools (e.g. Halb SO, Paladin, Flank). A civ can sit in multiple pools. Optional Max per pool limits how many civs from that pool DRAFT suggests in Top picks for that map. Civ Draft sorts and shows scarcity — on multi-map drafts, Already picked counts appear per pool so you do not empty a pool the opponent still needs.',
  },
  {
    id: 'prepared-bans',
    question: 'What are Prepared bans?',
    answer:
      'On the Civ Draft tab, after you paste a valid aoe2cm civ draft link (before or after Go), you can plan ban targets in order. You get up to twice as many slots as your own ban turns in that draft. Click civs to fill slots, then Set to lock the list; Change reopens it. Nemesis civs from your preset are shown in red with ☠. The panel hides once the ban phase is finished.',
  },
  {
    id: 'civ-draft-board',
    question: 'How does the live Civ Draft board work?',
    answer:
      'Per map column: assignment slots, map name, S/A pressure (or per-pool Already picked in Advanced mode), Top 3 recommendations, and — when your preset has Key civs — a Key civs column on the right. Your picks stays on the right for drag-and-drop assignment. On a single-map draft, Available civs replace the multi-map pool strip.',
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
