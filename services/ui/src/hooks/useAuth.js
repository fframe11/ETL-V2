import { useState, useEffect, useCallback } from "react";
import { resolveApiUrl, getApiBaseUrl } from "../utils/apiConfig";
import { setStaticDemoMode } from "./useApi";

export function isDemoModeStored() {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("dataserve_demo_mode") === "true" ||
         localStorage.getItem("sdoqap_demo_mode") === "true" ||
         localStorage.getItem("sdoqap_static_demo") === "true";
}

/**
 * Real backend-verified session auth. Replaces the old sessionStorage-only
 * "token" (which any client could set itself) with a check against the
 * server's HttpOnly session cookie via GET /api/v1/auth/me.
 */
export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => (isDemoModeStored() ? true : null));
  const [username, setUsername] = useState(() => (isDemoModeStored() ? "demo-reviewer" : null));
  const [isDemoMode, setIsDemoMode] = useState(() => isDemoModeStored());
  const [authStatusMessage, setAuthStatusMessage] = useState("");

  const check = useCallback(async () => {
    if (isDemoModeStored()) {
      setUsername("demo-reviewer");
      setIsAuthenticated(true);
      setIsDemoMode(true);
      setAuthStatusMessage("โหมดสาธิตการใช้งาน");
      setStaticDemoMode(true);
      return;
    }

    try {
      const token = typeof window !== "undefined" ? (sessionStorage.getItem("sdoqap_token") || localStorage.getItem("sdoqap_token")) : null;
      const headers = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      const res = await fetch(resolveApiUrl("/api/v1/auth/me"), { credentials: "include", headers });
      const contentType = res.headers?.get("content-type") || "";

      if (res.ok && (!contentType || contentType.includes("application/json"))) {
        const data = await res.json();
        setUsername(data.username);
        setIsAuthenticated(true);
        setIsDemoMode(false);
        setAuthStatusMessage("");
        return;
      }

      if (res.status === 401) {
        // Backend active, session not authenticated
        if (typeof window !== "undefined") {
          sessionStorage.removeItem("sdoqap_token");
          localStorage.removeItem("sdoqap_token");
        }
        setUsername(null);
        setIsAuthenticated(false);
        setIsDemoMode(false);
        setAuthStatusMessage("");
        return;
      }

      // Backend offline, 404, or HTML response (only fallback to demo if no live API URL is configured)
      if (!getApiBaseUrl()) {
        setUsername("demo-reviewer");
        setIsAuthenticated(true);
        setIsDemoMode(true);
        setAuthStatusMessage("โหมดทดลองใช้งานออฟไลน์ ไม่มีการเชื่อมต่อเซิร์ฟเวอร์");
      } else {
        setUsername(null);
        setIsAuthenticated(false);
        setIsDemoMode(false);
        setAuthStatusMessage("เชื่อมต่อระบบตรวจสอบสิทธิ์ไม่ได้ HTTP " + res.status);
      }
    } catch (e) {
      // Network error (backend unreachable) -> Fallback to demo only if no live API configured
      if (!getApiBaseUrl()) {
        setUsername("demo-reviewer");
        setIsAuthenticated(true);
        setIsDemoMode(true);
        setAuthStatusMessage("โหมดทดลองใช้งานออฟไลน์ ไม่มีการเชื่อมต่อเซิร์ฟเวอร์");
      } else {
        setUsername(null);
        setIsAuthenticated(false);
        setIsDemoMode(false);
        setAuthStatusMessage("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่");
      }
    }
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  const login = useCallback(async (loginUsername, password) => {
    try {
      const res = await fetch(resolveApiUrl("/api/v1/auth/login"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: loginUsername, password }),
      });
      const contentType = res.headers?.get("content-type") || "";
      if (res.ok && (!contentType || contentType.includes("application/json"))) {
        const data = await res.json();
        if (data.token && typeof window !== "undefined") {
          sessionStorage.setItem("sdoqap_token", data.token);
          localStorage.setItem("sdoqap_token", data.token);
        }
        if (typeof window !== "undefined") {
          localStorage.removeItem("sdoqap_demo_mode");
          localStorage.removeItem("dataserve_demo_mode");
          localStorage.removeItem("sdoqap_static_demo");
        }
        setStaticDemoMode(false);
        setUsername(data.username);
        setIsAuthenticated(true);
        setIsDemoMode(false);
        setAuthStatusMessage("");
        return data;
      }
      if (res.status === 401) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
      }
      // If status 404 or backend unavailable without live API, enter demo mode
      if (!getApiBaseUrl()) {
        const uname = loginUsername || "demo-reviewer";
        setUsername(uname);
        setIsAuthenticated(true);
        setIsDemoMode(true);
        setAuthStatusMessage("โหมดสาธิตการใช้งานออฟไลน์ ไม่มีการเชื่อมต่อเซิร์ฟเวอร์");
        return { username: uname };
      }
      throw new Error(`เข้าสู่ระบบไม่สำเร็จ HTTP ${res.status}`);
    } catch (err) {
      if (err.message && (err.message.includes("ชื่อผู้ใช้หรือรหัสผ่าน") || getApiBaseUrl())) throw err;
      const uname = loginUsername || "demo-reviewer";
      setUsername(uname);
      setIsAuthenticated(true);
      setIsDemoMode(true);
      setAuthStatusMessage("โหมดสาธิตการใช้งานออฟไลน์ ไม่มีการเชื่อมต่อเซิร์ฟเวอร์");
      return { username: uname };
    }
  }, []);

  const loginAsDemo = useCallback(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("sdoqap_demo_mode", "true");
      localStorage.setItem("dataserve_demo_mode", "true");
      localStorage.setItem("sdoqap_static_demo", "true");
    }
    setStaticDemoMode(true);
    setUsername("demo-reviewer");
    setIsAuthenticated(true);
    setIsDemoMode(true);
    setAuthStatusMessage("โหมดสาธิตการใช้งาน");
  }, []);

  const logout = useCallback(async () => {
    try {
      const token = typeof window !== "undefined" ? (sessionStorage.getItem("sdoqap_token") || localStorage.getItem("sdoqap_token")) : null;
      const headers = token ? { "Authorization": `Bearer ${token}` } : {};
      await fetch(resolveApiUrl("/api/v1/auth/logout"), { method: "POST", credentials: "include", headers }).catch(() => {});
    } finally {
      if (typeof window !== "undefined") {
        sessionStorage.removeItem("sdoqap_token");
        localStorage.removeItem("sdoqap_token");
        localStorage.removeItem("sdoqap_demo_mode");
        localStorage.removeItem("dataserve_demo_mode");
        localStorage.removeItem("sdoqap_static_demo");
      }
      setStaticDemoMode(false);
      setUsername(null);
      setIsAuthenticated(false);
      setIsDemoMode(false);
      setAuthStatusMessage("");
    }
  }, []);

  return { isAuthenticated, username, isDemoMode, authStatusMessage, login, loginAsDemo, logout, recheck: check };
}
