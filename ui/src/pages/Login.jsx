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
      {/* Left Panel: Authentic Product Evidence & System Telemetry */}
      <div className="gs-login-sidebar">
        <div className="gs-login-sidebar-header">
          <span className="gs-login-sys-badge">SYSTEM STACK TELEMETRY</span>
          <h2>SDOQAP Medallion Flow</h2>
          <p>Adaptive data quality validation & safe schema auto-evolution</p>
        </div>

        <div className="gs-login-evidence-grid">
          {/* Active Data Ingestion Inflow */}
          <div className="gs-login-evidence-card">
            <h3>Active Ingest Sources</h3>
            <table className="gs-login-evidence-table">
              <thead>
                <tr>
                  <th>Channel</th>
                  <th>Type</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><code>reddit_streaming</code></td>
                  <td>KAFKA</td>
                  <td className="status-ok">● ACTIVE</td>
                </tr>
                <tr>
                  <td><code>postgres_jdbc</code></td>
                  <td>RDBMS</td>
                  <td className="status-idle">● IDLE</td>
                </tr>
                <tr>
                  <td><code>telemetry_api</code></td>
                  <td>REST</td>
                  <td className="status-ok">● ONLINE</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Active Schema Drift Rules */}
          <div className="gs-login-evidence-card">
            <h3>Validation Constraints</h3>
            <ul className="gs-login-constraints-list">
              <li>
                <span className="bullet-pass">✓</span>
                <div>
                  <strong>Null Check Rule</strong>
                  <small>Enforce strict non-null values on primary indices</small>
                </div>
              </li>
              <li>
                <span className="bullet-pass">✓</span>
                <div>
                  <strong>Schema Continuity</strong>
                  <small>Auto-detect column types & structural mutations</small>
                </div>
              </li>
              <li>
                <span className="bullet-warn">!</span>
                <div>
                  <strong>SLA Threshold Alert</strong>
                  <small>Halt pipelines if quality score drops below 95%</small>
                </div>
              </li>
            </ul>
          </div>

          {/* System Console Code Snippet */}
          <div className="gs-login-evidence-card wide">
            <h3>Active Delta Log Excerpt</h3>
            <pre className="gs-login-code">
{`{
  "commitInfo": {
    "timestamp": 1784395214292,
    "operation": "WRITE",
    "operationParameters": {"mode": "Append", "partitionBy": "[]"},
    "clientVersion": "delta-spark_2.12-3.1.0"
  }
}`}
            </pre>
          </div>
        </div>

        <div className="gs-login-sidebar-footer">
          <span>HDFS Directory Location: <code>hdfs://namenode:9000/data/raw/</code></span>
        </div>
      </div>

      {/* Right Panel: Left-Aligned Admin Authentication Form */}
      <div className="gs-login-main">
        <div className="gs-login-form-wrapper">
          <div className="gs-login-logo">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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

            <div className="gs-login-input-group">
              <label htmlFor="password">Password</label>
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

            <button type="submit" className="gs-login-submit-btn" disabled={loading}>
              {loading ? (
                <span className="gs-login-loading">Authenticating...</span>
              ) : (
                <span>Access Console</span>
              )}
            </button>
          </form>

          <div className="gs-login-bottom-info">
            <span>Protected by SDOQAP Security Agent • Session Cookie v2.0</span>
          </div>
        </div>
      </div>
    </div>
  );
}
