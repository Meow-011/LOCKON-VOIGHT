/**
 * Authentication context & hook.
 */

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authAPI } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    const token = localStorage.getItem('voight_access_token');
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const res = await authAPI.me();
      setUser(res.data);
    } catch {
      localStorage.removeItem('voight_access_token');
      localStorage.removeItem('voight_refresh_token');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { checkAuth(); }, [checkAuth]);

  const login = async (username, password) => {
    const res = await authAPI.login(username, password);
    localStorage.setItem('voight_access_token', res.data.access_token);
    localStorage.setItem('voight_refresh_token', res.data.refresh_token);
    await checkAuth();
    return res.data;
  };

  const logout = () => {
    localStorage.removeItem('voight_access_token');
    localStorage.removeItem('voight_refresh_token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
