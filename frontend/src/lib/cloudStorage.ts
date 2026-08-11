import { mergeCivMapAssignmentDocuments, type CivMapAssignmentState } from './civMapAssignments'

export const DOC_KEYS = {
  PRESET_TOURNAMENTS: 'preset-tournaments',
  SHARED_PRESET_TOURNAMENTS: 'shared-preset-tournaments',
  RESULTS: 'results',
  CIV_DRAFT_SETTINGS: 'civ-draft-settings',
  UI_PREFERENCES: 'ui-preferences',
  MAP_SESSION: 'map-session',
  CIV_SESSION: 'civ-session',
  CIV_MAP_ASSIGNMENTS: 'civ-map-assignments',
} as const

export type DocKey = (typeof DOC_KEYS)[keyof typeof DOC_KEYS]

export const LOCAL_STORAGE_KEYS = {
  PRESET_TOURNAMENTS: 'aoe-draft-assistant.preset-tournaments',
  SHARED_PRESET_TOURNAMENTS: 'aoe-draft-assistant.shared-preset-tournaments',
  RESULTS: 'aoe-draft-assistant.results',
  CIV_DRAFT_SETTINGS: 'aoe-draft-assistant.civ-draft-settings',
  UI_PREFERENCES: 'aoe-draft-assistant.ui-preferences',
  MAP_SESSION: 'aoe-draft-assistant.map-session',
  CIV_SESSION: 'aoe-draft-assistant.civ-session',
  CIV_MAP_ASSIGNMENTS: 'aoe-draft-assistant.civ-map-assignments',
  AUTH_TOKEN: 'aoe-draft-assistant.auth-token',
  ACTIVE_WORKSPACE_SLUG: 'aoe-draft-assistant.active-workspace-slug',
} as const

const LOCAL_TO_DOC: Record<string, DocKey> = {
  [LOCAL_STORAGE_KEYS.PRESET_TOURNAMENTS]: DOC_KEYS.PRESET_TOURNAMENTS,
  [LOCAL_STORAGE_KEYS.SHARED_PRESET_TOURNAMENTS]: DOC_KEYS.SHARED_PRESET_TOURNAMENTS,
  [LOCAL_STORAGE_KEYS.RESULTS]: DOC_KEYS.RESULTS,
  [LOCAL_STORAGE_KEYS.CIV_DRAFT_SETTINGS]: DOC_KEYS.CIV_DRAFT_SETTINGS,
  [LOCAL_STORAGE_KEYS.UI_PREFERENCES]: DOC_KEYS.UI_PREFERENCES,
  [LOCAL_STORAGE_KEYS.MAP_SESSION]: DOC_KEYS.MAP_SESSION,
  [LOCAL_STORAGE_KEYS.CIV_SESSION]: DOC_KEYS.CIV_SESSION,
  [LOCAL_STORAGE_KEYS.CIV_MAP_ASSIGNMENTS]: DOC_KEYS.CIV_MAP_ASSIGNMENTS,
}

/** Draft session data synced in shared workspaces — kept separate from personal settings. */
const SESSION_LOCAL_KEYS = new Set<string>([
  LOCAL_STORAGE_KEYS.MAP_SESSION,
  LOCAL_STORAGE_KEYS.CIV_SESSION,
  LOCAL_STORAGE_KEYS.CIV_MAP_ASSIGNMENTS,
])

const WORKSPACE_DOC_KEYS = new Set<DocKey>([
  DOC_KEYS.SHARED_PRESET_TOURNAMENTS,
  DOC_KEYS.MAP_SESSION,
  DOC_KEYS.CIV_SESSION,
  DOC_KEYS.CIV_MAP_ASSIGNMENTS,
])

const WORKSPACE_LOCAL_KEYS = new Set<string>([
  LOCAL_STORAGE_KEYS.SHARED_PRESET_TOURNAMENTS,
  ...SESSION_LOCAL_KEYS,
])

