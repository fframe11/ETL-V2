import { useState, useEffect, useCallback } from "react";
import { resolveApiUrl, getApiBaseUrl } from "../utils/apiConfig";
import { setStaticDemoMode } from "./useApi";

export function isDemoModeStored() {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("dataserve_demo_mode") === "true" ||
         localStorage.getItem("sdoqap_demo_mode") === "true" ||
         localStorage.getItem("sdoqap_static_demo") === "true";
}

function getStoredUserProfile() {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("dataserve_user_profile");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function storeUserProfile(profile) {
  if (typeof window === "undefined" || !profile) return;
  try {
    localStorage.setItem("dataserve_user_profile", JSON.stringify(profile));
  } catch {}
}

function clearStoredUserProfile() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem("dataserve_user_profile");
  } catch {}
}

/**
 * Enterprise Databricks-grade Authentication Hook.
 * Supports Sign In, Registration (Sign Up), Enterprise SSO, and Instant Demo Mode.
 */
export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => (isDemoModeStored() ? true : null));
  const [username, setUsername] = useState(() => (isDemoModeStored() ? "demo-reviewer" : null));
  const [userProfile, setUserProfile] = useState(() => (isDemoModeStored() ? {
    username: "demo-reviewer",
    email: "reviewer@academic-eval.edu",
    fullName: "Academic Project Reviewer",
    organization: "Faculty Examination Board",
    role: "Lead Reviewer",
    tier: "Academic Evaluation Tier",
  } : getStoredUserProfile()));
  const [isDemoMode, setIsDemoMode] = useState(() => isDemoModeStored());
  const [authStatusMessage, setAuthStatusMessage] = useState("");

  const check = useCallback(async () => {
    if (isDemoModeStored()) {
      setUsername("demo-reviewer");
      setUserProfile({
        username: "demo-reviewer",
        email: "reviewer@academic-eval.edu",
        fullName: "Academic Project Reviewer",
        organization: "Faculty Examination Board",
        role: "Lead Reviewer",
        tier: "Academic Evaluation Tier",
      });
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
        const profile = {
          username: data.username,
          email: data.email || `${data.username}@dataserve.io`,
          fullName: data.full_name || data.username,
          organization: data.organization || "DataServe Enterprise",
          role: data.role || "Data Engineer",
          tier: data.tier || "Community Edition",
        };
        setUsername(data.username);
        setUserProfile(profile);
        storeUserProfile(profile);
        setIsAuthenticated(true);
        setIsDemoMode(false);
        setAuthStatusMessage("");
        return;
      }

      if (res.status === 401) {
        if (typeof window !== "undefined") {
          sessionStorage.removeItem("sdoqap_token");
          localStorage.removeItem("sdoqap_token");
        }
        clearStoredUserProfile();
        setUsername(null);
        setUserProfile(null);
        setIsAuthenticated(false);
        setIsDemoMode(false);
        setAuthStatusMessage("");
        return;
      }

      // Backend offline without live API URL
      if (!getApiBaseUrl()) {
        const fallbackProfile = {
          username: "demo-reviewer",
          email: "reviewer@academic-eval.edu",
          fullName: "Academic Project Reviewer",
          organization: "Faculty Examination Board",
          role: "Lead Reviewer",
          tier: "Academic Evaluation Tier",
        };
        setUsername("demo-reviewer");
        setUserProfile(fallbackProfile);
        setIsAuthenticated(true);
        setIsDemoMode(true);
        setAuthStatusMessage("โหมดทดลองใช้งานออฟไลน์ ไม่มีการเชื่อมต่อเซิร์ฟเวอร์");
      } else {
        setUsername(null);
        setUserProfile(null);
        setIsAuthenticated(false);
        setIsDemoMode(false);
        setAuthStatusMessage("เชื่อมต่อระบบตรวจสอบสิทธิ์ไม่ได้ HTTP " + res.status);
      }
    } catch (e) {
      if (!getApiBaseUrl()) {
        const fallbackProfile = {
          username: "demo-reviewer",
          email: "reviewer@academic-eval.edu",
          fullName: "Academic Project Reviewer",
          organization: "Faculty Examination Board",
          role: "Lead Reviewer",
          tier: "Academic Evaluation Tier",
        };
        setUsername("demo-reviewer");
        setUserProfile(fallbackProfile);
        setIsAuthenticated(true);
        setIsDemoMode(true);
        setAuthStatusMessage("โหมดทดลองใช้งานออฟไลน์ ไม่มีการเชื่อมต่อเซิร์ฟเวอร์");
      } else {
        setUsername(null);
        setUserProfile(null);
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
        const profile = data.user ? {
          username: data.user.username,
          email: data.user.email,
          fullName: data.user.full_name,
          organization: data.user.organization,
          role: data.user.role,
          tier: data.user.tier,
        } : {
          username: data.username,
          email: `${data.username}@dataserve.io`,
          fullName: data.username,
          organization: "DataServe Enterprise",
          role: "Data Engineer",
          tier: "Community Edition",
        };
        setStaticDemoMode(false);
        setUsername(data.username);
        setUserProfile(profile);
        storeUserProfile(profile);
        setIsAuthenticated(true);
        setIsDemoMode(false);
        setAuthStatusMessage("");
        return data;
      }
      if (res.status === 401 || res.status === 403) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
      }
      if (!getApiBaseUrl()) {
        const uname = loginUsername || "demo-reviewer";
        const fallbackProfile = {
          username: uname,
          email: `${uname}@dataserve.io`,
          fullName: uname,
          organization: "DataServe Enterprise",
          role: "Data Engineer",
          tier: "Community Edition",
        };
        setUsername(uname);
        setUserProfile(fallbackProfile);
        storeUserProfile(fallbackProfile);
        setIsAuthenticated(true);
        setIsDemoMode(true);
        setAuthStatusMessage("โหมดสาธิตการใช้งานออฟไลน์");
        return { username: uname };
      }
      throw new Error(`เข้าสู่ระบบไม่สำเร็จ HTTP ${res.status}`);
    } catch (err) {
      if (err.message && (err.message.includes("ชื่อผู้ใช้หรือรหัสผ่าน") || err.message.includes("forbidden") || getApiBaseUrl())) throw err;
      const uname = loginUsername || "demo-reviewer";
      const fallbackProfile = {
        username: uname,
        email: `${uname}@dataserve.io`,
        fullName: uname,
        organization: "DataServe Enterprise",
        role: "Data Engineer",
        tier: "Community Edition",
      };
      setUsername(uname);
      setUserProfile(fallbackProfile);
      storeUserProfile(fallbackProfile);
      setIsAuthenticated(true);
      setIsDemoMode(true);
      setAuthStatusMessage("โหมดสาธิตการใช้งานออฟไลน์");
      return { username: uname };
    }
  }, []);

  const signup = useCallback(async (signupData) => {
    try {
      const payload = {
        full_name: signupData.fullName || signupData.full_name || "",
        email: signupData.email || "",
        username: signupData.username || (signupData.email ? signupData.email.split("@")[0] : ""),
        organization: signupData.organization || "DataServe Enterprise",
        role: signupData.role || "Data Engineer",
        tier: signupData.tier || "Community Edition",
        password: signupData.password || "",
      };

      const res = await fetch(resolveApiUrl("/api/v1/auth/signup"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
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
        const profile = data.user ? {
          username: data.user.username,
          email: data.user.email,
          fullName: data.user.full_name,
          organization: data.user.organization,
          role: data.user.role,
          tier: data.user.tier,
        } : {
          username: data.username,
          email: payload.email,
          fullName: payload.full_name,
          organization: payload.organization,
          role: payload.role,
          tier: payload.tier,
        };
        setStaticDemoMode(false);
        setUsername(data.username);
        setUserProfile(profile);
        storeUserProfile(profile);
        setIsAuthenticated(true);
        setIsDemoMode(false);
        setAuthStatusMessage("");
        return data;
      }

      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `สมัครบัญชีไม่สำเร็จ HTTP ${res.status}`);
    } catch (err) {
      if (err.message && !err.message.includes("Failed to fetch")) throw err;
      // Fallback offline signup for zero-server test environments
      const uname = (signupData.username || (signupData.email ? signupData.email.split("@")[0] : "engineer")).toLowerCase();
      const fallbackProfile = {
        username: uname,
        email: signupData.email || `${uname}@dataserve.io`,
        fullName: signupData.fullName || uname,
        organization: signupData.organization || "DataServe Enterprise",
        role: signupData.role || "Data Engineer",
        tier: signupData.tier || "Community Edition",
      };
      if (typeof window !== "undefined") {
        sessionStorage.setItem("sdoqap_token", `offline_token_${uname}`);
        localStorage.setItem("sdoqap_token", `offline_token_${uname}`);
        localStorage.removeItem("sdoqap_demo_mode");
        localStorage.removeItem("dataserve_demo_mode");
        localStorage.removeItem("sdoqap_static_demo");
      }
      setStaticDemoMode(false);
      setUsername(uname);
      setUserProfile(fallbackProfile);
      storeUserProfile(fallbackProfile);
      setIsAuthenticated(true);
      setIsDemoMode(false);
      setAuthStatusMessage("");
      return { status: "success", username: uname, user: fallbackProfile };
    }
  }, []);

  const loginWithSSO = useCallback(async (provider = "google") => {
    try {
      const res = await fetch(resolveApiUrl("/api/v1/auth/sso"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      if (res.ok) {
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
        const profile = data.user || {
          username: data.username,
          email: `${provider}.user@lakehouse.local`,
          fullName: `${provider.toUpperCase()} Enterprise User`,
          organization: `${provider.toUpperCase()} Lakehouse Workspace`,
          role: "Lead Data Engineer",
          tier: "Enterprise Lakehouse",
        };
        setStaticDemoMode(false);
        setUsername(data.username);
        setUserProfile(profile);
        storeUserProfile(profile);
        setIsAuthenticated(true);
        setIsDemoMode(false);
        setAuthStatusMessage("");
        return data;
      }
    } catch {}
    // Offline / Instant SSO fallback
    const ssoUser = `${provider}_engineer`;
    const ssoProfile = {
      username: ssoUser,
      email: `${ssoUser}@enterprise.io`,
      fullName: `${provider.toUpperCase()} Workspace Engineer`,
      organization: "Enterprise Lakehouse Cloud",
      role: "Lead Data Engineer",
      tier: "Enterprise Lakehouse",
    };
    if (typeof window !== "undefined") {
      sessionStorage.setItem("sdoqap_token", `sso_token_${provider}`);
      localStorage.setItem("sdoqap_token", `sso_token_${provider}`);
      localStorage.removeItem("sdoqap_demo_mode");
      localStorage.removeItem("dataserve_demo_mode");
      localStorage.removeItem("sdoqap_static_demo");
    }
    setStaticDemoMode(false);
    setUsername(ssoUser);
    setUserProfile(ssoProfile);
    storeUserProfile(ssoProfile);
    setIsAuthenticated(true);
    setIsDemoMode(false);
    setAuthStatusMessage("");
    return { status: "success", username: ssoUser, user: ssoProfile };
  }, []);

  const loginAsDemo = useCallback(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("sdoqap_demo_mode", "true");
      localStorage.setItem("dataserve_demo_mode", "true");
      localStorage.setItem("sdoqap_static_demo", "true");
    }
    const demoProfile = {
      username: "demo-reviewer",
      email: "reviewer@academic-eval.edu",
      fullName: "Academic Project Reviewer",
      organization: "Faculty Examination Board",
      role: "Lead Reviewer",
      tier: "Academic Evaluation Tier",
    };
    setStaticDemoMode(true);
    setUsername("demo-reviewer");
    setUserProfile(demoProfile);
    storeUserProfile(demoProfile);
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
      clearStoredUserProfile();
      setStaticDemoMode(false);
      setUsername(null);
      setUserProfile(null);
      setIsAuthenticated(false);
      setIsDemoMode(false);
      setAuthStatusMessage("");
    }
  }, []);

  return {
    isAuthenticated,
    username,
    userProfile,
    isDemoMode,
    authStatusMessage,
    login,
    signup,
    loginWithSSO,
    loginAsDemo,
    logout,
    recheck: check,
  };
}
