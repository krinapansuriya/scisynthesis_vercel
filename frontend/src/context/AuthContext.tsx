import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../lib/api';

interface User {
  id: number;
  email: string;
  full_name?: string;
  institution?: string;
  bio?: string;
  phone_number?: string;
  profile_picture?: string;
  created_at?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (accessToken?: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (data: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const SESSION_KEY = 'ss_token';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = async () => {
    try {
      const response = await api.get('/auth/me');
      setUser(response.data);
    } catch {
      sessionStorage.removeItem(SESSION_KEY);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Try to restore session on mount — works via httpOnly cookie OR sessionStorage token
    fetchUser();
  }, []);

  const login = async (accessToken?: string) => {
    // Store token in sessionStorage as a reliable fallback alongside the httpOnly cookie.
    // sessionStorage is cleared automatically when the browser tab closes.
    if (accessToken) {
      sessionStorage.setItem(SESSION_KEY, accessToken);
    }
    await fetchUser();
  };

  const logout = async () => {
    sessionStorage.removeItem(SESSION_KEY);
    try {
      await api.post('/auth/logout');  // Clears the httpOnly cookie server-side
    } catch {
      // Proceed even if server is unreachable
    }
    setUser(null);
  };

  const updateUser = (data: Partial<User>) => {
    if (user) setUser({ ...user, ...data });
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
