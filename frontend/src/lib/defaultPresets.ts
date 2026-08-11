import type { CivPriorityEntry, MapPriorityPreset, PriorityTier } from '../types/draft'
import { PRIORITY_TIERS } from './tiers'
import { presetIdForMap } from './maps'

function entriesFromTiers(groups: Partial<Record<PriorityTier, string[]>>): CivPriorityEntry[] {
  const entries: CivPriorityEntry[] = []
  for (const tier of PRIORITY_TIERS) {
    for (const civId of groups[tier] ?? []) {
      entries.push({ civId, tier })
    }
  }
  return entries
}

function mapPreset(mapName: string, groups: Partial<Record<PriorityTier, string[]>>): MapPriorityPreset {
  return {
    id: presetIdForMap(mapName),
    name: mapName,
    mapName,
    entries: entriesFromTiers(groups),
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

export function getDefaultMapPresets(): MapPriorityPreset[] {
  return [
    mapPreset('Arabia', {
      S: ['Mayans', 'Huns'],
      A: ['Chinese', 'Vikings', 'Malians', 'Mongols'],
      B: ['Aztecs', 'Britons', 'Ethiopians', 'Gurjaras', 'Hindustanis', 'Poles'],
      C: ['Berbers', 'Bulgarians', 'Franks', 'Japanese', 'Portuguese', 'Tatars'],
      D: ['Bohemians', 'Burgundians', 'Italians', 'Slavs'],
    }),
    mapPreset('Arena', {
      S: ['Teutons', 'Byzantines'],
      A: ['Celts', 'Slavs', 'Vikings', 'Japanese'],
      B: ['Britons', 'Chinese', 'Franks', 'Goths', 'Koreans', 'Malians'],
      C: ['Aztecs', 'Bulgarians', 'Ethiopians', 'Incas', 'Magyars', 'Persians'],
      D: ['Bohemians', 'Burgundians', 'Italians', 'Portuguese'],
    }),
    mapPreset('Nomad', {
      S: ['Chinese', 'Vikings'],
      A: ['Persians', 'Italians', 'Spanish', 'Malians'],
      B: ['Berbers', 'Britons', 'Ethiopians', 'Huns', 'Japanese', 'Koreans'],
      C: ['Aztecs', 'Byzantines', 'Franks', 'Goths', 'Magyars', 'Slavs'],
      D: ['Bohemians', 'Burgundians', 'Incas', 'Portuguese'],
    }),
    mapPreset('Hideout', {
      S: ['Mayans', 'Britons'],
      A: ['Ethiopians', 'Vikings', 'Chinese', 'Malians'],
      B: ['Aztecs', 'Berbers', 'Bulgarians', 'Franks', 'Gurjaras', 'Japanese'],
      C: ['Byzantines', 'Huns', 'Incas', 'Italians', 'Koreans', 'Persians'],
      D: ['Bohemians', 'Burgundians', 'Goths', 'Portuguese'],
    }),
    mapPreset('Black Forest', {
      S: ['Teutons', 'Slavs'],
      A: ['Franks', 'Celts', 'Byzantines', 'Magyars'],
      B: ['Britons', 'Chinese', 'Goths', 'Japanese', 'Koreans', 'Malians'],
      C: ['Aztecs', 'Bulgarians', 'Ethiopians', 'Huns', 'Incas', 'Persians'],
      D: ['Bohemians', 'Burgundians', 'Italians', 'Portuguese'],
    }),
    mapPreset('Fortress', {
      S: ['Chinese', 'Mayans'],
      A: ['Britons', 'Ethiopians', 'Malians', 'Vikings'],
      B: ['Aztecs', 'Berbers', 'Bulgarians', 'Franks', 'Japanese', 'Koreans'],
      C: ['Byzantines', 'Goths', 'Huns', 'Incas', 'Italians', 'Persians'],
      D: ['Bohemians', 'Burgundians', 'Magyars', 'Portuguese'],
    }),
    mapPreset('Acropolis', {
      S: ['Chinese', 'Mayans'],
      A: ['Britons', 'Ethiopians', 'Malians', 'Vikings'],
      B: ['Aztecs', 'Berbers', 'Bulgarians', 'Franks', 'Japanese', 'Koreans'],
      C: ['Byzantines', 'Goths', 'Huns', 'Incas', 'Italians', 'Persians'],
      D: ['Bohemians', 'Burgundians', 'Magyars', 'Slavs'],
    }),
    mapPreset('Gold Rush', {
      S: ['Malians', 'Mayans'],
      A: ['Chinese', 'Ethiopians', 'Huns', 'Vikings'],
      B: ['Aztecs', 'Berbers', 'Britons', 'Bulgarians', 'Franks', 'Japanese'],
      C: ['Byzantines', 'Goths', 'Incas', 'Italians', 'Koreans', 'Persians'],
      D: ['Bohemians', 'Burgundians', 'Magyars', 'Portuguese'],
    }),
  ]
}
