import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { getSocket } from '../utils/socket';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

// How often a staff session re-checks itself with the server. The socket event
// below is the fast path; this is the fallback for a dropped socket.
const SESSION_POLL_MS = 60_000;

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [revokedNotice, setRevokedNotice] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userData = localStorage.getItem('user');

    if (token && userData) {
      setUser(JSON.parse(userData));
    }
    setLoading(false);
  }, []);

  const clearSession = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  }, []);

  const signIn = async (path, username, password) => {
    try {
      const response = await api.post(path, { username, password });

      if (response.data.success) {
        const { token, user: account } = response.data;
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(account));
        setUser(account);
        setRevokedNotice('');
        return { success: true, user: account };
      }

      return { success: false, message: response.data.message || 'Login failed' };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || 'Login failed'
      };
    }
  };

  const login = (username, password) => signIn('/admin/login', username, password);
  const loginRoller = (username, password) => signIn('/rollers/login', username, password);

  const logout = () => {
    setRevokedNotice('');
    clearSession();
  };

  // Kicked out by the admin — end the session and explain why on the login screen
  const revokeSession = useCallback((message) => {
    setRevokedNotice(message);
    clearSession();
  }, [clearSession]);

  // Fast path: the server announces a deletion over the socket, so an open app
  // logs itself out the moment the admin removes the account.
  useEffect(() => {
    if (!user?.id || user.role === 'admin') return;

    const socket = getSocket();
    const onRevoked = (payload) => {
      if (payload?.role === user.role && String(payload?.id) === String(user.id)) {
        revokeSession('Your account was removed by the administrator.');
      }
    };

    socket.on('session_revoked', onRevoked);
    return () => socket.off('session_revoked', onRevoked);
  }, [user, revokeSession]);

  // Fallback path: re-check the session on a timer in case the socket is down.
  // The request itself 401s once the account is gone.
  useEffect(() => {
    if (user?.role !== 'roller') return;

    const check = async () => {
      try {
        await api.get('/rollers/verify');
      } catch (error) {
        if (error.response?.status === 401) {
          revokeSession(
            error.response?.data?.code === 'ACCOUNT_REVOKED'
              ? 'Your account was removed by the administrator.'
              : 'Your session has ended. Please sign in again.'
          );
        }
      }
    };

    const id = setInterval(check, SESSION_POLL_MS);
    return () => clearInterval(id);
  }, [user, revokeSession]);

  return (
    <AuthContext.Provider
      value={{ user, login, loginRoller, logout, loading, revokedNotice, setRevokedNotice }}
    >
      {children}
    </AuthContext.Provider>
  );
};