function workspacePhysicalKey(logicalKey: string): string {
  return logicalKey.replace('aoe-draft-assistant.', 'aoe-draft-assistant.workspace.')
}

function resolvePhysicalKey(logicalKey: string): string {
  if (scope === 'workspace' && WORKSPACE_LOCAL_KEYS.has(logicalKey)) {
    return workspacePhysicalKey(logicalKey)
  }
  return logicalKey
}

export function isSharedPresetStoreKey(key: string): boolean {
  return key === LOCAL_STORAGE_KEYS.SHARED_PRESET_TOURNAMENTS
}

export const CLOUD_HYDRATED = 'aoe-cloud-hydrated'

export interface CloudHydratedDetail {
  keys: DocKey[]
}

export interface WorkspaceDocumentPayload {
  key: DocKey
  content: unknown
  updated_at: string
  updated_by_user_id?: string
}

export interface WorkspaceInfo {
  id: string
  name: string
  share_slug: string
  role: string
  owner_id: string
  updated_at: string
}

export interface WorkspaceMemberInfo {
  user_id: string
  display_name: string
  email: string
  role: string
}

type StorageScope = 'local' | 'user' | 'workspace'

const memory = new Map<string, string>()
const saveTimers = new Map<string, number>()

interface DocumentSyncMeta {
  localEditedAt: number
  lastUploadedAt: number | null
  lastAppliedServerAt: string | null
}

const syncMeta = new Map<string, DocumentSyncMeta>()

const CLOUD_SAVE_DEBOUNCE_MS = 300

let currentUserId: string | null = null

export function setCurrentUserId(userId: string | null): void {
  currentUserId = userId
}

export function getCurrentUserId(): string | null {
  return currentUserId
}

function getSyncMeta(localKey: string): DocumentSyncMeta {
  let meta = syncMeta.get(localKey)
  if (!meta) {
    meta = { localEditedAt: 0, lastUploadedAt: null, lastAppliedServerAt: null }
    syncMeta.set(localKey, meta)
  }
  return meta
}

function resetWorkspaceSyncMeta(): void {
  for (const localKey of WORKSPACE_LOCAL_KEYS) {
    syncMeta.delete(localKey)
  }
}

function localKeyForDocKey(docKey: DocKey): string | null {
  const docToLocal = docToLocalMap()
  return docToLocal[docKey] ?? null
}

export function hasPendingCloudSave(localKey?: string): boolean {
  if (localKey) return saveTimers.has(localKey)
  return saveTimers.size > 0
}

export function hasPendingSessionSave(): boolean {
  for (const key of SESSION_LOCAL_KEYS) {
    if (saveTimers.has(key)) return true
  }
  return false
}

function shouldApplyServerDocument(
  localKey: string,
  serverUpdatedAt: string,
  serverRaw: string,
): boolean {
  if (saveTimers.has(localKey)) return false

  const meta = getSyncMeta(localKey)
  if (meta.lastAppliedServerAt === serverUpdatedAt) return false

  const physicalKey = workspacePhysicalKey(localKey)
  const currentRaw = memory.get(physicalKey) ?? localStorage.getItem(physicalKey)
  if (currentRaw === serverRaw) {
    meta.lastAppliedServerAt = serverUpdatedAt
    return false
  }

  const serverTime = serverUpdatedAt ? Date.parse(serverUpdatedAt) : 0
  const lastUploaded = meta.lastUploadedAt ?? 0
  if (meta.localEditedAt > serverTime && meta.localEditedAt > lastUploaded) {
    return false
  }

  return true
}

