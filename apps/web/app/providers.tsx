'use client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { dashboardApi, type User } from '../lib/api/dashboard';
type Session = {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  authorized: <T>(call: (token: string) => Promise<T>) => Promise<T>;
};
const Context = createContext<Session | null>(null);
export function Providers({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null),
    [token, setToken] = useState<string | null>(null),
    [loading, setLoading] = useState(true);
  const restore = useCallback(async () => {
    try {
      const refreshed = await dashboardApi.refresh();
      const current = await dashboardApi.me(refreshed.accessToken);
      setToken(refreshed.accessToken);
      setUser(current);
    } catch {
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const id = setTimeout(() => void restore(), 0);
    return () => clearTimeout(id);
  }, [restore]);
  const login = useCallback(async (email: string, password: string) => {
    const result = await dashboardApi.login(email, password);
    setToken(result.accessToken);
    setUser(result.user);
  }, []);
  const logout = useCallback(async () => {
    try {
      await dashboardApi.logout();
    } finally {
      setToken(null);
      setUser(null);
    }
  }, []);
  const authorized = useCallback(
    async <T,>(call: (value: string) => Promise<T>) => {
      let active = token;
      if (!active) {
        const refreshed = await dashboardApi.refresh();
        active = refreshed.accessToken;
        setToken(active);
      }
      try {
        return await call(active);
      } catch (error) {
        if (
          typeof error === 'object' &&
          error &&
          'status' in error &&
          error.status === 401
        ) {
          const refreshed = await dashboardApi.refresh();
          setToken(refreshed.accessToken);
          return call(refreshed.accessToken);
        }
        throw error;
      }
    },
    [token],
  );
  const value = { user, token, loading, login, logout, authorized };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useSession() {
  const value = useContext(Context);
  if (!value) throw new Error('Session provider is missing.');
  return value;
}
