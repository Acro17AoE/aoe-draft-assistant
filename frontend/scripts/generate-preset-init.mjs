/**
 * Generates config/aoe-civ-presets-init.json — starter preset bundle for all maps & civs.
 * Run: node frontend/scripts/generate-preset-init.mjs
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const MAPS = [
  'Acropolis', 'Arabia', 'Arena', 'Black Forest', 'Cape of Storms', 'Crescent',
  'Enemy Archipelago', 'Fortified Clearing', 'Fortress', 'Frontline', 'Gold Rush',
  'Grand Bara', 'Hideout', 'Islands', 'Land Nomad', 'MegaRandom', 'Menindee',
  'Migration', 'Nomad', 'Oasis', 'Team Acropolis', 'Team Islands', 'Tres Leches',
]

const CIVS = [
  'Armenians', 'Aztecs', 'Bengalis', 'Berbers', 'Bohemians', 'Britons', 'Bulgarians',
  'Burgundians', 'Burmese', 'Byzantines', 'Celts', 'Chinese', 'Cumans', 'Dravidians',
  'Ethiopians', 'Franks', 'Georgians', 'Goths', 'Gurjaras', 'Hindustanis', 'Huns',
  'Incas', 'Italians', 'Japanese', 'Jurchens', 'Khmer', 'Khitans', 'Koreans',
  'Lithuanians', 'Magyars', 'Malay', 'Malians', 'Mapuche', 'Mayans', 'Mongols',
  'Muisca', 'Persians', 'Poles', 'Portuguese', 'Romans', 'Saracens', 'Shu',
  'Sicilians', 'Slavs', 'Spanish', 'Tatars', 'Teutons', 'Tupi', 'Turks',
  'Vietnamese', 'Vikings', 'Wei', 'Wu',
]

const TIERS = ['S', 'A', 'B', 'C', 'D', 'F']

function entriesForMap() {
  return CIVS.map((civId, index) => ({
    civId,
    tier: TIERS[index % TIERS.length],
  }))
}

const presets = MAPS.map((mapName) => ({
  id: `map-${mapName.toLowerCase().replace(/\s+/g, '-')}`,
  name: mapName,
  mapName,
  entries: entriesForMap(),
  updatedAt: new Date().toISOString(),
}))

const bundle = {
  version: 1,
  maps: MAPS,
  presets,
  meta: {
    description: 'Starter template: all standard maps, all civs with tier S–F. Adjust per map after import.',
  },
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const outDir = join(root, 'config')
mkdirSync(outDir, { recursive: true })
const outPath = join(outDir, 'aoe-civ-presets-init.json')
writeFileSync(outPath, `${JSON.stringify(bundle, null, 2)}\n`, 'utf8')
console.log(`Wrote ${outPath} (${presets.length} maps × ${CIVS.length} civs)`)