function applyMergedCivMapAssignments(
  doc: WorkspaceDocumentPayload,
  localKey: string,
): DocKey | null {
  const physicalKey = workspacePhysicalKey(localKey)
  const currentRaw = memory.get(physicalKey) ?? localStorage.getItem(physicalKey)
  let current: Record<string, Partial<CivMapAssignmentState>> = {}
  if (currentRaw) {
    try {
      current = JSON.parse(currentRaw) as Record<string, Partial<CivMapAssignmentState>>
    } catch {
      current = {}
    }
  }

  const incoming = doc.content as Record<string, Partial<CivMapAssignmentState>>
  const merged = mergeCivMapAssignmentDocuments(current, incoming)
  const raw = JSON.stringify(merged)

  if (currentRaw === raw) {
    getSyncMeta(localKey).lastAppliedServerAt = doc.updated_at
    return null
  }

  const fromOtherUser = Boolean(
    doc.updated_by_user_id && currentUserId && doc.updated_by_user_id !== currentUserId,
  )

  memory.set(physicalKey, raw)
  localStorage.setItem(physicalKey, raw)

  const meta = getSyncMeta(localKey)
  meta.lastAppliedServerAt = doc.updated_at
  const serverTime = doc.updated_at ? Date.parse(doc.updated_at) : 0
  if (fromOtherUser || serverTime >= meta.localEditedAt) {
    meta.localEditedAt = Math.max(meta.localEditedAt, serverTime)
    meta.lastUploadedAt = Math.max(meta.lastUploadedAt ?? 0, serverTime)
  }

  return DOC_KEYS.CIV_MAP_ASSIGNMENTS
}

function applySingleWorkspaceDocument(doc: WorkspaceDocumentPayload): DocKey | null {
  if (!WORKSPACE_DOC_KEYS.has(doc.key)) return null
  const localKey = localKeyForDocKey(doc.key)
  if (!localKey || doc.content == null) return null

  if (doc.key === DOC_KEYS.CIV_MAP_ASSIGNMENTS) {
    return applyMergedCivMapAssignments(doc, localKey)
  }

  const raw = JSON.stringify(doc.content)
  if (!shouldApplyServerDocument(localKey, doc.updated_at, raw)) return null

  const physicalKey = workspacePhysicalKey(localKey)
  memory.set(physicalKey, raw)
  localStorage.setItem(physicalKey, raw)

  const meta = getSyncMeta(localKey)
  meta.lastAppliedServerAt = doc.updated_at
  const serverTime = doc.updated_at ? Date.parse(doc.updated_at) : 0
  if (serverTime >= meta.localEditedAt) {
    meta.localEditedAt = serverTime
    meta.lastUploadedAt = serverTime
  }
  return doc.key
}

function dispatchCloudHydrated(keys: DocKey[]): void {
  if (!keys.length) return
  window.dispatchEvent(new CustomEvent<CloudHydratedDetail>(CLOUD_HYDRATED, { detail: { keys } }))
}

export function cloudHydratedIncludesKey(event: Event, key: DocKey): boolean {
  const detail = (event as CustomEvent<CloudHydratedDetail | undefined>).detail
  return !detail?.keys?.length || detail.keys.includes(key)
}

/** Blocks cloud uploads while workspace data is being loaded (join / create). */
let workspaceHydrating = false

let scope: StorageScope = 'local'
let authToken: string | null = null
let workspaceSlug: string | null = null

export function getAuthToken(): string | null {
  return authToken ?? localStorage.getItem(LOCAL_STORAGE_KEYS.AUTH_TOKEN)
}

export function setAuthToken(token: string | null): void {
  authToken = token
  if (token) localStorage.setItem(LOCAL_STORAGE_KEYS.AUTH_TOKEN, token)
  else localStorage.removeItem(LOCAL_STORAGE_KEYS.AUTH_TOKEN)
  updateScope()
}

export function setActiveWorkspaceSlug(slug: string | null): void {
  workspaceSlug = slug
  if (slug) localStorage.setItem(LOCAL_STORAGE_KEYS.ACTIVE_WORKSPACE_SLUG, slug)
  else localStorage.removeItem(LOCAL_STORAGE_KEYS.ACTIVE_WORKSPACE_SLUG)
  updateScope()
}

