import React, { useState, useEffect } from "react";
import { useApi, postApi } from "../hooks/useApi";
import Tooltip from "../components/Tooltip";
import ConfirmationModal from "../components/ConfirmationModal";
import "./RulesConfig.css";

const generateYamlDsl = (rules, tableName) => {
  if (!rules) return "";
  let yaml = `version: 1.0\n\nglobal:\n`;
  const schemaMode = rules.schema_mode || "strict";
  yaml += `  schema_mode: ${schemaMode}\n`;
  yaml += `  execution_id: auto\n`;
  yaml += `  dry_run: false\n\ncolumns:\n`;
  
  if (rules.remediation_rules && Array.isArray(rules.remediation_rules)) {
    rules.remediation_rules.forEach(r => {
      const col = r.column;
      if (r.type === "semantic_standardize") {
        yaml += `  ${col}:\n`;
        yaml += `    semantic:\n`;
        yaml += `      enabled: true\n`;
        yaml += `      threshold: ${r.threshold || 0.85}\n`;
        yaml += `      model_version: ${r.version || "v1.0"}\n`;
        yaml += `      low_confidence_policy: ${r.low_confidence_policy || "map_to_fallback"}\n`;
        yaml += `      semantic_type: ${r.semantic_type || "rule_based"}\n`;
        yaml += `      fallback: ${r.fallback || "original"}\n`;
        yaml += `    output:\n`;
        yaml += `      mode: ${r.output_mode || "enriched"}\n`;
        yaml += `      enriched_format: ${r.enriched_format || "struct"}\n`;
        yaml += `      preserve_raw: ${r.preserve_raw !== false}\n`;
        if (r.lineage_mode) {
          yaml += `      lineage_mode: ${r.lineage_mode}\n`;
        }
        if (r.enabled_lineage_fields && Array.isArray(r.enabled_lineage_fields)) {
          yaml += `      enabled_lineage_fields: [${r.enabled_lineage_fields.map(f => `"${f}"`).join(", ")}]\n`;
        }
      } else if (r.type === "auto_strategy" && r.strategies && r.strategies.includes("clean")) {
        yaml += `  ${col}:\n`;
        yaml += `    cleaning:\n`;
        yaml += `      type: numeric\n`;
        yaml += `    output:\n`;
        yaml += `      mode: clean_only\n`;
      } else if (r.type === "cast") {
        yaml += `  ${col}:\n`;
        yaml += `    cleaning:\n`;
        yaml += `      cast_to: ${r.to}\n`;
      }
    });
  }
  return yaml;
};

