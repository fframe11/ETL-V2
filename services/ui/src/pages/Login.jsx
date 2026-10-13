import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import "./Login.css";

export default function Login() {
  const [mode, setMode] = useState("signin"); // "signin" | "signup"
  
  // Sign In fields
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);

  // Sign Up fields
  const [fullName, setFullName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupUsername, setSignupUsername] = useState("");
  const [organization, setOrganization] = useState("DataServe Enterprise");
  const [role, setRole] = useState("Data Engineer");
  const [tier, setTier] = useState("Community Edition"); // "Community Edition" | "Enterprise Lakehouse"
  const [signupPassword, setSignupPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const { login, signup, loginWithSSO, loginAsDemo } = useAuth();

  const from = location.state?.from?.pathname || "/dashboard";

  const handleSignIn = async (e) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");
    setLoading(true);
    try {
      await login(username, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message || "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");

    if (signupPassword.length < 6) {
      setError("รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร");
      return;
    }

    if (signupPassword !== confirmPassword) {
      setError("รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน");
      return;
    }

    setLoading(true);
    try {
      await signup({
        fullName,
        email: signupEmail,
        username: signupUsername || signupEmail.split("@")[0],
        organization,
        role,
        tier,
        password: signupPassword,
      });
      setSuccessMsg("สมัครบัญชีสำเร็จ! กำลังเชื่อมต่อเข้าสู่ Workspace...");
      setTimeout(() => {
        navigate(from, { replace: true });
      }, 500);
    } catch (err) {
      setError(err.message || "ไม่สามารถสมัครบัญชีได้ กรุณาตรวจสอบข้อมูล");
    } finally {
      setLoading(false);
    }
  };

  const handleSSO = async (provider) => {
    setError("");
    setLoading(true);
    try {
      await loginWithSSO(provider);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message || `เข้าสู่ระบบด้วย ${provider} ไม่สำเร็จ`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dbx-auth-page">
      {/* ═══════════════════════════════════════════════════
          LEFT COLUMN: ENTERPRISE ARCHITECTURE SHOWCASE (NO AI SLOP)
         ═══════════════════════════════════════════════════ */}
      <div className="dbx-auth-showcase">
        <div className="dbx-showcase-content">
          <div className="dbx-brand-header">
            {/* LOGO MUST BE A PERFECT CIRCLE */}
            <div className="dbx-brand-icon circular-logo" title="Data Serve Lakehouse">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
            </div>
            <div className="dbx-brand-titles">
              <span className="dbx-brand-name">Data Serve</span>
              <span className="dbx-brand-tag">Lakehouse Operations</span>
            </div>
          </div>

          <div className="dbx-hero-headline">
            <div className="dbx-stack-badge">SDOQAP Enterprise Stack • Cluster v2.4</div>
            <h1>Enterprise Data Quality & Lakehouse Operations</h1>
            <p>
              High-throughput data engineering platform orchestrating distributed Apache Spark 3.5,
              DuckDB vectorized compute, and autonomous 9-dimension SDOQAP data governance.
            </p>
          </div>

          {/* Authentic Architecture Telemetry Grid */}
          <div className="dbx-arch-grid">
            <div className="dbx-arch-card">
              <div className="dbx-arch-card-header">
                <span className="dbx-arch-layer">COMPUTE ENGINE</span>
                <span className="dbx-arch-status">ACTIVE</span>
              </div>
              <div className="dbx-arch-card-body">
                <strong>Apache Spark 3.5 & DuckDB</strong>
                <span>Multi-engine distributed compute with zero-copy Parquet caching</span>
              </div>
            </div>

            <div className="dbx-arch-card">
              <div className="dbx-arch-card-header">
                <span className="dbx-arch-layer">QUALITY ASSURANCE</span>
                <span className="dbx-arch-status">98.5% SLA</span>
              </div>
              <div className="dbx-arch-card-body">
                <strong>SDOQAP 9-Dimension Engine</strong>
                <span>44 dynamic rules, Great Expectations & drift detection</span>
              </div>
            </div>

            <div className="dbx-arch-card">
              <div className="dbx-arch-card-header">
                <span className="dbx-arch-layer">STREAMING & LINEAGE</span>
                <span className="dbx-arch-status">HEALTHY</span>
              </div>
              <div className="dbx-arch-card-body">
                <strong>Kafka Bus & OpenLineage</strong>
                <span>Event ingestion pipeline with resilient lease worker protocol</span>
              </div>
            </div>

            <div className="dbx-arch-card">
              <div className="dbx-arch-card-header">
                <span className="dbx-arch-layer">SEMANTIC BI STUDIO</span>
                <span className="dbx-arch-status">10,100 ROWS</span>
              </div>
              <div className="dbx-arch-card-body">
                <strong>Power BI-Grade Analytics</strong>
                <span>Executive impact, Gartner COPDQ TCO & dynamic cross-filtering</span>
              </div>
            </div>
          </div>

          <div className="dbx-cluster-telemetry-bar">
            <div className="dbx-pulse-dot" />
            <div className="dbx-telemetry-text">
              <span className="dbx-telemetry-title">12 Hybrid Microservices Operational</span>
              <span className="dbx-telemetry-nodes">Spark Master • Spark Worker • ES • Kibana • Grafana • n8n • Kafka • HDFS • PostgreSQL</span>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════
          RIGHT COLUMN: DATABRICKS AUTH CONSOLE
         ═══════════════════════════════════════════════════ */}
      <div className="dbx-auth-panel">
        <div className="dbx-auth-card">
          {/* Top Segmented Mode Switcher */}
          <div className="dbx-mode-nav">
            <button
              type="button"
              className={`dbx-mode-tab ${mode === "signin" ? "active" : ""}`}
              onClick={() => { setMode("signin"); setError(""); setSuccessMsg(""); }}
            >
              Sign In
            </button>
            <button
              type="button"
              className={`dbx-mode-tab ${mode === "signup" ? "active" : ""}`}
              onClick={() => { setMode("signup"); setError(""); setSuccessMsg(""); }}
            >
              Create Account
            </button>
          </div>

          {/* Header Title & Subtitle */}
          <div className="dbx-auth-header">
            <h2>{mode === "signin" ? "Welcome back to your workspace" : "Get started with Data Serve"}</h2>
            <p>
              {mode === "signin"
                ? "Enter your credentials or choose your enterprise SSO identity provider."
                : "Choose your workspace tier and provision your developer credentials."}
            </p>
          </div>

          {/* Error & Success Alerts */}
          {error && (
            <div className="dbx-alert dbx-alert-error">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <span>{error}</span>
            </div>
          )}
          {successMsg && (
            <div className="dbx-alert dbx-alert-success">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>{successMsg}</span>
            </div>
          )}

          {/* Enterprise SSO Buttons */}
          <div className="dbx-sso-grid">
            <button
              type="button"
              className="dbx-sso-btn"
              onClick={() => handleSSO("google")}
              disabled={loading}
            >
              <svg width="16" height="16" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
              <span>Continue with Google</span>
            </button>

            <button
              type="button"
              className="dbx-sso-btn"
              onClick={() => handleSSO("microsoft")}
              disabled={loading}
            >
              <svg width="16" height="16" viewBox="0 0 24 24">
                <rect x="1" y="1" width="10" height="10" fill="#F25022"/>
                <rect x="13" y="1" width="10" height="10" fill="#7FBA00"/>
                <rect x="1" y="13" width="10" height="10" fill="#00A4EF"/>
                <rect x="13" y="13" width="10" height="10" fill="#FFB900"/>
              </svg>
              <span>Continue with Microsoft</span>
            </button>
          </div>

          <div className="dbx-divider">
            <span>or continue with email credentials</span>
          </div>

          {/* ═══════════════════════════════════════════════
              MODE 1: SIGN IN FORM
             ═══════════════════════════════════════════════ */}
          {mode === "signin" && (
            <form onSubmit={handleSignIn} className="dbx-form">
              <div className="dbx-field">
                <label htmlFor="signin-username">Username or Work Email</label>
                <div className="dbx-input-wrap">
                  <svg className="dbx-input-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                  </svg>
                  <input
                    id="signin-username"
                    type="text"
                    placeholder="admin or work email"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    disabled={loading}
                    autoComplete="username"
                  />
                </div>
              </div>

              <div className="dbx-field">
                <div className="dbx-label-row">
                  <label htmlFor="signin-password">Password</label>
                  <span className="dbx-hint">Default: admin</span>
                </div>
                <div className="dbx-input-wrap">
                  <svg className="dbx-input-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                  <input
                    id="signin-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="dbx-pw-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex="-1"
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    )}
                  </button>
                </div>
              </div>

              <div className="dbx-form-options">
                <label className="dbx-checkbox-label">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  <span>Remember my workspace</span>
                </label>
              </div>

              <button type="submit" className="dbx-submit-btn" disabled={loading}>
                {loading ? "Signing in..." : "Sign In to Workspace"}
              </button>
            </form>
          )}

          {/* ═══════════════════════════════════════════════
              MODE 2: SIGN UP / REGISTRATION FORM
             ═══════════════════════════════════════════════ */}
          {mode === "signup" && (
            <form onSubmit={handleSignUp} className="dbx-form">
              <div className="dbx-row-2col">
                <div className="dbx-field">
                  <label htmlFor="signup-name">Full Name</label>
                  <input
                    id="signup-name"
                    type="text"
                    placeholder="e.g. Alex Johnson"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>
                <div className="dbx-field">
                  <label htmlFor="signup-email">Work Email</label>
                  <input
                    id="signup-email"
                    type="email"
                    placeholder="name@company.com"
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="dbx-row-2col">
                <div className="dbx-field">
                  <label htmlFor="signup-org">Organization / Company</label>
                  <input
                    id="signup-org"
                    type="text"
                    placeholder="Company or Team Name"
                    value={organization}
                    onChange={(e) => setOrganization(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>
                <div className="dbx-field">
                  <label htmlFor="signup-role">Professional Role</label>
                  <select
                    id="signup-role"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    disabled={loading}
                  >
                    <option value="Data Engineer">Data Engineer</option>
                    <option value="Analytics Engineer">Analytics Engineer</option>
                    <option value="Data Scientist / ML Engineer">Data Scientist / ML Engineer</option>
                    <option value="Data Governance Steward">Data Governance Steward</option>
                    <option value="Academic Reviewer / Student">Academic Reviewer / Student</option>
                  </select>
                </div>
              </div>

              {/* Workspace Tier Selector (Databricks Style) */}
              <div className="dbx-field">
                <label>Select Workspace Edition</label>
                <div className="dbx-tier-selector">
                  <button
                    type="button"
                    className={`dbx-tier-card ${tier === "Community Edition" ? "selected" : ""}`}
                    onClick={() => setTier("Community Edition")}
                  >
                    <div className="dbx-tier-header">
                      <span className="dbx-tier-name">Community Edition</span>
                      <span className="dbx-tier-badge">Free</span>
                    </div>
                    <span className="dbx-tier-desc">Developer sandbox with sample datasets & local execution</span>
                  </button>

                  <button
                    type="button"
                    className={`dbx-tier-card ${tier === "Enterprise Lakehouse" ? "selected" : ""}`}
                    onClick={() => setTier("Enterprise Lakehouse")}
                  >
                    <div className="dbx-tier-header">
                      <span className="dbx-tier-name">Enterprise Lakehouse</span>
                      <span className="dbx-tier-badge pro">Pro</span>
                    </div>
                    <span className="dbx-tier-desc">Full 12-Service hybrid cluster, Apache Spark 3.5 & ACID storage</span>
                  </button>
                </div>
              </div>

              <div className="dbx-row-2col">
                <div className="dbx-field">
                  <label htmlFor="signup-password">Password</label>
                  <input
                    id="signup-password"
                    type="password"
                    placeholder="At least 6 characters"
                    value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>
                <div className="dbx-field">
                  <label htmlFor="signup-confirm-password">Confirm Password</label>
                  <input
                    id="signup-confirm-password"
                    type="password"
                    placeholder="Repeat password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>
              </div>

              <button type="submit" className="dbx-submit-btn" disabled={loading}>
                {loading ? "Creating Account..." : "Create Lakehouse Account"}
              </button>
            </form>
          )}

          {/* ═══════════════════════════════════════════════
              INSTANT DEMO MODE (MANDATORY PRESERVED ACTION)
             ═══════════════════════════════════════════════ */}
          <div className="dbx-demo-section">
            <div className="dbx-demo-divider">
              <span>Academic Evaluation & Live Testing</span>
            </div>
            <button
              type="button"
              onClick={() => {
                loginAsDemo();
                navigate(from, { replace: true });
              }}
              className="dbx-demo-btn"
            >
              <div className="dbx-demo-icon">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                </svg>
              </div>
              <div className="dbx-demo-labels">
                <span className="dbx-demo-title">เข้าชมโหมด Demo (1-Click Instant Access)</span>
                <span className="dbx-demo-sub">ประเมินผลระบบได้ทันทีโดยไม่ต้องกรอกข้อมูล มีข้อมูลตัวอย่างและ Dashboard พร้อมใช้งาน</span>
              </div>
            </button>
          </div>

          <div className="dbx-footer-legal">
            <span>Protected by enterprise-grade session verification. By signing in, you agree to Data Serve Platform Terms.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
