import { useState, useEffect, useCallback } from "react";

/**
 * Real backend-verified session auth. Replaces the old sessionStorage-only
 * "token" (which any client could set itself) with a check against the
 * server's HttpOnly session cookie via GET /api/v1/auth/me.
 */
export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(null); // null = still checking
  const [username, setUsername] = useState(null);

  const check = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/auth/me", { credentials: "same-origin" });
      if (res.ok) {
        const data = await res.json();
        setUsername(data.username);
        setIsAuthenticated(true);
      } else {
        setUsername(null);
        setIsAuthenticated(false);
      }
    } catch (e) {
      setUsername(null);
      setIsAuthenticated(false);
    }
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  const login = useCallback(async (loginUsername, password) => {
    const res = await fetch("/api/v1/auth/login", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: loginUsername, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Invalid username or password.");
    }
    const data = await res.json();
    setUsername(data.username);
    setIsAuthenticated(true);
    return data;
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/v1/auth/logout", { method: "POST", credentials: "same-origin" });
    } finally {
      setUsername(null);
      setIsAuthenticated(false);
    }
  }, []);

  return { isAuthenticated, username, login, logout, recheck: check };
}
