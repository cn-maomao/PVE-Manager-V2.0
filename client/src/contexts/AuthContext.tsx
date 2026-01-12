import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export interface User {
  id: string;
  username: string;
  email: string;
  role: string;
  permissions: string[];
  status?: string;
  last_login?: string;
  last_login_ip?: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

interface AuthContextType extends AuthState {
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
  hasRole: (role: string) => boolean;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: localStorage.getItem('pve_token'),
    isAuthenticated: false,
    isLoading: true,
    error: null,
  });

  const setToken = (token: string | null) => {
    if (token) {
      localStorage.setItem('pve_token', token);
    } else {
      localStorage.removeItem('pve_token');
    }
  };

  const checkAuth = useCallback(async () => {
    const token = localStorage.getItem('pve_token');
    if (!token) {
      setState(prev => ({ ...prev, isLoading: false, isAuthenticated: false }));
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const user = await response.json();
        setState({
          user,
          token,
          isAuthenticated: true,
          isLoading: false,
          error: null,
        });
      } else {
        // Token 无效
        setToken(null);
        setState({
          user: null,
          token: null,
          isAuthenticated: false,
          isLoading: false,
          error: null,
        });
      }
    } catch (error) {
      console.error('检查认证状态失败:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: '网络错误',
      }));
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = async (username: string, password: string): Promise<boolean> => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setToken(data.token);
        setState({
          user: data.user,
          token: data.token,
          isAuthenticated: true,
          isLoading: false,
          error: null,
        });
        return true;
      } else {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: data.error || '登录失败',
        }));
        return false;
      }
    } catch (error: any) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error.message || '网络错误',
      }));
      return false;
    }
  };

  const logout = async () => {
    const token = localStorage.getItem('pve_token');
    
    try {
      if (token) {
        await fetch(`${API_BASE_URL}/api/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
      }
    } catch (error) {
      console.error('登出失败:', error);
    }

    setToken(null);
    setState({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
  };

  const hasPermission = (permission: string): boolean => {
    return state.user?.permissions?.includes(permission) || false;
  };

  const hasRole = (role: string): boolean => {
    return state.user?.role === role;
  };

  const clearError = () => {
    setState(prev => ({ ...prev, error: null }));
  };

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        logout,
        checkAuth,
        hasPermission,
        hasRole,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// 权限常量
export const Permissions = {
  USER_VIEW: 'user:view',
  USER_CREATE: 'user:create',
  USER_EDIT: 'user:edit',
  USER_DELETE: 'user:delete',
  VM_VIEW: 'vm:view',
  VM_START: 'vm:start',
  VM_STOP: 'vm:stop',
  VM_DELETE: 'vm:delete',
  VM_CONSOLE: 'vm:console',
  BACKUP_VIEW: 'backup:view',
  BACKUP_CREATE: 'backup:create',
  BACKUP_RESTORE: 'backup:restore',
  BACKUP_DELETE: 'backup:delete',
  GROUP_VIEW: 'group:view',
  GROUP_CREATE: 'group:create',
  GROUP_EDIT: 'group:edit',
  GROUP_DELETE: 'group:delete',
  LOG_VIEW: 'log:view',
  LOG_EXPORT: 'log:export',
  CONNECTION_VIEW: 'connection:view',
  CONNECTION_CREATE: 'connection:create',
  CONNECTION_EDIT: 'connection:edit',
  CONNECTION_DELETE: 'connection:delete',
} as const;

export const Roles = {
  ADMIN: 'admin',
  OPERATOR: 'operator',
  USER: 'user',
  VIEWER: 'viewer',
} as const;
