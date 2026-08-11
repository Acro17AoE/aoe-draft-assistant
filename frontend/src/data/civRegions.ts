/** Approximate historical heartlands for atlas placement (WGS84). */

export type CivAtlasRegion =
  | 'Europe'
  | 'Middle East'
  | 'Asia'
  | 'Americas'
  | 'Africa'

export interface CivAtlasEntry {
  civ: string
  region: CivAtlasRegion
  /** Degrees north */
  lat: number
  /** Degrees east */
  lon: number
}

export const CIV_ATLAS_REGIONS: CivAtlasRegion[] = [
  'Europe',
  'Middle East',
  'Asia',
  'Americas',
  'Africa',
]

/** Equirectangular projection into map pixel space (default: /maps/world.svg). */
export function projectLatLon(
  lat: number,
  lon: number,
  width = 950,
  height = 620,
): { x: number; y: number } {
  return {
    x: ((lon + 180) / 360) * width,
    y: ((90 - lat) / 180) * height,
  }
}

export const CIV_ATLAS: CivAtlasEntry[] = [
  { civ: 'Vikings', region: 'Europe', lat: 60.5, lon: 10.5 },
  { civ: 'Britons', region: 'Europe', lat: 52.5, lon: -1.5 },
  { civ: 'Celts', region: 'Europe', lat: 53.5, lon: -7.5 },
  { civ: 'Franks', region: 'Europe', lat: 48.5, lon: 2.5 },
  { civ: 'Burgundians', region: 'Europe', lat: 47.0, lon: 5.0 },
  { civ: 'Teutons', region: 'Europe', lat: 51.0, lon: 10.0 },
  { civ: 'Goths', region: 'Europe', lat: 45.0, lon: 20.0 },
  { civ: 'Italians', region: 'Europe', lat: 43.5, lon: 11.5 },
  { civ: 'Sicilians', region: 'Europe', lat: 37.5, lon: 14.0 },
  { civ: 'Romans', region: 'Europe', lat: 41.9, lon: 12.5 },
  { civ: 'Spanish', region: 'Europe', lat: 40.4, lon: -3.7 },
  { civ: 'Portuguese', region: 'Europe', lat: 39.0, lon: -8.5 },
  { civ: 'Bohemians', region: 'Europe', lat: 50.1, lon: 14.4 },
  { civ: 'Poles', region: 'Europe', lat: 52.2, lon: 21.0 },
  { civ: 'Lithuanians', region: 'Europe', lat: 54.7, lon: 25.3 },
  { civ: 'Slavs', region: 'Europe', lat: 55.8, lon: 37.6 },
  { civ: 'Magyars', region: 'Europe', lat: 47.5, lon: 19.0 },
  { civ: 'Bulgarians', region: 'Europe', lat: 42.7, lon: 25.5 },
  { civ: 'Byzantines', region: 'Europe', lat: 41.0, lon: 29.0 },
  { civ: 'Huns', region: 'Europe', lat: 47.0, lon: 28.0 },
  { civ: 'Cumans', region: 'Europe', lat: 48.0, lon: 35.0 },

  { civ: 'Georgians', region: 'Middle East', lat: 41.7, lon: 44.8 },
  { civ: 'Armenians', region: 'Middle East', lat: 40.2, lon: 44.5 },
  { civ: 'Persians', region: 'Middle East', lat: 32.5, lon: 53.0 },
  { civ: 'Saracens', region: 'Middle East', lat: 31.8, lon: 35.2 },
  { civ: 'Turks', region: 'Middle East', lat: 39.9, lon: 32.9 },
  { civ: 'Tatars', region: 'Middle East', lat: 46.0, lon: 50.0 },

  { civ: 'Berbers', region: 'Africa', lat: 33.5, lon: -5.0 },
  { civ: 'Malians', region: 'Africa', lat: 12.6, lon: -8.0 },
  { civ: 'Ethiopians', region: 'Africa', lat: 9.0, lon: 38.7 },

  { civ: 'Hindustanis', region: 'Asia', lat: 27.0, lon: 78.0 },
  { civ: 'Gurjaras', region: 'Asia', lat: 24.5, lon: 72.5 },
  { civ: 'Bengalis', region: 'Asia', lat: 23.8, lon: 90.4 },
  { civ: 'Dravidians', region: 'Asia', lat: 11.0, lon: 78.5 },
  { civ: 'Burmese', region: 'Asia', lat: 21.9, lon: 96.1 },
  { civ: 'Khmer', region: 'Asia', lat: 13.4, lon: 103.9 },
  { civ: 'Malay', region: 'Asia', lat: 3.1, lon: 101.7 },
  { civ: 'Vietnamese', region: 'Asia', lat: 21.0, lon: 105.8 },
  { civ: 'Chinese', region: 'Asia', lat: 34.3, lon: 108.9 },
  { civ: 'Shu', region: 'Asia', lat: 30.6, lon: 104.1 },
  { civ: 'Wei', region: 'Asia', lat: 34.8, lon: 113.6 },
  { civ: 'Wu', region: 'Asia', lat: 32.0, lon: 118.8 },
  { civ: 'Koreans', region: 'Asia', lat: 37.6, lon: 127.0 },
  { civ: 'Japanese', region: 'Asia', lat: 35.0, lon: 136.0 },
  { civ: 'Mongols', region: 'Asia', lat: 47.9, lon: 106.9 },
  { civ: 'Khitans', region: 'Asia', lat: 43.0, lon: 118.0 },
  { civ: 'Jurchens', region: 'Asia', lat: 45.0, lon: 126.0 },

  { civ: 'Aztecs', region: 'Americas', lat: 19.4, lon: -99.1 },
  { civ: 'Mayans', region: 'Americas', lat: 17.2, lon: -89.6 },
  { civ: 'Incas', region: 'Americas', lat: -13.5, lon: -72.0 },
  { civ: 'Mapuche', region: 'Americas', lat: -38.7, lon: -72.5 },
  { civ: 'Muisca', region: 'Americas', lat: 5.0, lon: -74.0 },
  { civ: 'Tupi', region: 'Americas', lat: -15.8, lon: -47.9 },
]

export function atlasEntryForCiv(civ: string): CivAtlasEntry | undefined {
  return CIV_ATLAS.find((entry) => entry.civ.toLowerCase() === civ.toLowerCase())
}
