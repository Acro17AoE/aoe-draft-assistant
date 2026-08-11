/**
 * Simulates join hydration: stale pending upload must not fire while hydrating.
 * Run: npx tsx scripts/verify-sync-guards.ts
 */
import './browser-mock.ts'
import assert from 'node:assert/strict'
import {
  beginWorkspaceHydration,
  cancelPendingCloudSaves,
  endWorkspaceHydration,
  getStorageScope,
  LOCAL_STORAGE_KEYS,
  readLocalKey,
  setActiveWorkspaceSlug,
  setAuthToken,
  setWorkspaceCache,
  writeLocalKey,
  hydrateWorkspaceDocuments,
} from '../src/lib/cloudStorage'

const uploads: Array<{ docKey: string; content: unknown }> = []

globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input)
  if (init?.method === 'PUT' && url.includes('/documents/')) {
    const docKey = url.split('/documents/')[1] ?? ''
    uploads.push({ docKey, content: JSON.parse(String(init.body)) })
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  }
  if (url.includes('/documents') && (!init?.method || init.method === 'GET')) {
    return new Response(
      JSON.stringify({
        documents: [
          {
            key: 'map-session',
            content: {
              mode: 'single-map',
              ownTeamName: 'Server Team',
              singleMap: 'Arena',
              singleMapFormat: 'BO5',
              started: true,
            },
          },
        ],
      }),
      { status: 200 },
    )
  }
  return new Response('{}', { status: 200 })
}

setAuthToken('test-token')
setActiveWorkspaceSlug('verify-slug')
setWorkspaceCache({
  id: 'ws-verify',
  name: 'Verify',
  share_slug: 'verify-slug',
  role: 'editor',
  owner_id: 'owner-1',
  updated_at: new Date().toISOString(),
})

assert.equal(getStorageScope(), 'workspace')

// Stale personal-era write scheduled before join
writeLocalKey(LOCAL_STORAGE_KEYS.MAP_SESSION, JSON.stringify({ mode: 'standard', ownTeamName: 'Stale' }))
cancelPendingCloudSaves()
uploads.length = 0

beginWorkspaceHydration()

// Simulate activateWorkspace join path: clear local workspace cache, pull server
const physical = 'aoe-draft-assistant.workspace.map-session'
globalThis.localStorage.removeItem(physical)

await hydrateWorkspaceDocuments('ws-verify')

const loaded = JSON.parse(readLocalKey(LOCAL_STORAGE_KEYS.MAP_SESSION)!)
assert.equal(loaded.ownTeamName, 'Server Team')
assert.equal(loaded.singleMap, 'Arena')

// Stale write during hydration must not upload
writeLocalKey(LOCAL_STORAGE_KEYS.MAP_SESSION, JSON.stringify({ mode: 'standard', ownTeamName: 'Stale 2' }))
assert.equal(uploads.length, 0, 'uploads blocked during hydration')

endWorkspaceHydration()

// After hydration, intentional save should upload
writeLocalKey(
  LOCAL_STORAGE_KEYS.MAP_SESSION,
  JSON.stringify({ mode: 'single-map', ownTeamName: 'After Join', singleMap: 'Arena', singleMapFormat: 'BO5', started: true }),
)

await new Promise((resolve) => setTimeout(resolve, 700))
assert.equal(uploads.length, 1, 'upload allowed after hydration ends')
assert.equal(uploads[0].docKey, 'map-session')

console.log('verify-sync-guards: all checks passed')
