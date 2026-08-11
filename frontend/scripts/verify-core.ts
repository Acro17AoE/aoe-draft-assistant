/**
 * Smoke tests for lib helpers. Run: npx tsx scripts/verify-core.ts
 */
import './browser-mock.ts'
import assert from 'node:assert/strict'
import {
  assignmentTargetMatches,
  resolveMapDisplaysFromPicks,
  uniqueMapNames,
} from '../src/lib/maps'
import { compareTierEntries, moveCivInTierList, normalizeTierEntries } from '../src/lib/tiers'
import { maxGamesForSetFormat } from '../src/lib/results'
import { assignMapTarget, countAssignmentsForMap } from '../src/lib/civMapAssignments'
import {
  beginWorkspaceHydration,
  endWorkspaceHydration,
  isWorkspaceHydrating,
  LOCAL_STORAGE_KEYS,
  writeLocalKey,
} from '../src/lib/cloudStorage'

const displays = resolveMapDisplaysFromPicks(['Black Forest', 'Black Forest', 'Black Forest'])
assert.equal(displays.length, 3)
assert.equal(displays[0].id, 'Black Forest::1')
assert.equal(displays[2].id, 'Black Forest::3')

assert.equal(uniqueMapNames(['Black Forest', 'Black Forest', 'Arabia']).length, 2)
assert(assignmentTargetMatches('Black Forest::1', 'Black Forest::1'))
assert(!assignmentTargetMatches('Black Forest::1', 'Black Forest::2'))

assert.equal(maxGamesForSetFormat('PA3'), 3)
assert.equal(maxGamesForSetFormat('BO5'), 5)

const tierEntries = normalizeTierEntries([
  { civId: 'Britons', tier: 'S', tierRank: 1 },
  { civId: 'Franks', tier: 'S', tierRank: 0 },
])
assert.deepEqual(
  tierEntries.filter((e) => e.tier === 'S').sort(compareTierEntries).map((e) => e.civId),
  ['Franks', 'Britons'],
)

const reordered = moveCivInTierList(
  [
    { civId: 'Britons', tier: 'A', tierRank: 0 },
    { civId: 'Franks', tier: 'A', tierRank: 1 },
  ],
  'Franks',
  'A',
  0,
)
assert.deepEqual(
  reordered.filter((e) => e.tier === 'A').sort(compareTierEntries).map((e) => e.civId),
  ['Franks', 'Britons'],
)

const slotMaps = ['Black Forest::1', 'Black Forest::2', 'Arabia']
assert.equal(assignMapTarget('Black Forest::2', slotMaps), 'Black Forest::2')
assert.equal(
  countAssignmentsForMap(
    ['civ1', 'civ2'],
    'Black Forest::1',
    { civ1: 'Black Forest::1', civ2: 'Black Forest::2' },
    slotMaps,
  ),
  1,
)

beginWorkspaceHydration()
assert.equal(isWorkspaceHydrating(), true)
writeLocalKey(LOCAL_STORAGE_KEYS.MAP_SESSION, '{"mode":"standard"}')
endWorkspaceHydration()
assert.equal(isWorkspaceHydrating(), false)

console.log('verify-core: all checks passed')
