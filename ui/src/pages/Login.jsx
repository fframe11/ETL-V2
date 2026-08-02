import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import "./Login.css";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || "/dashboard";

  const handleLogin = (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    setTimeout(() => {
      if (username === "admin" && password === "sdoqap_secure") {
        localStorage.setItem("sdoqap_admin_token", "session_active_token_sdoqap");
        setLoading(false);
        navigate(from, { replace: true });
      } else {
        setError("Invalid credentials. Verify your access details.");
        setLoading(false);
      }
    }, 800);
  };

  return (
    <div className="gs-login-layout">
      <div className="gs-login-form-card">
        <div className="gs-login-logo">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
          </svg>
          <span className="gs-login-brand-text">SDOQAP Platform</span>
        </div>

        <div className="gs-login-form-header">
          <h2>Admin Login</h2>
          <p>Access the governance & observability control plane</p>
        </div>

        {error && (
          <div className="gs-login-error-banner">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="gs-login-auth-form">
          <div className="gs-login-input-group">
            <label htmlFor="username">Username</label>
            <div className="gs-login-input-wrapper">
              <svg className="gs-input-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              <input
                id="username"
                type="text"
                placeholder="Enter username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                disabled={loading}
                autoComplete="username"
              />
            </div>
          </div>

          <div className="gs-login-input-group">
            <label htmlFor="password">Password</label>
            <div className="gs-login-input-wrapper">
              <svg className="gs-input-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              <input
                id="password"
                type="password"
                placeholder="Enter secure password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                autoComplete="current-password"
              />
            </div>
          </div>

          <button type="submit" className="gs-login-submit-btn" disabled={loading}>
            {loading ? (
              <span className="gs-login-loading">Authenticating...</span>
            ) : (
              <span>Login</span>
            )}
          </button>
        </form>

        <div className="gs-login-bottom-info">
          <span>Protected by SDOQAP Security Agent • Session Cookie v2.0</span>
        </div>
      </div>
    </div>
  );
}
