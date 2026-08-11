import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from './AuthProvider'
import {
  beginWorkspaceHydration,
  buildSessionUrl,
  cancelPendingCloudSaves,
  clearWorkspaceLocalData,
  createWorkspace,
  deleteWorkspace,
  endWorkspaceHydration,
  fetchWorkspaceMembers,
  getActiveWorkspaceSlug,
  hydrateWorkspaceDocuments,
  isWorkspaceHydrating,
  joinWorkspace,
  leaveWorkspaceMembership,
  leaveWorkspaceMode,
  listWorkspaces,
  navigateToSession,
  parseCollaborationSlugFromPath,
  seedWorkspaceFromLocal,
  setActiveWorkspaceSlug,
  setWorkspaceCache,
  type PresetImportOptions,
  type WorkspaceInfo,
  type WorkspaceMemberInfo,
} from '../lib/cloudStorage'
import { useWorkspaceStream } from '../lib/useWorkspaceStream'
import {
  buildSharedPresetStoreFromImport,
  loadPersonalPresetStore,
} from '../lib/presetTournaments'

export interface CreateWorkspaceOptions {
  presetImport?: PresetImportOptions
}

interface WorkspaceContextValue {
  workspace: WorkspaceInfo | null
  workspaces: WorkspaceInfo[]
  members: WorkspaceMemberInfo[]
  sessionUrl: string | null
  shareUrl: string | null
  creating: boolean
  joinError: string | null
  joinShareSlug: (slug: string) => Promise<void>
  openWorkspace: (slug: string) => Promise<void>
  createSharedWorkspace: (name: string, options?: CreateWorkspaceOptions) => Promise<WorkspaceInfo>
  leaveWorkspace: () => Promise<void>
  leaveSession: (workspaceId: string, role: string) => Promise<void>
  endSession: (workspaceId: string) => Promise<void>
  refreshWorkspaces: () => Promise<void>
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null)
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([])
  const [members, setMembers] = useState<WorkspaceMemberInfo[]>([])
  const [creating, setCreating] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)

  useWorkspaceStream(workspace?.id, Boolean(workspace && user))

  const refreshWorkspaces = useCallback(async () => {
    if (!user) {
      setWorkspaces([])
      return
    }
    try {
      const items = await listWorkspaces()
      setWorkspaces(items)
    } catch {
      setWorkspaces([])
    }
  }, [user])

  const refreshMembers = useCallback(async (workspaceId: string) => {
    try {
      const list = await fetchWorkspaceMembers(workspaceId)
      setMembers(list)
    } catch {
      setMembers([])
    }
  }, [])

  const activateWorkspace = useCallback(
    async (info: WorkspaceInfo, seed?: CreateWorkspaceOptions) => {
      cancelPendingCloudSaves()
      beginWorkspaceHydration()
      setActiveWorkspaceSlug(info.share_slug)
      setWorkspaceCache(info)
      setWorkspace(info)
      setJoinError(null)

      try {
        clearWorkspaceLocalData({ notify: false })

        if (seed) {
          const personal = loadPersonalPresetStore()
          const sharedStore = buildSharedPresetStoreFromImport(
            personal,
            seed.presetImport ?? { mode: 'none' },
          )
          await seedWorkspaceFromLocal(info.id, sharedStore)
        } else {
          await hydrateWorkspaceDocuments(info.id)
        }
      } finally {
        endWorkspaceHydration()
      }

      await refreshMembers(info.id)
      navigateToSession(info.share_slug, true)
      void refreshWorkspaces()
      window.dispatchEvent(new CustomEvent('aoe-preset-store-changed'))
    },
    [refreshWorkspaces, refreshMembers],
  )

  const joinShareSlug = useCallback(
    async (slug: string) => {
      if (!user) throw new Error('Login required')
      setJoinError(null)
      try {
        const info = await joinWorkspace(slug)
        await activateWorkspace(info)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to join workspace'
        setJoinError(message)
        throw err
      }
    },
    [activateWorkspace, user],
  )

  const openWorkspace = useCallback(
    async (slug: string) => {
      await joinShareSlug(slug)
    },
    [joinShareSlug],
  )

  useEffect(() => {
    if (!user) {
      setWorkspace(null)
      setWorkspaceCache(null)
      setActiveWorkspaceSlug(null)
      setWorkspaces([])
      setMembers([])
      setJoinError(null)
      return
    }

    void refreshWorkspaces()

    const pathSlug = parseCollaborationSlugFromPath()
    if (pathSlug) {
      joinShareSlug(pathSlug).catch(() => {
        // joinError state holds details for the UI
      })
      return
    }

    const savedSlug = getActiveWorkspaceSlug()
    if (savedSlug) {
      joinWorkspace(savedSlug)
        .then((info) => activateWorkspace(info))
        .catch(() => {
          setActiveWorkspaceSlug(null)
          setWorkspaceCache(null)
          setWorkspace(null)
          setMembers([])
        })
    }
  }, [user, joinShareSlug, activateWorkspace, refreshWorkspaces])

  useEffect(() => {
    if (!workspace || !user) return
    const interval = window.setInterval(() => {
      if (isWorkspaceHydrating()) return
      hydrateWorkspaceDocuments(workspace.id).catch(console.error)
      refreshMembers(workspace.id).catch(console.error)
    }, 10000)
    return () => window.clearInterval(interval)
  }, [workspace, user, refreshMembers])

  const createSharedWorkspace = useCallback(
    async (name: string, options?: CreateWorkspaceOptions) => {
      if (!user) throw new Error('Login required')
      setCreating(true)
      setJoinError(null)
      try {
        const info = await createWorkspace(name)
        await activateWorkspace(info, options ?? { presetImport: { mode: 'none' } })
        return info
      } finally {
        setCreating(false)
      }
    },
    [activateWorkspace, user],
  )

  const leaveWorkspace = useCallback(async () => {
    if (!workspace) return
    if (workspace.role !== 'owner') {
      await leaveWorkspaceMembership(workspace.id)
    }
    setWorkspace(null)
    setMembers([])
    await leaveWorkspaceMode()
    void refreshWorkspaces()
  }, [workspace, refreshWorkspaces])

  const leaveSession = useCallback(
    async (workspaceId: string, role: string) => {
      if (role !== 'owner') {
        await leaveWorkspaceMembership(workspaceId)
      }
      if (workspace?.id === workspaceId) {
        setWorkspace(null)
        setMembers([])
        await leaveWorkspaceMode()
      }
      await refreshWorkspaces()
    },
    [workspace, refreshWorkspaces],
  )

  const endSession = useCallback(
    async (workspaceId: string) => {
      const target = workspaces.find((item) => item.id === workspaceId) ?? workspace
      if (!target || target.role !== 'owner') {
        throw new Error('Only the session owner can end it')
      }
      await deleteWorkspace(workspaceId)
      cancelPendingCloudSaves()
      clearWorkspaceLocalData()
      if (workspace?.id === workspaceId) {
        setWorkspace(null)
        setMembers([])
        await leaveWorkspaceMode()
      }
      await refreshWorkspaces()
    },
    [workspace, workspaces, refreshWorkspaces],
  )

  const sessionUrl = workspace ? buildSessionUrl(workspace.share_slug) : null

  const value = useMemo(
    () => ({
      workspace,
      workspaces,
      members,
      sessionUrl,
      shareUrl: sessionUrl,
      creating,
      joinError,
      joinShareSlug,
      openWorkspace,
      createSharedWorkspace,
      leaveWorkspace,
      leaveSession,
      endSession,
      refreshWorkspaces,
    }),
    [
      workspace,
      workspaces,
      members,
      sessionUrl,
      creating,
      joinError,
      joinShareSlug,
      openWorkspace,
      createSharedWorkspace,
      leaveWorkspace,
      leaveSession,
      endSession,
      refreshWorkspaces,
    ],
  )

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider')
  return ctx
}
