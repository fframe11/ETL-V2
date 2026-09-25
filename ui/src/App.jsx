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
import WhiteBoxPipeline from "./pages/WhiteBoxPipeline";
import Login from "./pages/Login";
import { useAuth } from "./hooks/useAuth";
import "./App.css";

function RequireAuth({ children }) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (isAuthenticated === null) {
    return <div style={{ padding: 48, textAlign: "center", color: "#64748B" }}>Checking session…</div>;
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return children;
}

function AppContent({ isSidebarOpen, toggleSidebar }) {
  const location = useLocation();
  const [schemaCount, setSchemaCount] = useState(0);
  const [aiRulesCount, setAiRulesCount] = useState(0);
  const [isAlertDismissed, setIsAlertDismissed] = useState(false);
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    const mainEl = document.querySelector(".app-main-content");
    if (mainEl) mainEl.scrollTop = 0;
  }, [location.pathname]);

  useEffect(() => {
    const fetchCounts = async () => {
      if (!isAuthenticated) return;

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
  }, [location.pathname, isAuthenticated]);
  const isLogin = location.pathname === "/login";

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

      <div className={`app-layout ${isSidebarOpen ? "sidebar-visible" : "sidebar-hidden"} layout-full-height`}>
        <NavBar
          isOpen={isSidebarOpen}
          toggleSidebar={toggleSidebar}
          isSidebarOpen={isSidebarOpen}
        />
        <main className="app-main-content">
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
              <Route path="/analytics" element={<RequireAuth><Analytics /></RequireAuth>} />
              <Route path="/pipeline" element={<RequireAuth><Pipeline /></RequireAuth>} />
              <Route path="/schema" element={<RequireAuth><Schema /></RequireAuth>} />
              <Route path="/rules" element={<RequireAuth><RulesConfig /></RequireAuth>} />
              <Route path="/guide" element={<RequireAuth><ConfigGuide /></RequireAuth>} />
              <Route path="/guideline" element={<RequireAuth><ConfigGuide /></RequireAuth>} />
              <Route path="/ingestion" element={<RequireAuth><Ingestion /></RequireAuth>} />
              <Route path="/export" element={<RequireAuth><DataExport /></RequireAuth>} />
              <Route path="/whitebox" element={<RequireAuth><WhiteBoxPipeline /></RequireAuth>} />
            </Routes>
          </ErrorBoundary>
        </main>
      </div>
    </>
  );
}

export default function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    const saved = localStorage.getItem("sdoqap_sidebar_open");
    return saved !== null ? saved === "true" : true;
  });

  const toggleSidebar = () => {
    setIsSidebarOpen(prev => {
      const next = !prev;
      localStorage.setItem("sdoqap_sidebar_open", String(next));
      return next;
    });
  };

  return (
    <BrowserRouter>
      <AppContent isSidebarOpen={isSidebarOpen} toggleSidebar={toggleSidebar} />
    </BrowserRouter>
  );
}
