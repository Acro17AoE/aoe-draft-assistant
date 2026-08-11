import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  CLOUD_HYDRATED,
  fetchMe,
  getAuthToken,
  hydrateUserDocuments,
  leaveWorkspaceMode,
  loginRequest,
  registerRequest,
  setAuthToken,
  setCurrentUserId,
  uploadLocalDocumentsIfEmpty,
  type AuthUser,
} from '../lib/cloudStorage'

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, displayName: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  const hydrateSession = useCallback(async (token: string) => {
    setAuthToken(token)
    const me = await fetchMe()
    setCurrentUserId(me.id)
    await uploadLocalDocumentsIfEmpty()
    await hydrateUserDocuments()
    setUser(me)
  }, [])

  useEffect(() => {
    const token = getAuthToken()
    if (!token) {
      setLoading(false)
      return
    }
    hydrateSession(token)
      .catch(() => {
        setAuthToken(null)
        setCurrentUserId(null)
        setUser(null)
      })
      .finally(() => setLoading(false))
  }, [hydrateSession])

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await loginRequest(email, password)
      setAuthToken(result.access_token)
      setCurrentUserId(result.user.id)
      await uploadLocalDocumentsIfEmpty()
      await hydrateUserDocuments()
      setUser(result.user)
    },
    [],
  )

  const register = useCallback(
    async (email: string, password: string, displayName: string) => {
      const result = await registerRequest(email, password, displayName)
      setAuthToken(result.access_token)
      setCurrentUserId(result.user.id)
      await uploadLocalDocumentsIfEmpty()
      await hydrateUserDocuments()
      setUser(result.user)
    },
    [],
  )

  const logout = useCallback(() => {
    void leaveWorkspaceMode()
    setAuthToken(null)
    setCurrentUserId(null)
    setUser(null)
    window.dispatchEvent(new CustomEvent(CLOUD_HYDRATED))
  }, [])

  const value = useMemo(
    () => ({ user, loading, login, register, logout }),
    [user, loading, login, register, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
