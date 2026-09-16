import React, { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, useLocation, Navigate, Link } from "react-router-dom";
import NavBar from "./components/NavBar";
import ErrorBoundary from "./components/ErrorBoundary";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import Analytics from "./pages/Analytics";
import Pipeline from "./pages/Pipeline";
import Schema from "./pages/Schema";
import Ingestion from "./pages/Ingestion";
import DataExport from "./pages/DataExport";
import RulesConfig from "./pages/RulesConfig";
import ConfigGuide from "./pages/ConfigGuide";
import Login from "./pages/Login";
import "./App.css";

function RequireAuth({ children }) {
  const token = sessionStorage.getItem("sdoqap_admin_token");
  const location = useLocation();

  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}

function AppContent({ isSidebarOpen, toggleSidebar }) {
  const location = useLocation();
  const [schemaCount, setSchemaCount] = useState(0);
  const [aiRulesCount, setAiRulesCount] = useState(0);
  const [isAlertDismissed, setIsAlertDismissed] = useState(false);
  const isLoggedIn = !!sessionStorage.getItem("sdoqap_admin_token");

  useEffect(() => {
    const fetchCounts = async () => {
      const token = sessionStorage.getItem("sdoqap_admin_token");
      if (!token) return;

      try {
        const schemaRes = await fetch("/api/v1/schema/proposals");
        if (schemaRes.ok) {
          const schemaData = await schemaRes.json();
          const pendingSchema = schemaData.proposals ? schemaData.proposals.filter(p => p.status === "PENDING") : [];
          setSchemaCount(pendingSchema.length);
        }
      } catch (e) {
        console.error("Failed to fetch schema proposals count", e);
      }

      try {
        const aiRes = await fetch("/api/v1/rules/ai-proposals");
        if (aiRes.ok) {
          const aiData = await aiRes.json();
          setAiRulesCount(aiData.count || 0);
        }
      } catch (e) {
        console.error("Failed to fetch AI proposals count", e);
      }
    };

    fetchCounts();
    const interval = setInterval(fetchCounts, 10000);
    return () => clearInterval(interval);
  }, [location.pathname]);
  const isHome = location.pathname === "/";
  const isLogin = location.pathname === "/login";

  console.log("AppContent Render:", { schemaCount, aiRulesCount, isLoggedIn, isAlertDismissed, pathname: location.pathname });

  if (isLogin) {
    return (
      <ErrorBoundary>
        <Routes>
          <Route path="/login" element={<Login />} />
        </Routes>
      </ErrorBoundary>
    );
  }

  return (
    <>
      <div className="app-bg" />
      
      {/* Top Black Banner (Only rendered on Home page) */}
      {isHome && (
        <div className="top-banner">
          <span>SDOQAP Platform <span className="banner-badge">v2.0</span> is now live</span>
        </div>
      )}
      
      {/* Clerk White Header has been removed completely as requested */}

      <div className={`app-layout ${isSidebarOpen ? "sidebar-visible" : "sidebar-hidden"} ${isHome ? "layout-with-banner" : "layout-full-height"}`}>
        <NavBar
          isOpen={isSidebarOpen}
          toggleSidebar={toggleSidebar}
          isSidebarOpen={isSidebarOpen}
        />
        <main className="app-main-content">
          {!isSidebarOpen && (
            <button
              className="sidebar-toggle-btn"
              onClick={toggleSidebar}
              title="Open Sidebar"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="4" y1="12" x2="20" y2="12" />
                <line x1="4" y1="6" x2="20" y2="6" />
                <line x1="4" y1="18" x2="20" y2="18" />
              </svg>
            </button>
          )}

          {/* Global Action Required Alert Banner */}
          {isLoggedIn && !isAlertDismissed && (schemaCount > 0 || aiRulesCount > 0) && (
            <div style={{
              margin: '16px 24px 0 24px',
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              borderRadius: '12px',
              padding: '12px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              boxShadow: '0 4px 20px rgba(239, 68, 68, 0.06)'
            }}>
              <span style={{ fontSize: '18px' }}>🚨</span>
              <div style={{ flex: 1 }}>
                <span style={{ color: 'var(--text-main, #ffffff)', fontSize: '12.5px', fontWeight: 500 }}>
                  <strong>Action Required:</strong> There are {schemaCount > 0 ? `${schemaCount} Schema Drift proposal${schemaCount > 1 ? 's' : ''}` : ''} 
                  {schemaCount > 0 && aiRulesCount > 0 ? ' and ' : ''}
                  {aiRulesCount > 0 ? `${aiRulesCount} AI Rule proposal${aiRulesCount > 1 ? 's' : ''}` : ''} awaiting your review.
                </span>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {schemaCount > 0 && (
                  <Link to="/schema" style={{
                    padding: '6px 12px',
                    fontSize: '11px',
                    background: '#ef4444',
                    borderRadius: '6px',
                    color: '#ffffff',
                    textDecoration: 'none',
                    fontWeight: 600
                  }}>
                    Review Schema
                  </Link>
                )}
                {aiRulesCount > 0 && (
                  <Link to="/rules?tab=proposals" style={{
                    padding: '6px 12px',
                    fontSize: '11px',
                    background: 'var(--accent-purple, #6C47FF)',
                    borderRadius: '6px',
                    color: '#ffffff',
                    textDecoration: 'none',
                    fontWeight: 600
                  }}>
                    Review AI Rules
                  </Link>
                )}
                <button
                  onClick={() => setIsAlertDismissed(true)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted, #64748B)',
                    cursor: 'pointer',
                    fontSize: '14px',
                    padding: '4px',
                    marginLeft: '8px',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                  title="Dismiss Alert"
                >
                  ✕
                </button>
              </div>
            </div>
          )}
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<RequireAuth><Home /></RequireAuth>} />
              <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
              <Route path="/analytics" element={<RequireAuth><Analytics /></RequireAuth>} />
              <Route path="/pipeline" element={<RequireAuth><Pipeline /></RequireAuth>} />
              <Route path="/schema" element={<RequireAuth><Schema /></RequireAuth>} />
              <Route path="/rules" element={<RequireAuth><RulesConfig /></RequireAuth>} />
              <Route path="/guide" element={<RequireAuth><ConfigGuide /></RequireAuth>} />
              <Route path="/rules-config" element={<RequireAuth><RulesConfig /></RequireAuth>} />
              <Route path="/rules_config" element={<RequireAuth><RulesConfig /></RequireAuth>} />
              <Route path="/rules config" element={<RequireAuth><RulesConfig /></RequireAuth>} />
              <Route path="/ingestion" element={<RequireAuth><Ingestion /></RequireAuth>} />
              <Route path="/export" element={<RequireAuth><DataExport /></RequireAuth>} />
            </Routes>
          </ErrorBoundary>
        </main>
      </div>
    </>
  );
}

export default function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // Collapsed by default

  const toggleSidebar = () => {
    setIsSidebarOpen(prev => !prev);
  };

  return (
    <BrowserRouter>
      <AppContent isSidebarOpen={isSidebarOpen} toggleSidebar={toggleSidebar} />
    </BrowserRouter>
  );
}

