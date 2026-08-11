/** Approximate historical placements on a stylized 1000×520 world map (viewBox). */

export type CivAtlasRegion =
  | 'Europe'
  | 'Middle East'
  | 'Asia'
  | 'Americas'
  | 'Africa'

export interface CivAtlasEntry {
  civ: string
  region: CivAtlasRegion
  /** 0–1000 map X */
  x: number
  /** 0–520 map Y */
  y: number
}

export const CIV_ATLAS_REGIONS: CivAtlasRegion[] = [
  'Europe',
  'Middle East',
  'Asia',
  'Americas',
  'Africa',
]

export const CIV_ATLAS: CivAtlasEntry[] = [
  { civ: 'Vikings', region: 'Europe', x: 490, y: 105 },
  { civ: 'Britons', region: 'Europe', x: 445, y: 145 },
  { civ: 'Celts', region: 'Europe', x: 430, y: 155 },
  { civ: 'Franks', region: 'Europe', x: 470, y: 175 },
  { civ: 'Burgundians', region: 'Europe', x: 480, y: 185 },
  { civ: 'Teutons', region: 'Europe', x: 505, y: 165 },
  { civ: 'Goths', region: 'Europe', x: 525, y: 185 },
  { civ: 'Italians', region: 'Europe', x: 515, y: 210 },
  { civ: 'Sicilians', region: 'Europe', x: 525, y: 235 },
  { civ: 'Romans', region: 'Europe', x: 530, y: 220 },
  { civ: 'Spanish', region: 'Europe', x: 445, y: 220 },
  { civ: 'Portuguese', region: 'Europe', x: 430, y: 230 },
  { civ: 'Bohemians', region: 'Europe', x: 530, y: 170 },
  { civ: 'Poles', region: 'Europe', x: 545, y: 155 },
  { civ: 'Lithuanians', region: 'Europe', x: 560, y: 140 },
  { civ: 'Slavs', region: 'Europe', x: 575, y: 150 },
  { civ: 'Magyars', region: 'Europe', x: 555, y: 185 },
  { civ: 'Bulgarians', region: 'Europe', x: 565, y: 205 },
  { civ: 'Byzantines', region: 'Europe', x: 575, y: 220 },
  { civ: 'Huns', region: 'Europe', x: 590, y: 175 },
  { civ: 'Cumans', region: 'Europe', x: 620, y: 165 },

  { civ: 'Georgians', region: 'Middle East', x: 635, y: 200 },
  { civ: 'Armenians', region: 'Middle East', x: 645, y: 210 },
  { civ: 'Persians', region: 'Middle East', x: 665, y: 230 },
  { civ: 'Saracens', region: 'Middle East', x: 605, y: 245 },
  { civ: 'Turks', region: 'Middle East', x: 590, y: 230 },
  { civ: 'Tatars', region: 'Middle East', x: 680, y: 175 },

  { civ: 'Berbers', region: 'Africa', x: 470, y: 265 },
  { civ: 'Malians', region: 'Africa', x: 455, y: 310 },
  { civ: 'Ethiopians', region: 'Africa', x: 585, y: 320 },

  { civ: 'Hindustanis', region: 'Asia', x: 720, y: 255 },
  { civ: 'Gurjaras', region: 'Asia', x: 705, y: 250 },
  { civ: 'Bengalis', region: 'Asia', x: 750, y: 265 },
  { civ: 'Dravidians', region: 'Asia', x: 725, y: 300 },
  { civ: 'Burmese', region: 'Asia', x: 780, y: 275 },
  { civ: 'Khmer', region: 'Asia', x: 800, y: 295 },
  { civ: 'Malay', region: 'Asia', x: 815, y: 330 },
  { civ: 'Vietnamese', region: 'Asia', x: 820, y: 280 },
  { civ: 'Chinese', region: 'Asia', x: 835, y: 230 },
  { civ: 'Shu', region: 'Asia', x: 825, y: 250 },
  { civ: 'Wei', region: 'Asia', x: 845, y: 215 },
  { civ: 'Wu', region: 'Asia', x: 855, y: 245 },
  { civ: 'Koreans', region: 'Asia', x: 880, y: 210 },
  { civ: 'Japanese', region: 'Asia', x: 910, y: 220 },
  { civ: 'Mongols', region: 'Asia', x: 780, y: 175 },
  { civ: 'Khitans', region: 'Asia', x: 820, y: 175 },
  { civ: 'Jurchens', region: 'Asia', x: 860, y: 175 },

  { civ: 'Aztecs', region: 'Americas', x: 195, y: 275 },
  { civ: 'Mayans', region: 'Americas', x: 220, y: 295 },
  { civ: 'Incas', region: 'Americas', x: 255, y: 365 },
  { civ: 'Mapuche', region: 'Americas', x: 250, y: 420 },
  { civ: 'Muisca', region: 'Americas', x: 245, y: 340 },
  { civ: 'Tupi', region: 'Americas', x: 300, y: 380 },
]

export function atlasEntryForCiv(civ: string): CivAtlasEntry | undefined {
  return CIV_ATLAS.find((entry) => entry.civ.toLowerCase() === civ.toLowerCase())
}
