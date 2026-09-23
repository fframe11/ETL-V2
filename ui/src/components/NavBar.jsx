import React, { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import "./NavBar.css";

// --- SVG Icons ---
const HomeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
);

const DashboardIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>
);

const AnalyticsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
);

const PipelineIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>
);

const SchemaIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"/></svg>
);

const RulesIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>
);

const IngestionIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
);

const ExportIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
);

const RunsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 14 16 14"/></svg>
);

const GuideIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>
);

const TableIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="9" x2="9" y2="21"/></svg>
);

const SearchIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
);

const PanelCollapseIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
    <line x1="9" y1="3" x2="9" y2="21"/>
    <polyline points="16 15 13 12 16 9"/>
  </svg>
);

const PanelExpandIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
    <line x1="9" y1="3" x2="9" y2="21"/>
    <polyline points="13 15 16 12 13 9"/>
  </svg>
);

export default function NavBar({ isOpen, toggleSidebar, isSidebarOpen }) {
  const location = useLocation();
  const navigate = useNavigate();
  
  const isLoggedIn = !!sessionStorage.getItem("sdoqap_admin_token");

  // Notification badge states for pending governance items
  const [schemaCount, setSchemaCount] = useState(0);
  const [aiRulesCount, setAiRulesCount] = useState(0);
  const [collapsedGroups, setCollapsedGroups] = useState({});

  const toggleGroup = (key) => {
    setCollapsedGroups(prev => ({ ...prev, [key]: !prev[key] }));
  };

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

  const handleLogout = () => {
    sessionStorage.removeItem("sdoqap_admin_token");
    navigate("/login");
  };

  // Fetch services status for bottom panel
  const services = useApi('/services/status', { refreshInterval: 15000 });
  const isHealthy = !services.error && services.data && typeof services.data === 'object' && Object.values(services.data).every(s => s?.status === 'online');

  // Primary-First Navigation Ordering (Databricks Lakehouse Architecture):
  // 1) Lakehouse Workspace (Home + Runbook)
  // 2) Medallion Pipeline (Bronze Ingestion -> Delta Rules -> Silver Segregation -> Gold Export)
  // 3) Observability & Catalog (Executive Trust Dashboard, Audit, Analytics, Schemas)
  const menuGroups = [
    {
      title: "",
      key: "getting_started",
      links: [
        { to: "/", label: "Home", icon: <HomeIcon /> },
        { to: "/guide", label: "Learn & Architecture", icon: <GuideIcon /> },
        { to: "/schema", label: "Catalog", icon: <SchemaIcon />, badge: schemaCount > 0 ? schemaCount : null },
        { to: "/pipeline", label: "Jobs & Pipelines", icon: <PipelineIcon /> }
      ]
    },
    {
      title: "SQL",
      key: "sql_section",
      links: [
        { to: "/dashboard", label: "Dashboards", icon: <DashboardIcon /> },
        { to: aiRulesCount > 0 ? "/rules?tab=proposals" : "/rules", label: "Expectations & Alerts", icon: <RulesIcon />, badge: aiRulesCount > 0 ? aiRulesCount : null },
        { to: "/export", label: "Workspace Exports", icon: <ExportIcon /> },
        { to: "/analytics", label: "Query & Metrics", icon: <AnalyticsIcon /> }
      ]
    },
    {
      title: "Data Engineering",
      key: "data_eng_section",
      links: [
        { to: "/whitebox", label: "Runs", icon: <RunsIcon /> },
        { to: "/ingestion", label: "Data Ingestion", icon: <IngestionIcon /> }
      ]
    }
  ];

  // Command Palette states
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const searchInputRef = useRef(null);

  // Flatten all links for search
  const allLinks = menuGroups.reduce((acc, group) => {
    return [...acc, ...group.links.map(l => ({ ...l, category: group.title }))];
  }, []);

  const filteredLinks = allLinks.filter(link =>
    link.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    link.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Toggle Command Palette shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowSearchModal(prev => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Autofocus input when modal opens
  useEffect(() => {
    if (showSearchModal) {
      setSearchQuery("");
      setSelectedIndex(0);
      setTimeout(() => {
        if (searchInputRef.current) searchInputRef.current.focus();
      }, 50);
    }
  }, [showSearchModal]);

  // Keyboard navigation inside Command Palette
  const handleModalKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (filteredLinks.length > 0) setSelectedIndex(prev => (prev + 1) % filteredLinks.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (filteredLinks.length > 0) setSelectedIndex(prev => (prev - 1 + filteredLinks.length) % filteredLinks.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredLinks[selectedIndex]) {
        navigate(filteredLinks[selectedIndex].to);
        setShowSearchModal(false);
      }
    } else if (e.key === "Escape") {
      setShowSearchModal(false);
    }
  };

  const navOpen = isSidebarOpen !== undefined ? isSidebarOpen : isOpen;

  return (
    <>
      <aside className={`gs-nav ${navOpen ? "open" : "closed"}`}>
        {/* Interactive Right-Edge Rail — Click anywhere on the white sidebar border/rail to open/close */}
        <div
          className="gs-nav-edge-rail"
          onClick={(e) => {
            e.stopPropagation();
            toggleSidebar();
          }}
          title={navOpen ? "คลิกขอบแถบด้านข้างเพื่อพับเมนู" : "คลิกขอบแถบด้านข้างเพื่อกางเมนู"}
        >
          <span className="gs-nav-edge-grip" />
        </div>

        {/* Sidebar Header with Pro 3-Line Hamburger Icon */}
        <div className="gs-nav-logo" style={{ flexDirection: "row", justifyContent: navOpen ? "space-between" : "center", padding: navOpen ? "14px 16px" : "14px 8px" }}>
          {navOpen && (
            <Link to="/" className="gs-nav-brand" title="หน้าแรก (Home)" onClick={(e) => e.stopPropagation()}>
              <div className="gs-nav-logo-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                </svg>
              </div>
              <div className="gs-nav-logo-text">
                <span className="gs-nav-logo-name">SDOQAP</span>
                <span className="gs-nav-logo-sub">Lakehouse Engine</span>
              </div>
            </Link>
          )}
          <button
            type="button"
            className="gs-nav-hamburger-btn"
            onClick={(e) => {
              e.stopPropagation();
              toggleSidebar();
            }}
            title={navOpen ? "พับแถบเมนู (Collapse Sidebar)" : "เปิดแถบเมนู (Expand Sidebar)"}
            aria-label={navOpen ? "Collapse Sidebar" : "Expand Sidebar"}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        </div>

        {/* Databricks "+ New" Primary Action Button */}
        {navOpen ? (
          <div style={{ padding: "8px 12px 6px 12px" }}>
            <Link
              to="/ingestion"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                width: "100%",
                padding: "8px 12px",
                borderRadius: "6px",
                background: "rgba(255, 54, 33, 0.14)",
                border: "1px solid rgba(255, 54, 33, 0.32)",
                color: "#FF6B57",
                fontSize: "13px",
                fontWeight: 600,
                textDecoration: "none",
                boxSizing: "border-box"
              }}
            >
              <span style={{ fontSize: "16px", lineHeight: 1, fontWeight: 400 }}>+</span>
              <span>New</span>
            </Link>
          </div>
        ) : (
          <div style={{ display: "flex", justifyContent: "center", padding: "8px 0" }}>
            <Link
              to="/ingestion"
              title="+ New"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "32px",
                height: "32px",
                borderRadius: "6px",
                background: "rgba(255, 54, 33, 0.16)",
                border: "1px solid rgba(255, 54, 33, 0.35)",
                color: "#FF6B57",
                fontSize: "16px",
                fontWeight: 600,
                textDecoration: "none"
              }}
            >
              +
            </Link>
          </div>
        )}

        {/* Navigation Categories (Databricks Flat & Grouped Hierarchy) */}
        <div className="gs-nav-groups">
          {menuGroups.map((group) => {
            const isGroupCollapsed = !!collapsedGroups[group.key];
            return (
              <div className="gs-nav-group" key={group.key}>
                {navOpen && group.title && (
                  <button
                    type="button"
                    className="gs-nav-group-header"
                    onClick={() => toggleGroup(group.key)}
                    title="คลิกเพื่อพับหรือกางหมวดหมู่นี้"
                  >
                    <span className="gs-nav-group-label" style={{ padding: 0, textTransform: "none", fontSize: "11px", color: "#94A3B8" }}>{group.title}</span>
                    <span className="gs-nav-group-chevron">{isGroupCollapsed ? "▸" : "▾"}</span>
                  </button>
                )}
                {(!navOpen || !isGroupCollapsed) && (
                  <div className="gs-nav-items">
                    {group.links.map((link) => {
                      const cleanTo = link.to.split("?")[0];
                      const isActive = location.pathname === cleanTo || (cleanTo === "/guide" && location.pathname === "/guideline");
                      return (
                        <Link
                          key={link.to}
                          to={link.to}
                          className={`gs-nav-item ${isActive ? "active" : ""}`}
                          title={`${link.label}${link.stepTag ? ` (${link.stepTag})` : ""}`}
                        >
                          <span className="gs-nav-icon" style={{ position: "relative" }}>
                            {link.icon}
                            {!navOpen && link.badge && (
                              <span className="gs-nav-badge-dot" />
                            )}
                          </span>
                          {navOpen && (
                            <span className="gs-nav-label" style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {link.label}
                            </span>
                          )}
                          {navOpen && link.stepTag && !link.badge && (
                            <span
                              className="gs-nav-step-tag"
                              style={{
                                fontSize: "9px",
                                fontWeight: 800,
                                padding: "2px 5px",
                                borderRadius: "4px",
                                fontFamily: "var(--font-mono)",
                                background: isActive
                                  ? "rgba(255,255,255,0.22)"
                                  : link.highlightTag
                                  ? "#DCFCE7"
                                  : "#F1F5F9",
                                color: isActive
                                  ? "#FFFFFF"
                                  : link.highlightTag
                                  ? "#15803D"
                                  : "#475569",
                                border: isActive
                                  ? "1px solid rgba(255,255,255,0.35)"
                                  : link.highlightTag
                                  ? "1px solid #86EFAC"
                                  : "1px solid #E2E8F0"
                              }}
                            >
                              {link.stepTag}
                            </span>
                          )}
                          {navOpen && link.badge && (
                            <span className="gs-nav-badge">{link.badge}</span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Bottom System Status */}
        <div className="gs-nav-bottom">
          {isLoggedIn ? (
            navOpen ? (
              <button className="gs-nav-logout-btn" onClick={handleLogout}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                <span>Logout</span>
              </button>
            ) : (
              <button className="gs-nav-logout-btn collapsed" onClick={handleLogout} title="Logout">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              </button>
            )
          ) : (
            navOpen ? (
              <button className="gs-nav-login-btn" onClick={() => navigate("/login")}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
                <span>Admin Login</span>
              </button>
            ) : (
              <button className="gs-nav-login-btn collapsed" onClick={() => navigate("/login")} title="Admin Login">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
              </button>
            )
          )}
          {navOpen && (
            <div className="gs-nav-status">
              <span className={`gs-nav-status-dot ${isHealthy ? "online" : "offline"}`} />
              <span className="gs-nav-status-text">
                {isHealthy ? "API: HEALTHY" : "API: OFFLINE"}
              </span>
            </div>
          )}
          <div className="gs-nav-version" style={{ justifyContent: navOpen ? "space-between" : "center" }}>
            {navOpen && (
              <a href="https://github.com/ohmiler/gridgeist" target="_blank" rel="noreferrer" style={{ color: "var(--text-muted)", display: "flex" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/></svg>
              </a>
            )}
            <span style={{ fontSize: "9px" }}>v1.1.0</span>
          </div>
        </div>
      </aside>

      {/* Command Palette Modal */}
      {showSearchModal && (
        <div className="gs-search-overlay" onClick={() => setShowSearchModal(false)}>
          <div className="gs-search-modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center" }}>
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Type page name to navigate..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSelectedIndex(0);
                }}
                onKeyDown={handleModalKeyDown}
              />
            </div>

            <div style={{ maxHeight: "300px", overflowY: "auto" }}>
              {filteredLinks.length > 0 ? (
                filteredLinks.map((link, idx) => (
                  <div
                    key={link.to}
                    className={`gs-search-result`}
                    style={{
                      background: selectedIndex === idx ? "var(--accent-purple-light)" : "transparent",
                      color: selectedIndex === idx ? "var(--accent-purple)" : "var(--text-main)"
                    }}
                    onClick={() => {
                      navigate(link.to);
                      setShowSearchModal(false);
                    }}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    <span>{link.label}</span>
                    <span style={{ marginLeft: "auto", fontSize: "10px", color: "var(--text-muted)" }}>{link.category}</span>
                  </div>
                ))
              ) : (
                <div className="gs-search-empty">
                  No pages found matching "{searchQuery}"
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