export default function RulesConfig() {
  const [activeTab, setActiveTab] = useState("tables"); // "tables" or "proposals" or "remediations"
  const [selectedTable, setSelectedTable] = useState("users");
  const [selectedProposalId, setSelectedProposalId] = useState(null);
  
  const [remediations, setRemediations] = useState([]);
  const [remediationsLoading, setRemediationsLoading] = useState(false);
  const [resolvingTicketId, setResolvingTicketId] = useState(null);
  const [remediationPage, setRemediationPage] = useState(1);
  const remediationPageSize = 8;

  useEffect(() => {
    setRemediationPage(1);
  }, [remediations]);

  // Modal configuration states
  const [modalOpen, setModalOpen] = useState(false);
  const [modalConfig, setModalConfig] = useState({ title: "", message: "", onConfirm: () => {} });

  const triggerConfirm = (title, message, onConfirm) => {
    setModalConfig({
      title,
      message,
      onConfirm: () => {
        onConfirm();
        setModalOpen(false);
      }
    });
    setModalOpen(true);
  };
  
  const [tables, setTables] = useState([]);
  const [reviewQueue, setReviewQueue] = useState([]);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewPage, setReviewPage] = useState(1);
  const reviewPageSize = 8;
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [overrideItemId, setOverrideItemId] = useState(null);
  const [customCategory, setCustomCategory] = useState("");
  const [editingItemId, setEditingItemId] = useState(null);
  const [editingValue, setEditingValue] = useState("");
  const [tablesLoading, setTablesLoading] = useState(true);
  const [detailTab, setDetailTab] = useState("edit"); // "edit" or "profile"

  // Fetch Table Config
  const [tableRules, setTableRules] = useState(null);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [rulesError, setRulesError] = useState(null);

  // Fetch Column Profiling
  const [profileData, setProfileData] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);

  // Proposals useApi
  const proposals = useApi("/rules/ai-proposals", { refreshInterval: 10000 });
  const [submitting, setSubmitting] = useState(false);
  const [actionResult, setActionResult] = useState(null);

  // Settings State Hooks
  const [groqApiKey, setGroqApiKey] = useState("");
  const [groqModel, setGroqModel] = useState("llama-3.3-70b-versatile");
  const [groqEnabled, setGroqEnabled] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState(null);

  const fetchSettings = async () => {
    setSettingsLoading(true);
    try {
      const res = await fetch("/api/v1/system/settings");
      if (res.ok) {
        const data = await res.json();
        setGroqApiKey(data.groq_api_key_masked || "");
        setGroqModel(data.groq_model || "llama-3.3-70b-versatile");
        setGroqEnabled(data.groq_enabled || false);
      }
    } catch (err) {
      console.error("Failed to fetch system settings");
    } finally {
      setSettingsLoading(false);
    }
  };

  const fetchRemediations = async () => {
    setRemediationsLoading(true);
    try {
      const res = await fetch("/api/v1/system/remediations");
      if (res.ok) {
        const data = await res.json();
        setRemediations(data.tickets || []);
      }
    } catch (err) {
      console.error("Failed to fetch upstream remediations");
    } finally {
      setRemediationsLoading(false);
    }
  };

  const handleResolveRemediation = (ticketId) => {
    triggerConfirm(
      "Confirm Ticket Resolution",
      `Are you sure you want to mark remediation ticket '${ticketId}' as RESOLVED? Confirm only if the upstream data system team has resolved the root cause of this anomaly.`,
      async () => {
        setResolvingTicketId(ticketId);
        try {
          const res = await fetch(`/api/v1/system/remediations/${ticketId}/resolve`, {
            method: "POST"
          });
          if (res.ok) {
            fetchRemediations();
          }
        } catch (err) {
          console.error("Failed to resolve ticket", err);
        } finally {
          setResolvingTicketId(null);
        }
      }
    );
  };

  const fetchReviewQueue = async () => {
    setReviewLoading(true);
    try {
      const res = await fetch("/api/v1/standardize/review-queue");
      if (res.ok) {
        const data = await res.json();
        setReviewQueue(data.items || []);
      }
    } catch (err) {
      console.error("Failed to fetch standardize review queue:", err);
    } finally {
      setReviewLoading(false);
    }
  };

  const handleApproveStandardize = (itemId) => {
    triggerConfirm(
      "Confirm Category Approval",
      "Are you sure you want to approve this suggested category standardization? This will update the memory mappings configuration.",
      async () => {
        try {
          const res = await fetch(`/api/v1/standardize/review-queue/${itemId}/approve`, {
            method: "POST"
          });
          if (res.ok) {
            setActionResult({ success: true, message: "Category mapping approved and updated." });
            fetchReviewQueue();
          } else {
            setActionResult({ success: false, message: "Failed to approve category." });
          }
        } catch (err) {
          setActionResult({ success: false, message: "Error approving category mapping." });
        }
      }
    );
  };

  const handleRejectStandardize = (itemId) => {
    triggerConfirm(
      "Confirm Rejection",
      "Are you sure you want to reject this item? It will be removed from the review queue and ignored.",
      async () => {
        try {
          const res = await fetch(`/api/v1/standardize/review-queue/${itemId}/reject`, {
            method: "POST"
          });
          if (res.ok) {
            setActionResult({ success: true, message: "Item rejected and removed from queue." });
            fetchReviewQueue();
          } else {
            setActionResult({ success: false, message: "Failed to reject item." });
          }
        } catch (err) {
          setActionResult({ success: false, message: "Error rejecting item." });
        }
      }
    );
  };

  const handleOverrideStandardize = async (itemId, categoryVal) => {
    try {
      const res = await fetch(`/api/v1/standardize/review-queue/${itemId}/override`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved_category: categoryVal })
      });
      if (res.ok) {
        setActionResult({ success: true, message: "Category mapping overridden and updated." });
        fetchReviewQueue();
      } else {
        setActionResult({ success: false, message: "Failed to override category." });
      }
    } catch (err) {
      setActionResult({ success: false, message: "Error overriding category mapping." });
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  useEffect(() => {
    if (activeTab === "remediations") {
      fetchRemediations();
    }
    if (activeTab === "standardize") {
      fetchReviewQueue();
    }
  }, [activeTab]);

  const handleSaveSettings = (e) => {
    e.preventDefault();
    triggerConfirm(
      "Confirm Global Settings Update",
      "Are you sure you want to update the global AI Advisor configuration? Toggling AI settings affects the fallback behavior of all running quality pipelines.",
      async () => {
        setSettingsSaving(true);
        setSettingsMessage(null);
        try {
          const res = await fetch("/api/v1/system/settings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              groq_api_key: groqApiKey,
              groq_model: groqModel,
              groq_enabled: groqEnabled
            })
          });
          if (res.ok) {
            setSettingsMessage({ type: "success", text: "Settings saved successfully!" });
            fetchSettings();
          } else {
            const errData = await res.json();
            setSettingsMessage({ type: "critical", text: errData.detail || "Failed to save settings." });
          }
        } catch (err) {
          setSettingsMessage({ type: "critical", text: "Error connecting to settings API." });
        } finally {
          setSettingsSaving(false);
        }
      }
    );
  };

  // Load tables list
  const fetchTables = async () => {
    setTablesLoading(true);
    try {
      const res = await fetch("/api/v1/export/tables");
      if (res.ok) {
        const data = await res.json();
        const all = data.tables ? data.tables.map(t => t.name) : [];
        setTables(all.sort());
        if (all.length > 0 && selectedTable === "users") {
          setSelectedTable(all[0]);
        }
      }
    } catch (err) {
      console.error("Failed to load tables list.");
    } finally {
      setTablesLoading(false);
    }
  };

  useEffect(() => {
    fetchTables();
  }, []);

  // Fetch specific table rules
  const fetchTableRules = async (tbl) => {
    setRulesLoading(true);
    setRulesError(null);
    try {
      const res = await fetch(`/api/v1/rules/${tbl}`);
      if (res.ok) {
        const data = await res.json();
        setTableRules(data.effective_rules);
      } else {
        setRulesError("Failed to fetch rules config.");
      }
    } catch (err) {
      setRulesError("Error connecting to rules API.");
    } finally {
      setRulesLoading(false);
    }
  };

  // Fetch specific table profiles
  const fetchTableProfile = async (tbl) => {
    setProfileLoading(true);
    setProfileData(null);
    try {
      const res = await fetch(`/api/v1/rules/profiles/${tbl}`);
      if (res.ok) {
        const data = await res.json();
        setProfileData(data);
      }
    } catch (err) {
      console.error("Failed to fetch profiles.");
    } finally {
      setProfileLoading(false);
    }
  };

  useEffect(() => {
    if (selectedTable && activeTab === "tables") {
      fetchTableRules(selectedTable);
      fetchTableProfile(selectedTable);
    }
  }, [selectedTable, activeTab]);

  // Handle saving rules changes
  const handleSaveRules = (e) => {
    e.preventDefault();
    triggerConfirm(
      "Confirm Rules Update",
      `Are you sure you want to update the quality parameters for table '${selectedTable}'? This will immediately affect all incoming ingestion pipelines.`,
      async () => {
        setSubmitting(true);
        setActionResult(null);
        try {
          const res = await fetch(`/api/v1/rules/${selectedTable}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(tableRules)
          });
          if (res.ok) {
            setActionResult({ success: true, message: `Rules for '${selectedTable}' updated successfully.` });
            fetchTableRules(selectedTable);
          } else {
            const err = await res.json();
            setActionResult({ success: false, message: err.detail || "Failed to update rules." });
          }
        } catch (err) {
          setActionResult({ success: false, message: "Error updating rules config." });
        } finally {
          setSubmitting(false);
        }
      }
    );
  };

  // Handle proposals actions
  const handleProposalAction = (id, action) => {
    const actionLabel = action === "approve" ? "APPROVE" : "REJECT";
    triggerConfirm(
      `Confirm Proposal ${actionLabel}`,
      `Are you sure you want to ${action} this AI-suggested rule modification? Approving it will merge the suggestions directly into the active rules registry.`,
      async () => {
        setSubmitting(true);
        setActionResult(null);
        try {
          const res = await postApi(`/rules/ai-proposals/${id}/${action}`);
          setActionResult({ success: true, message: `AI Proposal ${action}d successfully. Config updated.` });
          setSelectedProposalId(null);
          proposals.refetch();
          if (selectedTable) {
            fetchTableRules(selectedTable);
          }
        } catch (err) {
          setActionResult({ success: false, message: `Failed to ${action} proposal: ${err.message}` });
        } finally {
          setSubmitting(false);
        }
      }
    );
  };

  // Deep update helper
  const updateNestedKey = (key, subkey, val) => {
    setTableRules(prev => {
      if (!prev) return prev;
      const copy = { ...prev };
      if (copy[key] && typeof copy[key] === "object") {
        copy[key] = { ...copy[key], [subkey]: val };
      } else {
        copy[key] = { [subkey]: val };
      }
      return copy;
    });
  };

  const proposalsList = proposals.data?.proposals || [];
  const selectedProposal = proposalsList.find(p => p.id === selectedProposalId || p.run_id === selectedProposalId || p._id === selectedProposalId);

  return (
    <div className="gs-rules">
      {/* 1. Page Header */}
      <div className="gs-page-header">
        <div>
          <h1 className="gs-page-title">Governance <span>Rules Registry</span></h1>
          <p className="gs-page-desc">Configure quality thresholds, trace root-causes upstream, and apply AI recommendation rules</p>
        </div>
      </div>

      {actionResult && (
        <div className={`gs-toast ${actionResult.success ? 'ok' : 'err'}`}>
          {actionResult.message}
        </div>
      )}

      {/* 2. Main Navigation Tabs */}
      <div className="gs-rules-tabs">
        <button className={`gs-rules-tab-btn ${activeTab === "tables" ? "active" : ""}`} onClick={() => { setActiveTab("tables"); setActionResult(null); }}>
          Table Rules
        </button>
        <button className={`gs-rules-tab-btn ${activeTab === "proposals" ? "active" : ""}`} onClick={() => { setActiveTab("proposals"); setActionResult(null); }}>
          AI Proposals
          {proposalsList.length > 0 && <span className="gs-badge-count">{proposalsList.length}</span>}
        </button>
        <button className={`gs-rules-tab-btn ${activeTab === "settings" ? "active" : ""}`} onClick={() => { setActiveTab("settings"); setActionResult(null); }}>
          AI Settings
        </button>
        <button className={`gs-rules-tab-btn ${activeTab === "remediations" ? "active" : ""}`} onClick={() => { setActiveTab("remediations"); setActionResult(null); }}>
          Upstream Governance
          {remediations.filter(t => t.status === "OPEN").length > 0 && (
            <span className="gs-badge-count">{remediations.filter(t => t.status === "OPEN").length}</span>
          )}
        </button>
        <button className={`gs-rules-tab-btn ${activeTab === "standardize" ? "active" : ""}`} onClick={() => { setActiveTab("standardize"); setActionResult(null); }}>
          Standardization Review
          {reviewQueue.length > 0 && (
            <span className="gs-badge-count">{reviewQueue.length}</span>
          )}
        </button>
      </div>

      {/* 3. Tab Workspace render */}
      {activeTab === "tables" && (
        <div className="gs-rules-layout">
          {/* Left: Table Catalogs */}
          <div className="gs-rules-list">
            <div className="gs-rcard">
              <h3>Table Catalogs</h3>
              <div className="gs-list-items">
                {tablesLoading ? (
                  <div className="gs-empty">Loading catalog...</div>
                ) : tables.map((tbl) => {
                  const isSelected = tbl === selectedTable;
                  return (
                    <div
                      key={tbl}
                      className={`gs-list-item ${isSelected ? "selected" : ""}`}
                      onClick={() => { setSelectedTable(tbl); setActionResult(null); }}
                    >
                      <strong>{tbl}</strong>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right: Rules Form & Profile */}
          <div className="gs-rules-workspace">
            <div className="gs-rcard">
              <div className="gs-editor-header">
                <h2>Rules Control Workspace: <span>{selectedTable}</span></h2>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button className={`gs-btn-outline ${detailTab === "edit" ? "active" : ""}`} onClick={() => setDetailTab("edit")}>Rules Editor</button>
                  <button className={`gs-btn-outline ${detailTab === "yaml" ? "active" : ""}`} onClick={() => setDetailTab("yaml")}>YAML DSL Export</button>
                  <button className={`gs-btn-outline ${detailTab === "profile" ? "active" : ""}`} onClick={() => setDetailTab("profile")}>Column Profiler</button>
                </div>
              </div>

              {rulesLoading ? (
                <div className="gs-empty">Fetching configuration variables...</div>
              ) : rulesError ? (
                <div className="gs-toast err">{rulesError}</div>
              ) : tableRules ? (
                detailTab === "edit" ? (
                  <form onSubmit={handleSaveRules} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    
                    <div className="gs-editor-grid">
                      {/* Quality checks */}
                      <div className="gs-input-grp">
                        <label>Quality Validation Mode</label>
                        <select
                          value={typeof tableRules.quality_score_threshold === "object" ? tableRules.quality_score_threshold.mode : "strict"}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (typeof tableRules.quality_score_threshold === "object") {
                              updateNestedKey("quality_score_threshold", "mode", val);
                            } else {
                              setTableRules(prev => ({
                                ...prev,
                                quality_score_threshold: { mode: val, base_value: prev.quality_score_threshold || 90.0, min_value: 70.0 }
                              }));
                            }
                          }}
                        >
                          <option value="strict">Strict Static Threshold</option>
                          <option value="adaptive">Adaptive Dynamic Bounds</option>
                        </select>
                      </div>

                      <div className="gs-input-grp">
                        <label>Base Target Score (%)</label>
                        <input
                          type="number"
                          step="0.1"
                          value={typeof tableRules.quality_score_threshold === "object" ? (tableRules.quality_score_threshold.base_value || 90.0) : tableRules.quality_score_threshold}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0.0;
                            if (typeof tableRules.quality_score_threshold === "object") {
                              updateNestedKey("quality_score_threshold", "base_value", val);
                            } else {
                              setTableRules(prev => ({ ...prev, quality_score_threshold: val }));
                            }
                          }}
                        />
                      </div>
                    </div>

                    <div className="gs-editor-grid">
                      {/* Freshness */}
                      <div className="gs-input-grp">
                        <label>Data Freshness Mode</label>
                        <select
                          value={typeof tableRules.freshness_threshold_hours === "object" ? tableRules.freshness_threshold_hours.mode : "strict"}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (typeof tableRules.freshness_threshold_hours === "object") {
                              updateNestedKey("freshness_threshold_hours", "mode", val);
                            } else {
                              setTableRules(prev => ({
                                ...prev,
                                freshness_threshold_hours: { mode: val, base_value: prev.freshness_threshold_hours || 48 }
                              }));
                            }
                          }}
                        >
                          <option value="strict">Strict Static Delay</option>
                          <option value="adaptive">Adaptive Learned Delay</option>
                        </select>
                      </div>

                      <div className="gs-input-grp">
                        <label>Max Allowed Delay (Hours)</label>
                        <input
                          type="number"
                          value={
                            typeof tableRules.freshness_threshold_hours === "object"
                              ? tableRules.freshness_threshold_hours.base_value !== null
                                ? tableRules.freshness_threshold_hours.base_value
                                : ""
                              : tableRules.freshness_threshold_hours || ""
                          }
                          onChange={(e) => {
                            const val = e.target.value === "" ? null : parseInt(e.target.value);
                            if (typeof tableRules.freshness_threshold_hours === "object") {
                              updateNestedKey("freshness_threshold_hours", "base_value", val);
                            } else {
                              setTableRules(prev => ({ ...prev, freshness_threshold_hours: val }));
                            }
                          }}
                        />
                      </div>
                    </div>

                    <div className="gs-editor-grid">
                      <div className="gs-input-grp">
                        <label>Null Checks Constraint Mode</label>
                        <select
                          value={tableRules.null_checks?.mode || "adaptive"}
                          onChange={(e) => updateNestedKey("null_checks", "mode", e.target.value)}
                        >
                          <option value="strict">Strict (Reject any Nulls)</option>
                          <option value="adaptive">Adaptive Tolerance Limits</option>
                        </select>
                      </div>

                      <div className="gs-input-grp">
                        <label>Outliers (IQR) Range Mode</label>
                        <select
                          value={tableRules.value_range?.mode || "auto"}
                          onChange={(e) => updateNestedKey("value_range", "mode", e.target.value)}
                        >
                          <option value="off">Off (Disable check)</option>
                          <option value="auto">Auto IQR</option>
                          <option value="adaptive">Adaptive Profile Bounds</option>
                        </select>
                      </div>
                    </div>

                    <div className="gs-editor-grid">
                      <div className="gs-input-grp" style={{ flexDirection: 'row', alignItems: 'center', gap: '8px', paddingTop: '10px' }}>
                        <input
                          type="checkbox"
                          id="ai_enabled"
                          checked={tableRules.ai_advisor?.enabled || false}
                          onChange={(e) => updateNestedKey("ai_advisor", "enabled", e.target.checked)}
                          style={{ width: "16px", height: "16px", accentColor: "var(--accent-purple)" }}
                        />
                        <label htmlFor="ai_enabled" style={{ cursor: "pointer", fontSize: '11px', color: 'var(--text-main)' }}>
                          Enable AI Rule Advisor
                        </label>
                      </div>

                      <div className="gs-input-grp">
                        <label>Model Selector</label>
                        <input
                          type="text"
                          value={tableRules.ai_advisor?.model || "llama-3.3-70b-versatile"}
                          onChange={(e) => updateNestedKey("ai_advisor", "model", e.target.value)}
                        />
                      </div>
                    </div>

                    <button type="submit" disabled={submitting} className="gs-btn-save" style={{ alignSelf: 'flex-end', marginTop: '10px' }}>
                      {submitting ? "Saving..." : "Save Rule Overrides"}
                    </button>
                  </form>
                ) : detailTab === "yaml" ? (
                  /* YAML DSL Export View */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      Declarative YAML Specification file for PySpark Ingestion Pipelines. Copy this file into your Spark cluster directory or import it into your code via <code>SemanticCleaner(config='rules.yaml')</code>.
                    </p>
                    <textarea
                      readOnly
                      value={generateYamlDsl(tableRules, selectedTable)}
                      style={{
                        width: '100%',
                        height: '350px',
                        background: 'var(--bg-secondary)',
                        color: 'var(--accent-green)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '6px',
                        padding: '12px',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '11px',
                        lineHeight: '1.5',
                        resize: 'none'
                      }}
                    />
                    <div style={{ display: 'flex', gap: '8px', alignSelf: 'flex-end' }}>
                      <button
                        type="button"
                        className="gs-btn-outline"
                        style={{ padding: '6px 12px', fontSize: '11.5px' }}
                        onClick={() => {
                          const yamlText = generateYamlDsl(tableRules, selectedTable);
                          navigator.clipboard.writeText(yamlText);
                          setActionResult({ success: true, message: "YAML copied to clipboard!" });
                        }}
                      >
                        Copy YAML
                      </button>
                      <button
                        type="button"
                        className="gs-btn-save"
                        style={{ padding: '6px 12px', fontSize: '11.5px' }}
                        onClick={() => {
                          const yamlText = generateYamlDsl(tableRules, selectedTable);
                          const blob = new Blob([yamlText], { type: "text/yaml" });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = `${selectedTable}_rules.yaml`;
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                      >
                        Download DSL Config
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Profiler Column Metrics */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {profileLoading ? (
                      <div className="gs-empty">Loading profiler bounds...</div>
                    ) : profileData ? (
                      <>
                        <div style={{ fontSize: "11px", color: "var(--text-muted)", background: "var(--bg-primary)", padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--border-color)", fontFamily: 'var(--font-mono)' }}>
                          Run ID: <strong>{profileData.run_id}</strong> | Timestamp: {new Date(profileData.timestamp).toLocaleString()}
                        </div>

                        {profileData.null_profile && (
                          <div>
                            <h4 style={{ fontSize: "11.5px", fontWeight: 800, color: "var(--text-main)", marginBottom: "6px", textTransform: 'uppercase' }}>Null Rates Profile</h4>
                            <table className="gs-governance-table">
                              <thead>
                                <tr>
                                  <th>Column</th>
                                  <th>Current Null Rate</th>
                                  <th>Tolerance Limit</th>
                                  <th>Required Column</th>
                                </tr>
                              </thead>
                              <tbody>
                                {Object.entries(profileData.null_profile).map(([col, data]) => (
                                  <tr key={col}>
                                    <td className="gs-mono" style={{ color: 'var(--accent-purple)' }}>{col}</td>
                                    <td className="gs-mono">{(data.null_rate * 100).toFixed(2)}%</td>
                                    <td className="gs-mono">{(data.tolerance * 100).toFixed(1)}%</td>
                                    <td>
                                      <span style={{ color: data.is_required ? "var(--accent-red)" : "var(--accent-green)", fontWeight: 700 }}>
                                        {data.is_required ? "YES" : "NO"}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {profileData.value_ranges && Object.keys(profileData.value_ranges).length > 0 && (
                          <div>
                            <h4 style={{ fontSize: "11.5px", fontWeight: 800, color: "var(--text-main)", marginBottom: "6px", textTransform: 'uppercase' }}>Numeric IQR Outliers Acceptable Bounds</h4>
                            <table className="gs-governance-table">
                              <thead>
                                <tr>
                                  <th>Column</th>
                                  <th>Q1 (25th)</th>
                                  <th>Q3 (75th)</th>
                                  <th>IQR Fences (Min to Max)</th>
                                </tr>
                              </thead>
                              <tbody>
                                {Object.entries(profileData.value_ranges).map(([col, data]) => (
                                  <tr key={col}>
                                    <td className="gs-mono" style={{ color: 'var(--accent-purple)' }}>{col}</td>
                                    <td className="gs-mono">{data.q1?.toFixed(2) || "0.0"}</td>
                                    <td className="gs-mono">{data.q3?.toFixed(2) || "0.0"}</td>
                                    <td className="gs-mono">
                                      <code>{data.lower_bound?.toFixed(1) || "-inf"}</code> to <code>{data.upper_bound?.toFixed(1) || "+inf"}</code>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="gs-empty">No profiled logs active for this table. Trigger pipeline to profiling columns.</div>
                    )}
                  </div>
                )
              ) : (
                <div className="gs-empty">Select table from catalog list</div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === "proposals" && (
        <div className="gs-rules-layout">
          {/* Left: Proposals list */}
          <div className="gs-rules-list">
            <div className="gs-rcard">
              <h3>Advisor Proposals</h3>
              <div className="gs-list-items">
                {proposals.loading ? (
                  <div className="gs-empty">Loading proposals...</div>
                ) : proposalsList.length === 0 ? (
                  <div className="gs-empty">No active rule proposals from AI Advisor</div>
                ) : (
                  proposalsList.map((p) => {
                    const isSelected = p.id === selectedProposalId || p.run_id === selectedProposalId || p._id === selectedProposalId;
                    return (
                      <div
                        key={p.id || p.run_id || p._id}
                        className={`gs-proposal-item gs-list-item ${isSelected ? "selected" : ""}`}
                        onClick={() => { setSelectedProposalId(p.id || p.run_id); setActionResult(null); }}
                      >
                        <div style={{ display: "flex", justify: "space-between", alignItems: "center", marginBottom: "4px" }}>
                          <span style={{ fontSize: "12px", fontWeight: 700 }}>{p.table_name}</span>
                          <span style={{
                            fontSize: "8.5px",
                            fontWeight: "bold",
                            padding: "2px 6px",
                            borderRadius: "4px",
                            background: (p.analysis_result?.confidence ?? 0) > 0.8 ? "#d1fae5" : "#fff7ed",
                            color: (p.analysis_result?.confidence ?? 0) > 0.8 ? "var(--accent-green)" : "var(--accent-yellow)"
                          }}>
                            {((p.analysis_result?.confidence ?? 0) * 100).toFixed(0)}% Conf
                          </span>
                        </div>
                        <div style={{ fontSize: "9.5px", color: "var(--text-muted)", fontFamily: 'var(--font-mono)' }}>
                          Proposed: {new Date(p.proposed_at || p.timestamp).toLocaleTimeString([], { hour12: false })}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Right: Proposal detailed workspace */}
          <div className="gs-rules-workspace">
            {selectedProposal ? (
              <div className="gs-rcard">
                <div className="gs-editor-header">
                  <h2>Proposal Workspace: <span>{selectedProposal.table_name}</span></h2>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "14px", fontWeight: "bold", color: "var(--accent-purple)", fontFamily: 'var(--font-mono)' }}>
                      {((selectedProposal.analysis_result?.confidence ?? 0) * 100).toFixed(0)}% Confidence
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div className="gs-ai-alert">
                    <h4>AI Advisor Root Cause Diagnostic</h4>
                    <p>{selectedProposal.analysis_result?.root_cause}</p>
                  </div>

                  <div style={{ padding: '10px 14px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                    <h4 style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-main)', textTransform: 'uppercase', marginBottom: '4px' }}>Detailed Explanation</h4>
                    <p style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.45' }}>{selectedProposal.analysis_result?.explanation}</p>
                  </div>

                  {selectedProposal.analysis_result?.suggested_rules && selectedProposal.analysis_result.suggested_rules.length > 0 && (
                    <div className="gs-suggested-rules">
                      <h4>Suggested Rule Adjustments</h4>
                      {selectedProposal.analysis_result.suggested_rules.map((rule, idx) => (
                        <div key={idx} className="gs-suggested-rule-item">
                          <div className="gs-srule-head">
                            <span className="gs-srule-col">{rule.column || rule.rule_path}</span>
                            <span className="gs-srule-type">{rule.rule_type || rule.action}</span>
                          </div>
                          <div style={{ color: 'var(--text-main)', marginBottom: '4px' }} className="gs-mono">
                            <strong>Value Parameters:</strong> <code>{JSON.stringify(rule.params || rule.value)}</code>
                          </div>
                          <div style={{ color: 'var(--text-muted)', fontSize: '10px', borderTop: '1px dashed var(--border-color)', paddingTop: '4px', marginTop: '4px' }}>
                            <strong>Reasoning:</strong> {rule.reason}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {selectedProposal.analysis_result?.recommended_threshold && (
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "rgba(16,185,129,0.04)", border: "1px solid rgba(16,185,129,0.1)", padding: "10px", borderRadius: "8px", fontSize: '11px' }}>
                      <span style={{ color: 'var(--accent-green)', fontWeight: 700 }}>✓</span>
                      <span>AI Recommended quality score limit: <strong>{selectedProposal.analysis_result.recommended_threshold.toFixed(1)}%</strong></span>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '8px', alignSelf: 'flex-end', marginTop: '10px' }}>
                    <button
                      disabled={submitting}
                      className="gs-btn-save"
                      onClick={() => handleProposalAction(selectedProposal._id || selectedProposal.run_id, "approve")}
                    >
                      {submitting ? "Merging..." : "Approve & Merge"}
                    </button>
                    <button
                      disabled={submitting}
                      className="gs-btn-outline"
                      style={{ color: 'var(--accent-red)', borderColor: 'var(--accent-red)' }}
                      onClick={() => handleProposalAction(selectedProposal._id || selectedProposal.run_id, "reject")}
                    >
                      Reject Proposal
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="gs-workspace-placeholder">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent-purple)', marginBottom: '8px' }}><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A5 5 0 0 0 8 8c0 1 .3 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>
                <p>Select an AI Advisor rule proposal from the left catalog pane to review suggested threshold adjustments and root-causes.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "settings" && (
        <div className="gs-rcard" style={{ maxWidth: '540px', margin: '20px auto 0' }}>
          <h3>Global AI Advisor Settings</h3>
          <form onSubmit={handleSaveSettings} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
              Configure Groq API keys to fallback from static heuristics checks to LLM-driven root cause diagnostic analysis.
            </p>

            <div className="gs-input-grp">
              <label>Groq API Auth Key</label>
              <input
                type="password"
                placeholder="gsk_••••••••••••••••"
                value={groqApiKey}
                onChange={(e) => setGroqApiKey(e.target.value)}
              />
            </div>

            <div className="gs-input-grp">
              <label>Model Version</label>
              <select value={groqModel} onChange={(e) => setGroqModel(e.target.value)}>
                <option value="llama-3.3-70b-versatile">Groq Llama 3.3 70B (Recommended)</option>
                <option value="llama-3.1-8b-instant">Groq Llama 3.1 8B (Instant)</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-primary)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <input
                type="checkbox"
                id="groq_enabled"
                checked={groqEnabled}
                onChange={(e) => setGroqEnabled(e.target.checked)}
                style={{ width: "16px", height: "16px", accentColor: "var(--accent-purple)" }}
              />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <label htmlFor="groq_enabled" style={{ fontSize: '11.5px', color: 'var(--text-main)', fontWeight: 700, cursor: 'pointer' }}>Enable LLM advisor checks</label>
                <span style={{ fontSize: '9.5px', color: 'var(--text-muted)', marginTop: '2px' }}>If unchecked, falls back to zero-dependency local heuristics rules</span>
              </div>
            </div>

            <button type="submit" disabled={settingsSaving} className="gs-btn-save" style={{ alignSelf: 'flex-end', marginTop: '10px' }}>
              {settingsSaving ? "Saving..." : "Save Settings"}
            </button>
          </form>
        </div>
      )}

      {activeTab === "remediations" && (() => {
        const openTickets = remediations.filter(t => t.status === "OPEN");
        const resolvedTickets = remediations.filter(t => t.status === "RESOLVED");
        const totalTicketsCount = remediations.length;
        const resolutionRate = totalTicketsCount ? Math.round((resolvedTickets.length / totalTicketsCount) * 100) : 100;
        const criticalCount = openTickets.filter(t => t.severity === "critical").length;
        const warningCount = openTickets.filter(t => t.severity === "warning").length;
        
        let mostUnstableSystem = "None";
        const systemCounts = {};
        openTickets.forEach(t => {
          systemCounts[t.target_system] = (systemCounts[t.target_system] || 0) + 1;
        });
        let maxSystemCount = 0;
        Object.entries(systemCounts).forEach(([sys, count]) => {
          if (count > maxSystemCount) {
            maxSystemCount = count;
            mostUnstableSystem = sys;
          }
        });
        if (mostUnstableSystem !== "None") {
          mostUnstableSystem = `${mostUnstableSystem} (${maxSystemCount} open)`;
        }

        const paginatedRemediations = remediations.slice((remediationPage - 1) * remediationPageSize, remediationPage * remediationPageSize);
        const totalPages = Math.ceil(remediations.length / remediationPageSize) || 1;

        return (
          <div className="gs-rcard">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
              <h3>Upstream Remediation Governance</h3>
              <button onClick={fetchRemediations} disabled={remediationsLoading} className="gs-btn-outline">
                {remediationsLoading ? "Refreshing..." : "Refresh Logs"}
              </button>
            </div>

            {remediations.length > 0 && (
              <div className="gs-upstream-hero">
                <div className="gs-upstream-stat">
                  <span className="gs-ustat-val">{openTickets.length}</span>
                  <span className="gs-ustat-lbl">Active Open Tickets</span>
                  <span className="gs-ustat-sub">{criticalCount} critical | {warningCount} warn</span>
                </div>
                <div className="gs-upstream-stat">
                  <span className="gs-upstream-stat">
                    <span className="gs-ustat-val" style={{ color: 'var(--accent-green)' }}>{resolutionRate}%</span>
                    <span className="gs-ustat-lbl">Resolution Rate</span>
                    <span className="gs-ustat-sub">{resolvedTickets.length} resolved / {totalTicketsCount} total</span>
                  </span>
                </div>
                <div className="gs-upstream-stat">
                  <span className="gs-ustat-val" style={{ fontSize: '13px', minHeight: '26px', display: 'flex', alignItems: 'center' }}>{mostUnstableSystem}</span>
                  <span className="gs-ustat-lbl">Highest Drift Inflow</span>
                </div>
                <div className="gs-upstream-stat">
                  <span className="gs-ustat-val" style={{ color: openTickets.length > 0 ? 'var(--accent-yellow)' : 'var(--accent-green)' }}>
                    {openTickets.length > 0 ? "ACTION REQ" : "COMPLIANT"}
                  </span>
                  <span className="gs-ustat-lbl">Upstream Compliance</span>
                </div>
              </div>
            )}

            {remediationsLoading && remediations.length === 0 ? (
              <div className="gs-empty">Loading remediations history...</div>
            ) : remediations.length === 0 ? (
              <div className="gs-empty" style={{ padding: '60px', display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent-green)' }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 11 2 2 4-4"/></svg>
                <span>Upstream compliant! No active remediation tickets found in HDFS log registry.</span>
              </div>
            ) : (
              <>
                <div style={{ overflowX: 'auto' }}>
                  <table className="gs-governance-table">
                    <thead>
                      <tr>
                        <th>Ticket ID</th>
                        <th>Table</th>
                        <th>Severity</th>
                        <th>Upstream Source</th>
                        <th>Governance Action Required</th>
                        <th>Status</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedRemediations.map((t) => (
                        <tr key={t.ticket_id}>
                          <td style={{ fontWeight: 700 }}>
                            <div className="gs-mono">{t.ticket_id}</div>
                            <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '2px' }}>{new Date(t.timestamp).toLocaleString()}</div>
                          </td>
                          <td>
                            <span className="gs-badge" style={{ background: 'rgba(59, 130, 246, 0.08)', color: 'var(--accent-blue)' }}>{t.table_name}</span>
                          </td>
                          <td>
                            <span className="gs-badge" style={{ background: t.severity === 'critical' ? '#fee2e2' : '#fff7ed', color: t.severity === 'critical' ? 'var(--accent-red)' : 'var(--accent-yellow)' }}>
                              {t.severity}
                            </span>
                          </td>
                          <td><strong>{t.target_system}</strong></td>
                          <td style={{ color: 'var(--text-secondary)', maxWidth: '300px', fontSize: '11px', lineHeight: '1.3' }}>{t.remediation_action}</td>
                          <td>
                            <span className="gs-badge" style={{ background: t.status === 'RESOLVED' ? '#d1fae5' : '#fee2e2', color: t.status === 'RESOLVED' ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                              {t.status}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            {t.status === 'OPEN' ? (
                              <button
                                disabled={resolvingTicketId === t.ticket_id}
                                className="gs-btn-retry"
                                style={{ background: 'rgba(16, 185, 129, 0.1)', borderColor: 'rgba(16, 185, 129, 0.3)', color: 'var(--accent-green)' }}
                                onClick={() => handleResolveRemediation(t.ticket_id)}
                              >
                                {resolvingTicketId === t.ticket_id ? "Closing..." : "✓ Close Ticket"}
                              </button>
                            ) : (
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Closed</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="gs-pagination">
                  <button disabled={remediationPage === 1} onClick={() => setRemediationPage(p => Math.max(p - 1, 1))}>
                    Prev
                  </button>
                  <span className="gs-muted">Page {remediationPage} of {totalPages}</span>
                  <button disabled={remediationPage >= totalPages} onClick={() => setRemediationPage(p => p + 1)}>
                    Next
                  </button>
                </div>
              </>
            )}
          </div>
        );
      })()}

      {activeTab === "standardize" && (() => {
        const paginatedQueue = reviewQueue.slice((reviewPage - 1) * 8, reviewPage * 8);
        const totalPages = Math.ceil(reviewQueue.length / 8) || 1;

        return (
          <div className="gs-rcard" style={{ marginTop: '20px' }}>
            <div className="gs-rcard-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h3>Standardization & Auto-Learning Governance</h3>
                <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)' }}>Review anomalous and unmapped categories, approve AI suggestions, or apply custom overrides.</p>
              </div>
              <button onClick={fetchReviewQueue} disabled={reviewLoading} className="gs-btn-outline">
                {reviewLoading ? "Refreshing..." : "Refresh Queue"}
              </button>
            </div>

            {reviewLoading && reviewQueue.length === 0 ? (
              <div className="gs-empty">Loading review queue...</div>
            ) : reviewQueue.length === 0 ? (
              <div className="gs-empty" style={{ padding: '60px', display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent-green)' }}>
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  <path d="m9 11 2 2 4-4"/>
                </svg>
                <span>All unmapped categories resolved! Standard pipelines are running optimally.</span>
              </div>
            ) : (
              <>
                <div style={{ overflowX: 'auto' }}>
                  <table className="gs-governance-table">
                    <thead>
                      <tr>
                        <th>Source Detail</th>
                        <th>Raw Value</th>
                        <th>AI Suggestion</th>
                        <th>Confidence</th>
                        <th>Frequency</th>
                        <th>Priority</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedQueue.map((item) => {
                        const isEditing = editingItemId === item.id;
                        return (
                          <tr key={item.id}>
                            <td>
                              <div style={{ fontWeight: 700 }}>{item.table_name}</div>
                              <div className="gs-muted" style={{ fontSize: '10px' }}>col: <code>{item.column_name}</code></div>
                            </td>
                            <td>
                              <span className="gs-badge" style={{ background: 'rgba(239, 68, 68, 0.08)', color: 'var(--accent-red)' }}>{item.unmapped_value}</span>
                            </td>
                            <td>
                              {isEditing ? (
                                <input
                                  type="text"
                                  className="gs-input"
                                  style={{ padding: '4px 8px', fontSize: '11px', width: '150px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: '4px' }}
                                  value={editingValue}
                                  onChange={(e) => setEditingValue(e.target.value)}
                                  placeholder="Type category..."
                                />
                              ) : (
                                <strong>{item.suggested_category || "อื่นๆ"}</strong>
                              )}
                            </td>
                            <td>
                              <span className="gs-mono">{(item.confidence * 100).toFixed(1)}%</span>
                            </td>
                            <td>
                              <strong>{item.frequency}</strong>
                            </td>
                            <td>
                              <span className="gs-mono" style={{ color: item.priority > 50 ? 'var(--accent-red)' : 'var(--text-main)', fontWeight: item.priority > 50 ? 700 : 400 }}>
                                {item.priority.toFixed(1)}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              {isEditing ? (
                                <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                  <button
                                    className="gs-btn-retry"
                                    style={{ background: 'rgba(16, 185, 129, 0.1)', borderColor: 'rgba(16, 185, 129, 0.3)', color: 'var(--accent-green)', padding: '4px 8px' }}
                                    onClick={() => {
                                      handleOverrideStandardize(item.id, editingValue);
                                      setEditingItemId(null);
                                    }}
                                  >
                                    Save
                                  </button>
                                  <button
                                    className="gs-btn-outline"
                                    style={{ padding: '4px 8px' }}
                                    onClick={() => setEditingItemId(null)}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                  <button
                                    className="gs-btn-retry"
                                    style={{ background: 'rgba(16, 185, 129, 0.1)', borderColor: 'rgba(16, 185, 129, 0.3)', color: 'var(--accent-green)', padding: '4px 8px' }}
                                    onClick={() => handleApproveStandardize(item.id)}
                                  >
                                    ✓ Approve
                                  </button>
                                  <button
                                    className="gs-btn-outline"
                                    style={{ padding: '4px 8px' }}
                                    onClick={() => {
                                      setEditingItemId(item.id);
                                      setEditingValue(item.suggested_category || "");
                                    }}
                                  >
                                    ✎ Override
                                  </button>
                                  <button
                                    className="gs-btn-retry"
                                    style={{ background: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.3)', color: 'var(--accent-red)', padding: '4px 8px' }}
                                    onClick={() => handleRejectStandardize(item.id)}
                                  >
                                    ✕ Reject
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="gs-pagination">
                  <button disabled={reviewPage === 1} onClick={() => setReviewPage(p => Math.max(p - 1, 1))}>
                    Prev
                  </button>
                  <span className="gs-muted">Page {reviewPage} of {totalPages}</span>
                  <button disabled={reviewPage >= totalPages} onClick={() => setReviewPage(p => p + 1)}>
                    Next
                  </button>
                </div>
              </>
            )}
          </div>
        );
      })()}

      <ConfirmationModal 
        isOpen={modalOpen}
        title={modalConfig.title}
        message={modalConfig.message}
        onConfirm={modalConfig.onConfirm}
        onCancel={() => setModalOpen(false)}
      />
    </div>
  );
}