export function getActiveWorkspaceSlug(): string | null {
  return workspaceSlug ?? localStorage.getItem(LOCAL_STORAGE_KEYS.ACTIVE_WORKSPACE_SLUG)
}

export function getActiveWorkspaceId(): string | null {
  return workspace?.id ?? null
}

let workspace: WorkspaceInfo | null = null

export function setWorkspaceCache(info: WorkspaceInfo | null): void {
  workspace = info
}

export function getWorkspaceCache(): WorkspaceInfo | null {
  return workspace
}

function updateScope(): void {
  if (workspaceSlug && authToken) scope = 'workspace'
  else if (authToken) scope = 'user'
  else scope = 'local'
}

export function getStorageScope(): StorageScope {
  return scope
}

export function isWorkspaceHydrating(): boolean {
  return workspaceHydrating
}

export function cancelPendingCloudSaves(): void {
  for (const timer of saveTimers.values()) {
    window.clearTimeout(timer)
  }
  saveTimers.clear()
}

export function beginWorkspaceHydration(): void {
  workspaceHydrating = true
  cancelPendingCloudSaves()
  resetWorkspaceSyncMeta()
}

export function endWorkspaceHydration(): void {
  workspaceHydrating = false
}

export function readLocalKey(key: string): string | null {
  const physicalKey = resolvePhysicalKey(key)
  if (memory.has(physicalKey)) return memory.get(physicalKey)!
  const raw = localStorage.getItem(physicalKey)
  if (raw != null) memory.set(physicalKey, raw)
  return raw
}

export function writeLocalKey(key: string, value: string): void {
  const physicalKey = resolvePhysicalKey(key)
  memory.set(physicalKey, value)
  localStorage.setItem(physicalKey, value)
  if (WORKSPACE_LOCAL_KEYS.has(key)) {
    getSyncMeta(key).localEditedAt = Date.now()
  }
  if (scope === 'local' || workspaceHydrating) return
  scheduleCloudSave(key)
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = getAuthToken()
  const headers = new Headers(init?.headers)
  headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return fetch(path, { ...init, headers })
}

function scheduleCloudSave(localKey: string): void {
  if (workspaceHydrating) return
  const docKey = LOCAL_TO_DOC[localKey]
  if (!docKey) return

  const existing = saveTimers.get(localKey)
  if (existing) window.clearTimeout(existing)

  saveTimers.set(
    localKey,
    window.setTimeout(() => {
      saveTimers.delete(localKey)
      const fresh = readLocalKey(localKey)
      if (!fresh) return
      void persistDocument(docKey, fresh, localKey)
    }, CLOUD_SAVE_DEBOUNCE_MS),
  )
}

async function persistDocument(docKey: DocKey, rawValue: string, localKey: string): Promise<void> {
  if (workspaceHydrating) return
  const token = getAuthToken()
  if (!token) return

  let content: unknown
  try {
    content = JSON.parse(rawValue)
  } catch {
    content = rawValue
  }

  const activeWorkspace = getWorkspaceCache()
  const path =
    scope === 'workspace' && activeWorkspace && WORKSPACE_DOC_KEYS.has(docKey)
      ? `/api/workspaces/${activeWorkspace.id}/documents/${docKey}`
      : `/api/user/documents/${docKey}`

  const response = await apiFetch(path, {
    method: 'PUT',
    body: JSON.stringify({ content }),
  })
  if (!response.ok) {
    console.warn('Cloud save failed', docKey, response.status)
    return
  }

  try {
    const payload = (await response.json()) as { updated_at?: string }
    if (payload.updated_at) {
      const meta = getSyncMeta(localKey)
      const uploadedAt = Date.parse(payload.updated_at)
      meta.lastUploadedAt = uploadedAt
      meta.lastAppliedServerAt = payload.updated_at
      if (meta.localEditedAt <= uploadedAt) {
        meta.localEditedAt = uploadedAt
      }
    }
  } catch {
    // ignore parse errors
  }
}

