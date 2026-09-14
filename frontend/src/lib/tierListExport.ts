import type { CivPriorityEntry, PriorityTier } from '../types/draft'
import { civSlug, resolveCivDisplayName } from './civs'
import { localMapEmblemUrl, MAP_EMBLEM_PLACEHOLDER_URL } from './maps'
import { PRIORITY_TIERS, civIdsForTier, isPriorityTier } from './tiers'

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

/** Same-origin icons for export (CORS-safe with html-to-image). */
export function localCivIconUrl(civName: string): string {
  const slug = civSlug(resolveCivDisplayName(civName))
  return `/civs/${slug}.png`
}

export type ExportMapArt =
  | { kind: 'image'; src: string }
  | { kind: 'placeholder'; src: string }

/** Bundled map emblem, or "?" placeholder when the map has no local art. */
export function exportMapArt(mapName: string): ExportMapArt {
  const local = localMapEmblemUrl(mapName)
  if (local) return { kind: 'image', src: local }
  return { kind: 'placeholder', src: MAP_EMBLEM_PLACEHOLDER_URL }
}

/** @deprecated Prefer exportMapArt — kept for call sites that only need a URL. */
export function exportMapImageUrl(mapName: string): string | null {
  return localMapEmblemUrl(mapName)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForMapArt(root: HTMLElement, mapName: string): Promise<void> {
  const trimmed = mapName.trim()
  if (!trimmed) return

  const deadline = Date.now() + 8000

  while (Date.now() < deadline) {
    const img = root.querySelector<HTMLImageElement>('.tierlist-export-map-art')
    if (img) {
      const tagged = (img.getAttribute('data-map-name') ?? '').trim()
      if (tagged === trimmed && img.complete && img.naturalWidth > 0) {
        try {
          await img.decode()
        } catch {
          // decode can reject for broken images; still attempt capture
        }
        return
      }
    }
    // Placeholder path: no img, but data attribute on the box
    const box = root.querySelector<HTMLElement>('.tierlist-export-map-placeholder')
    if (box && (box.getAttribute('data-map-name') ?? '').trim() === trimmed) {
      const placeholderImg = box.querySelector('img')
      if (!placeholderImg || (placeholderImg.complete && placeholderImg.naturalWidth > 0)) {
        return
      }
    }
    await sleep(40)
  }
}

function waitForImages(root: HTMLElement): Promise<void> {
  const images = [...root.querySelectorAll('img')]
  return Promise.all(
    images.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete && img.naturalWidth > 0) {
            img
              .decode()
              .catch(() => undefined)
              .finally(() => resolve())
            return
          }
          const done = () => resolve()
          img.addEventListener('load', done, { once: true })
          img.addEventListener('error', done, { once: true })
        }),
    ),
  ).then(() => undefined)
}

/** Capture the live tier-list export DOM (same styles as the editor). */
export async function downloadTierListPng(
  element: HTMLElement | null,
  title: string,
  mapName: string,
  _entries?: CivPriorityEntry[],
): Promise<void> {
  if (!element) throw new Error('Export surface missing')

  // Let React commit the current mapName onto the off-screen export surface.
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  await waitForMapArt(element, mapName)
  await waitForImages(element)
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

  const { toPng } = await import('html-to-image')
  const dataUrl = await toPng(element, {
    cacheBust: true,
    pixelRatio: 2,
    backgroundColor: '#0c0012',
  })

  const link = document.createElement('a')
  const base = [slugify(title) || 'tierlist', slugify(mapName) || 'map'].filter(Boolean).join('-')
  link.download = `${base || 'tierlist'}.png`
  link.href = dataUrl
  link.click()
}

export function buildTierRowsForExport(entries: CivPriorityEntry[]): Array<{
  tier: PriorityTier
  civIds: string[]
}> {
  return PRIORITY_TIERS.map((tier) => ({
    tier,
    civIds: civIdsForTier(entries, tier),
  })).filter((row) => row.civIds.length > 0)
}

export function hasRankedCivs(entries: CivPriorityEntry[]): boolean {
  return entries.some((entry) => entry.tier && isPriorityTier(entry.tier))
}

export { civIconUrl } from './civs'
