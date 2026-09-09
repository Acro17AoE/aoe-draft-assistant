import type { CivPriorityEntry, PriorityTier } from '../types/draft'
import { civSlug, resolveCivDisplayName } from './civs'
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

/** Same-origin map emblem proxy for PNG export. */
export function exportMapImageUrl(mapName: string): string | null {
  const trimmed = mapName.trim()
  if (!trimmed) return null
  // v=3 busts sticky caches from earlier wrong Arena/Arabia resolution.
  return `/api/assets/map-image?name=${encodeURIComponent(trimmed)}&v=3`
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForMapArt(root: HTMLElement, mapName: string): Promise<void> {
  const trimmed = mapName.trim()
  if (!trimmed) return

  const expected = encodeURIComponent(trimmed)
  const deadline = Date.now() + 8000

  while (Date.now() < deadline) {
    const img = root.querySelector<HTMLImageElement>('.tierlist-export-map-art')
    if (img) {
      const src = img.getAttribute('src') ?? ''
      if (src.includes(expected) && img.complete && img.naturalWidth > 0) {
        try {
          await img.decode()
        } catch {
          // decode can reject for broken images; still attempt capture
        }
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