export async function hydrateUserDocuments(): Promise<void> {
  const response = await apiFetch('/api/user/documents')
  if (!response.ok) throw new Error('Failed to load cloud data')
  const payload = (await response.json()) as {
    documents: Array<{ key: DocKey; content: unknown }>
  }
  applyUserDocuments(payload.documents)
}

export async function hydrateWorkspaceDocuments(workspaceIdValue: string): Promise<void> {
  const response = await apiFetch(`/api/workspaces/${workspaceIdValue}/documents`)
  if (!response.ok) throw new Error('Failed to load shared workspace data')
  const payload = (await response.json()) as {
    documents: Array<{ key: DocKey; content: unknown; updated_at: string }>
  }
  applyWorkspaceDocuments(payload.documents)
}

export function applyWorkspaceDocumentUpdate(doc: WorkspaceDocumentPayload): void {
  const changedKey = applySingleWorkspaceDocument(doc)
  if (changedKey) dispatchCloudHydrated([changedKey])
}

function docToLocalMap(): Record<DocKey, string> {
  return Object.fromEntries(
    Object.entries(LOCAL_TO_DOC).map(([local, doc]) => [doc, local]),
  ) as Record<DocKey, string>
}

function applyUserDocuments(documents: Array<{ key: DocKey; content: unknown }>): void {
  const docToLocal = docToLocalMap()
  const changedKeys: DocKey[] = []

  for (const doc of documents) {
    if (WORKSPACE_DOC_KEYS.has(doc.key)) continue
    const localKey = docToLocal[doc.key]
    if (!localKey || doc.content == null) continue
    const raw = JSON.stringify(doc.content)
    const currentRaw = memory.get(localKey) ?? localStorage.getItem(localKey)
    if (currentRaw === raw) continue
    memory.set(localKey, raw)
    localStorage.setItem(localKey, raw)
    changedKeys.push(doc.key)
  }
  dispatchCloudHydrated(changedKeys)
}

function applyWorkspaceDocuments(
  documents: Array<{ key: DocKey; content: unknown; updated_at?: string }>,
): void {
  const changedKeys: DocKey[] = []

  for (const doc of documents) {
    const changedKey = applySingleWorkspaceDocument({
      key: doc.key,
      content: doc.content,
      updated_at: doc.updated_at ?? '',
    })
    if (changedKey) changedKeys.push(changedKey)
  }

  dispatchCloudHydrated(changedKeys)
}

export async function uploadLocalDocumentsIfEmpty(): Promise<void> {
  for (const [localKey, docKey] of Object.entries(LOCAL_TO_DOC)) {
    if (WORKSPACE_DOC_KEYS.has(docKey)) continue
    const raw = localStorage.getItem(localKey)
    if (!raw) continue

    const existing = await apiFetch(`/api/user/documents/${docKey}`)
    if (!existing.ok) continue
    const payload = (await existing.json()) as { content: unknown | null }
    if (payload.content != null) continue

    let content: unknown
    try {
      content = JSON.parse(raw)
    } catch {
      content = raw
    }
    await apiFetch(`/api/user/documents/${docKey}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    })
  }
}

export interface AuthUser {
  id: string
  email: string
  display_name: string
  is_admin?: boolean
}

export interface AuthResponse {
  access_token: string
  user: AuthUser
}

function apiErrorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== 'object' || !('detail' in body)) return fallback
  const detail = (body as { detail?: unknown }).detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) =>
        item && typeof item === 'object' && 'msg' in item ? String((item as { msg: unknown }).msg) : null,
      )
      .filter(Boolean)
    if (messages.length) return messages.join('; ')
  }
  return fallback
}

export async function loginRequest(email: string, password: string): Promise<AuthResponse> {
  const response = await apiFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  if (!response.ok) {
    let message = 'Login failed'
    try {
      message = apiErrorMessage(await response.json(), message)
    } catch {
      // ignore
    }
    throw new Error(message)
  }
  return response.json() as Promise<AuthResponse>
}

export async function registerRequest(
  email: string,
  password: string,
  displayName: string,
): Promise<AuthResponse> {
  const response = await apiFetch('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, display_name: displayName }),
  })
  if (!response.ok) {
    let message = 'Registration failed'
    try {
      message = apiErrorMessage(await response.json(), message)
    } catch {
      // ignore
    }
    throw new Error(message)
  }
  return response.json() as Promise<AuthResponse>
}

export async function fetchMe(): Promise<AuthUser> {
  const response = await apiFetch('/api/auth/me')
  if (!response.ok) throw new Error('Session expired')
  return response.json() as Promise<AuthUser>
}

export interface AdminUserEntry {
  display_name: string
  email: string
  created_at: string | null
}

export interface AdminUserListResponse {
  users: AdminUserEntry[]
  total: number
}

export interface AdminPeriodStats {
  page_views: number
  logins: number
  registrations: number
  civ_drafts: number
}

export interface AdminStatsResponse {
  periods: Record<string, AdminPeriodStats>
  users: AdminUserEntry[]
  total_users: number
}

export async function fetchAdminUsers(): Promise<AdminUserListResponse> {
  const response = await apiFetch('/api/admin/users')
  if (!response.ok) {
    let message = 'Failed to load signups'
    try {
      message = apiErrorMessage(await response.json(), message)
    } catch {
      // ignore
    }
    throw new Error(message)
  }
  return response.json() as Promise<AdminUserListResponse>
}

export async function fetchAdminStats(): Promise<AdminStatsResponse> {
  const response = await apiFetch('/api/admin/stats')
  if (!response.ok) {
    let message = 'Failed to load admin stats'
    try {
      message = apiErrorMessage(await response.json(), message)
    } catch {
      // ignore
    }
    throw new Error(message)
  }
  return response.json() as Promise<AdminStatsResponse>
}

export async function createWorkspace(name: string): Promise<WorkspaceInfo> {
  const response = await apiFetch('/api/workspaces', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
  if (!response.ok) throw new Error('Failed to create workspace')
  return response.json() as Promise<WorkspaceInfo>
}

export async function joinWorkspace(slug: string): Promise<WorkspaceInfo> {
  const response = await apiFetch(`/api/workspaces/share/${slug}/join`, { method: 'POST' })
  if (!response.ok) throw new Error('Failed to join workspace')
  return response.json() as Promise<WorkspaceInfo>
}

export async function listWorkspaces(): Promise<WorkspaceInfo[]> {
  const response = await apiFetch('/api/workspaces')
  if (!response.ok) throw new Error('Failed to list workspaces')
  const payload = (await response.json()) as { workspaces: WorkspaceInfo[] }
  return payload.workspaces
}

export async function fetchWorkspaceMembers(workspaceId: string): Promise<WorkspaceMemberInfo[]> {
  const response = await apiFetch(`/api/workspaces/${workspaceId}/members`)
  if (!response.ok) throw new Error('Failed to load session members')
  const payload = (await response.json()) as { members: WorkspaceMemberInfo[] }
  return payload.members
}

export async function leaveWorkspaceMembership(workspaceId: string): Promise<void> {
  const response = await apiFetch(`/api/workspaces/${workspaceId}/leave`, { method: 'POST' })
  if (!response.ok) {
    let message = 'Failed to leave session'
    try {
      message = apiErrorMessage(await response.json(), message)
    } catch {
      // ignore
    }
    throw new Error(message)
  }
}

export async function deleteWorkspace(workspaceId: string): Promise<void> {
  const response = await apiFetch(`/api/workspaces/${workspaceId}`, { method: 'DELETE' })
  if (!response.ok) {
    let message = 'Failed to end session'
    try {
      message = apiErrorMessage(await response.json(), message)
    } catch {
      // ignore
    }
    throw new Error(message)
  }
}

export function clearWorkspaceLocalData(options?: { notify?: boolean }): void {
  for (const logicalKey of WORKSPACE_LOCAL_KEYS) {
    const physicalKey = workspacePhysicalKey(logicalKey)
    memory.delete(physicalKey)
    localStorage.removeItem(physicalKey)
  }
  resetWorkspaceSyncMeta()
  if (options?.notify !== false) {
    dispatchCloudHydrated([...WORKSPACE_DOC_KEYS])
  }
}

export function parseShareSlugFromPath(): string | null {
  const match = window.location.pathname.match(/^\/share\/([^/]+)\/?$/)
  return match?.[1] ?? null
}

export function parseSessionSlugFromPath(): string | null {
  const match = window.location.pathname.match(/^\/session\/([^/]+)\/?$/)
  return match?.[1] ?? null
}

export function parseCollaborationSlugFromPath(): string | null {
  return parseSessionSlugFromPath() ?? parseShareSlugFromPath()
}

export function buildSessionUrl(slug: string): string {
  return `${window.location.origin}/session/${slug}`
}

export function buildShareUrl(slug: string): string {
  return buildSessionUrl(slug)
}

export function navigateToSession(slug: string, replace = false): void {
  const url = `/session/${slug}`
  if (replace) window.history.replaceState({}, '', url)
  else window.history.pushState({}, '', url)
}

export interface PresetImportOptions {
  mode: 'none' | 'all' | 'selected'
  tournamentIds?: string[]
}

export async function uploadWorkspaceDocument(
  workspaceIdValue: string,
  docKey: DocKey,
  content: unknown,
): Promise<void> {
  await apiFetch(`/api/workspaces/${workspaceIdValue}/documents/${docKey}`, {
    method: 'PUT',
    body: JSON.stringify({ content }),
  })
}

export async function seedWorkspaceFromLocal(
  workspaceIdValue: string,
  sharedPresetContent?: unknown,
): Promise<void> {
  for (const localKey of SESSION_LOCAL_KEYS) {
    const raw = localStorage.getItem(localKey)
    if (!raw) continue
    const docKey = LOCAL_TO_DOC[localKey]
    if (!docKey) continue
    let content: unknown
    try {
      content = JSON.parse(raw)
    } catch {
      content = raw
    }
    await uploadWorkspaceDocument(workspaceIdValue, docKey, content)
  }

  if (sharedPresetContent != null) {
    const raw = JSON.stringify(sharedPresetContent)
    const physicalKey = workspacePhysicalKey(LOCAL_STORAGE_KEYS.SHARED_PRESET_TOURNAMENTS)
    memory.set(physicalKey, raw)
    localStorage.setItem(physicalKey, raw)
    await uploadWorkspaceDocument(
      workspaceIdValue,
      DOC_KEYS.SHARED_PRESET_TOURNAMENTS,
      sharedPresetContent,
    )
  }

  await hydrateWorkspaceDocuments(workspaceIdValue)
}

export async function leaveWorkspaceMode(): Promise<void> {
  cancelPendingCloudSaves()
  setActiveWorkspaceSlug(null)
  setWorkspaceCache(null)
  updateScope()
  window.history.pushState({}, '', '/')
  if (getAuthToken()) await hydrateUserDocuments()
  dispatchCloudHydrated([...Object.values(DOC_KEYS)])
}

// Init scope from persisted token/workspace on module load
authToken = localStorage.getItem(LOCAL_STORAGE_KEYS.AUTH_TOKEN)
workspaceSlug = localStorage.getItem(LOCAL_STORAGE_KEYS.ACTIVE_WORKSPACE_SLUG)
updateScope()
