import React, { useState } from "react";
import { useApi, postApi } from "../hooks/useApi";
import { Icon } from "../components/UiIcons";
import ConfirmationModal from "../components/ConfirmationModal";
import { PageHeader, LearnMore } from "../components/ui";
import "./Schema.css";

const STATUS_LABELS = { PENDING: "รออนุมัติ", APPROVED: "อนุมัติแล้ว", REJECTED: "ปฏิเสธ" };

export default function Schema() {
  const [workspaceMode, setWorkspaceMode] = useState("primary");
  const [statusFilter, setStatusFilter] = useState("PENDING");
  const proposals = useApi(`/schema/proposals?status=${statusFilter}`, { refreshInterval: 10000 });

  const [selectedId, setSelectedId] = useState(null);
  const [searchTable, setSearchTable] = useState("");
  const [primaryKeyOverride, setPrimaryKeyOverride] = useState("");
  const [dateColumnOverride, setDateColumnOverride] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [actionResult, setActionResult] = useState(null);

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

  // Schema Evolution Proposal Registration State
  const [simTable, setSimTable] = useState("student_course_scores");
  const [simColumn, setSimColumn] = useState("gpa_weighted");
  const [simType, setSimType] = useState("DoubleType");
  const [simDriftType, setSimDriftType] = useState("new_column");

  const filteredProposals = React.useMemo(() => {
    const raw = proposals.data?.proposals || [];
    const q = searchTable.trim().toLowerCase();
    if (!q) return raw;
    return raw.filter(p => String(p.table_name || "").toLowerCase().includes(q) || String(p.run_id || "").toLowerCase().includes(q));
  }, [proposals.data, searchTable]);

  // Auto-select the first proposal so the right workspace and inputs are immediately ready
  React.useEffect(() => {
    if (filteredProposals.length > 0 && (!selectedId || !filteredProposals.some(p => p.id === selectedId))) {
      setSelectedId(filteredProposals[0].id);
    }
  }, [filteredProposals, selectedId]);

  const selectedProposal = filteredProposals.find((p) => p.id === selectedId) || proposals.data?.proposals?.find((p) => p.id === selectedId);

  React.useEffect(() => {
    if (selectedProposal) {
      if (selectedProposal.table_name === "products") {
        setPrimaryKeyOverride("product_id");
        setDateColumnOverride("");
      } else if (selectedProposal.table_name === "orders") {
        setPrimaryKeyOverride("order_id");
        setDateColumnOverride("order_date");
      } else if (selectedProposal.table_name === "users") {
        setPrimaryKeyOverride("id");
        setDateColumnOverride("created_utc");
      } else if (selectedProposal.table_name === "student_course_scores") {
        setPrimaryKeyOverride("student_id");
        setDateColumnOverride("semester");
      } else {
        setPrimaryKeyOverride("id");
        setDateColumnOverride("");
      }
    } else {
      setPrimaryKeyOverride("");
      setDateColumnOverride("");
    }
  }, [selectedId, selectedProposal]);

  const handleCreateProposal = async (e) => {
    e.preventDefault();
    if (!simTable.trim() || !simColumn.trim()) return;
    setSubmitting(true);
    setActionResult(null);
    try {
      const res = await postApi("/schema/proposals/create", {
        table_name: simTable.trim(),
        column_name: simColumn.trim(),
        column_type: simType,
        drift_type: simDriftType
      });
      setStatusFilter("PENDING");
      setActionResult({ success: true, message: res.message || `บันทึกข้อเสนอการปรับโครงสร้างตาราง '${simTable}.${simColumn}' สำเร็จแล้ว` });
      await proposals.refetch();
      if (res.id) setSelectedId(res.id);
    } catch (err) {
      setActionResult({ success: false, message: `ไม่สามารถบันทึกข้อเสนอได้: ${err.message}` });
    } finally {
      setSubmitting(false);
    }
  };

  const handleBulkAction = async (action) => {
    setSubmitting(true);
    setActionResult(null);
    try {
      const endpoint = `/schema/proposals/${action}`;
      const res = await postApi(endpoint);
      setActionResult({ success: true, message: res.message || `Bulk ${action} completed successfully.` });
      setSelectedId(null);
      proposals.refetch();
    } catch (err) {
      setActionResult({ success: false, message: `Failed to execute bulk action: ${err.message}` });
    } finally {
      setSubmitting(false);
    }
  };

  const handleAction = async (proposalId, action) => {
    setSubmitting(true);
    setActionResult(null);
    try {
      let endpoint = `/schema/proposals/${proposalId}/${action}`;
      if (action === "approve") {
        const params = [];
        if (primaryKeyOverride) params.push(`primary_key=${encodeURIComponent(primaryKeyOverride)}`);
        if (dateColumnOverride) params.push(`date_column=${encodeURIComponent(dateColumnOverride)}`);
        if (params.length > 0) {
          endpoint += `?${params.join("&")}`;
        }
      }

      const res = await postApi(endpoint);
      setActionResult({ success: true, message: res.message || `Proposal ${action}d successfully.` });
      setPrimaryKeyOverride("");
      setDateColumnOverride("");
      setSelectedId(null);
      proposals.refetch();
    } catch (err) {
      setActionResult({ success: false, message: `Failed to ${action} proposal: ${err.message}` });
    } finally {
      setSubmitting(false);
    }
  };

  const formatProposedTime = (isoString) => {
    if (!isoString) return "";
    try {
      const date = new Date(isoString);
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `Detected ${day}/${month} at ${hours}:${minutes}`;
    } catch (e) {
      return "";
    }
  };

  const getModificationLines = (proposal) => {
    if (!proposal || !proposal.drift_details) return [];
    return Object.entries(proposal.drift_details).map(([col, details]) => {
      let typeLabel = "New column";
      let badgeLabel = "NEW COLUMN";
      let badgeColor = "var(--accent-green)";
      let detailText = col;

      if (details && (details.error === "type_mismatch" || details.error === "type")) {
        typeLabel = "Type column";
        badgeLabel = "TYPE MISMATCH";
        badgeColor = "var(--accent-yellow)";
        detailText = `${col} → ${details.actual || "type"}`;
      } else if (details && details.error === "missing_column") {
        typeLabel = "Missing column";
        badgeLabel = "MISSING COLUMN";
        badgeColor = "var(--accent-red)";
        detailText = col;
      }

      return {
        typeLabel,
        badgeLabel,
        badgeColor,
        detailText
      };
    });
  };

  return (
    <div className="gs-schema">

      <PageHeader pageKey="schema" />

      {/* Schema Evolution Registration Bar (collapsed by default — this is a simulation/test tool, not the primary workflow) */}
      <details style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '10px', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
        <summary style={{ padding: '10px 16px', fontSize: '12px', fontWeight: 700, color: '#475569', cursor: 'pointer', userSelect: 'none' }}>
          จำลองการเปลี่ยน Schema (สำหรับทดสอบ)
        </summary>
        <form onSubmit={handleCreateProposal} style={{ padding: '0 16px 16px 16px', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end' }}>
        <div style={{ minWidth: '170px', flex: 1 }}>
          <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: '3px' }}>
            ตาราง
          </label>
          <input
            type="text"
            value={simTable}
            onChange={(e) => setSimTable(e.target.value.replace(/[^a-zA-Z0-9_]/g, "_"))}
            placeholder="student_course_scores"
            style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px', fontWeight: 700, color: '#0F172A' }}
          />
        </div>
        <div style={{ minWidth: '170px', flex: 1 }}>
          <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: '3px' }}>
            คอลัมน์
          </label>
          <input
            type="text"
            value={simColumn}
            onChange={(e) => setSimColumn(e.target.value.replace(/[^a-zA-Z0-9_]/g, "_"))}
            placeholder="gpa_weighted"
            style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px', fontWeight: 700, color: '#0F172A' }}
          />
        </div>
        <div style={{ minWidth: '140px' }}>
          <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: '3px' }}>
            ชนิดข้อมูล
          </label>
          <select
            value={simType}
            onChange={(e) => setSimType(e.target.value)}
            style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px', fontWeight: 700, color: '#0F172A', background: '#FFFFFF' }}
          >
            <option value="DoubleType">DoubleType</option>
            <option value="StringType">StringType</option>
            <option value="IntegerType">IntegerType</option>
            <option value="TimestampType">TimestampType</option>
          </select>
        </div>
        <div style={{ minWidth: '150px' }}>
          <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: '3px' }}>
            ประเภท
          </label>
          <select
            value={simDriftType}
            onChange={(e) => setSimDriftType(e.target.value)}
            style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px', fontWeight: 700, color: '#0F172A', background: '#FFFFFF' }}
          >
            <option value="new_column">เพิ่มคอลัมน์</option>
            <option value="type_mismatch">ชนิดข้อมูลเปลี่ยน</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={submitting}
          style={{
            padding: '7px 14px',
            background: '#2563EB',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: 700,
            cursor: submitting ? 'not-allowed' : 'pointer'
          }}
        >
          บันทึก
        </button>
        </form>
      </details>

      {actionResult && (
        <div 
          style={{ 
            padding: '10px 14px', 
            borderRadius: '8px', 
            fontSize: '12px', 
            background: actionResult.success ? '#d1fae5' : '#fee2e2',
            border: `1px solid ${actionResult.success ? '#10b981' : '#ef4444'}`,
            color: actionResult.success ? '#059669' : '#dc2626',
            fontFamily: 'var(--font-mono)'
          }}
        >
          {actionResult.message}
        </div>
      )}

      {/* 2. Navigation Filter Tabs & Search Input */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div className="gs-filter-tabs" style={{ alignSelf: 'flex-start' }}>
          {["PENDING", "APPROVED", "REJECTED"].map((tab) => (
            <button
              key={tab}
              className={`gs-filter-btn ${statusFilter === tab ? "active" : ""}`}
              onClick={() => {
                setStatusFilter(tab);
                setSelectedId(null);
                setActionResult(null);
              }}
            >
              {STATUS_LABELS[tab]}
            </button>
          ))}
        </div>

        <div style={{ minWidth: '240px' }}>
          <input
            type="text"
            value={searchTable}
            onChange={(e) => setSearchTable(e.target.value)}
            placeholder="ค้นหาตาราง"
            style={{ width: '100%', padding: '6px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px', background: '#FFFFFF', color: '#0F172A' }}
          />
        </div>
      </div>

      {/* 3. Main Workspace */}
      <div className="gs-schema-layout">
        {/* Left Column: Proposals List */}
        <div className="gs-schema-list">
          <div className="gs-scard">
            <h3>{filteredProposals.length} รายการ</h3>
            {statusFilter === "PENDING" && filteredProposals.length > 0 && (
              <div style={{
                display: "flex",
                gap: "8px",
                padding: "8px 12px 12px 12px",
                borderBottom: "1px solid var(--border-color, rgba(255,255,255,0.06))",
                marginBottom: "8px"
              }}>
                <button
                  onClick={() => triggerConfirm(
                    "อนุมัติทั้งหมด?",
                    `อนุมัติ ${filteredProposals.length} รายการและอัปเดต Schema ทันที ย้อนกลับไม่ได้`,
                    () => handleBulkAction("approve-all")
                  )}
                  disabled={submitting}
                  style={{
                    flex: 1,
                    padding: "6px 10px",
                    fontSize: "11px",
                    fontWeight: "600",
                    background: "rgba(16, 185, 129, 0.15)",
                    border: "1.5px solid var(--accent-green, #10B981)",
                    color: "var(--accent-green, #10B981)",
                    borderRadius: "6px",
                    cursor: submitting ? "not-allowed" : "pointer"
                  }}
                >
                  {submitting ? "กำลังดำเนินการ..." : "อนุมัติทั้งหมด"}
                </button>
                <button
                  onClick={() => triggerConfirm(
                    "ปฏิเสธทั้งหมด?",
                    `ปฏิเสธ ${filteredProposals.length} รายการ ย้อนกลับไม่ได้`,
                    () => handleBulkAction("reject-all")
                  )}
                  disabled={submitting}
                  style={{
                    flex: 1,
                    padding: "6px 10px",
                    fontSize: "11px",
                    fontWeight: "600",
                    background: "rgba(239, 68, 68, 0.15)",
                    border: "1.5px solid var(--accent-red, #EF4444)",
                    color: "var(--accent-red, #EF4444)",
                    borderRadius: "6px",
                    cursor: submitting ? "not-allowed" : "pointer"
                  }}
                >
                  {submitting ? "กำลังดำเนินการ..." : "ปฏิเสธทั้งหมด"}
                </button>
              </div>
            )}
            <div className="gs-proposals">
              {proposals.loading ? (
                <div className="gs-empty">กำลังโหลด...</div>
              ) : proposals.error ? (
                <div className="gs-empty" style={{ color: 'var(--accent-red)' }}>โหลดรายการไม่สำเร็จ</div>
              ) : filteredProposals.length === 0 ? (
                <div className="gs-empty">ไม่มีรายการ</div>
              ) : (
                filteredProposals.map((p) => {
                  const isSelected = p.id === selectedId;
                  const driftColumns = p.drift_details ? Object.keys(p.drift_details) : [];
                  return (
                    <div
                      key={p.id}
                      className={`gs-proposal-item ${isSelected ? "selected" : ""}`}
                      onClick={() => {
                        setSelectedId(p.id);
                        setActionResult(null);
                      }}
                    >
                      <div className="gs-proposal-header">
                        <span className="gs-table-tag">{p.table_name}</span>
                        <span className="gs-severity-badge" style={{ borderColor: 'var(--accent-purple)', color: 'var(--accent-purple)' }}>
                          SEV {p.severity_score || 1}
                        </span>
                      </div>
                      {driftColumns.length > 0 && (
                        <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          + {driftColumns.join(", ")}
                        </div>
                      )}
                      <div className="gs-proposal-meta">
                        <span>Run: {(p.run_id || '').slice(0, 10)}</span>
                        <span>{formatProposedTime(p.proposed_at || p.timestamp)}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Detailed Proposal view */}
        <div className="gs-schema-workspace">
          {selectedProposal ? (
            <div className="gs-scard gs-workspace-card">
              <div className="gs-workspace-header">
                <div>
                  <h2>{selectedProposal.table_name}</h2>
                  <span>Run {selectedProposal.run_id}</span>
                </div>
                {statusFilter === "PENDING" && (
                  <div className="gs-actions">
                    <button
                      disabled={submitting}
                      className="gs-btn-approve"
                      onClick={() => triggerConfirm(
                        "อนุมัติการเปลี่ยน Schema?",
                        `ตาราง ${selectedProposal.table_name} จะถูกอัปเดตทันที ย้อนกลับไม่ได้`,
                        () => handleAction(selectedProposal.id, "approve")
                      )}
                    >
                      {submitting ? "กำลังดำเนินการ..." : "อนุมัติ"}
                    </button>
                    <button
                      disabled={submitting}
                      className="gs-btn-reject"
                      onClick={() => triggerConfirm(
                        "ปฏิเสธการเปลี่ยน Schema?",
                        `ตาราง ${selectedProposal.table_name} ข้อมูลที่เกี่ยวข้องจะถูกกักกัน ย้อนกลับไม่ได้`,
                        () => handleAction(selectedProposal.id, "reject")
                      )}
                    >
                      {submitting ? "กำลังปฏิเสธ..." : "ปฏิเสธ"}
                    </button>
                  </div>
                )}
              </div>

              <div className="gs-drift-details-section">
                <h4 style={{ fontSize: '12px', fontWeight: 800, marginBottom: '8px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>สิ่งที่เปลี่ยน</h4>
                <div className="gs-drift-lines">
                  {getModificationLines(selectedProposal).map((line, i) => (
                    <div key={i} className="gs-drift-line">
                      <span className="gs-drift-badge" style={{ backgroundColor: line.badgeColor }}>{line.badgeLabel}</span>
                      <div className="gs-drift-info">
                        <strong>{line.typeLabel}</strong>
                        <p>{line.detailText}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* JSON code viewer with line numbers */}
              <LearnMore summary="ดู Schema ที่เสนอ (JSON)">
                {(() => {
                  const jsonString = JSON.stringify(selectedProposal.proposed_schema || {}, null, 2);
                  const lines = jsonString.split("\n");
                  return (
                    <div 
                      style={{
                        background: "#0f172a",
                        borderRadius: "8px",
                        border: "1px solid #1e293b",
                        fontFamily: "var(--font-mono)",
                        fontSize: "11px",
                        display: "flex",
                        padding: "8px 0",
                        maxHeight: "220px",
                        overflowY: "auto"
                      }}
                    >
                      <div 
                        style={{
                          color: "#475569",
                          textAlign: "right",
                          padding: "0 10px",
                          borderRight: "1px solid #1e293b",
                          userSelect: "none",
                          minWidth: "2rem"
                        }}
                      >
                        {lines.map((_, i) => <div key={i}>{i + 1}</div>)}
                      </div>
                      <div style={{ paddingLeft: "12px", whiteSpace: "pre", width: "100%", color: '#cbd5e1' }}>
                        {lines.map((line, i) => {
                          const trimmed = line.trim();
                          let highlightedColor = '#cbd5e1';
                          if (trimmed === "{" || trimmed === "}" || trimmed === "}," || trimmed === "[" || trimmed === "]") {
                            highlightedColor = '#64748b';
                          } else if (trimmed.includes(":")) {
                            if (trimmed.includes("type") || trimmed.includes("Type")) highlightedColor = '#f59e0b';
                            else highlightedColor = '#34d399';
                          }
                          return <div key={i} style={{ color: highlightedColor }}>{line}</div>;
                        })}
                      </div>
                    </div>
                  );
                })()}
              </LearnMore>

              {/* Approval Override inputs */}
              {statusFilter === "PENDING" && (
                <div className="gs-governance-config">
                  <h4 style={{ fontSize: '11.5px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-main)' }}>ตั้งค่าก่อนอนุมัติ</h4>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div className="gs-input-grp">
                      <label style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Primary Key</label>
                      <input
                        type="text"
                        placeholder="e.g. user_id"
                        value={primaryKeyOverride}
                        onChange={(e) => setPrimaryKeyOverride(e.target.value)}
                      />
                    </div>
                    <div className="gs-input-grp">
                      <label style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Partition Date</label>
                      <input
                        type="text"
                        placeholder="e.g. created_date"
                        value={dateColumnOverride}
                        onChange={(e) => setDateColumnOverride(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}

              {statusFilter !== "PENDING" && (
                <div 
                  style={{
                    padding: "12px",
                    textAlign: "center",
                    borderRadius: "8px",
                    border: `1.5px solid ${statusFilter === "APPROVED" ? "var(--accent-green)" : "var(--accent-red)"}`,
                    color: statusFilter === "APPROVED" ? "var(--accent-green)" : "var(--accent-red)",
                    fontWeight: 700,
                    fontSize: "12px",
                    fontFamily: 'var(--font-mono)',
                    textTransform: 'uppercase',
                    marginTop: "auto"
                  }}
                >
                  PROPOSAL {statusFilter} AT {(() => {
                    const t = selectedProposal?.resolved_at || selectedProposal?.proposed_at || selectedProposal?.timestamp;
                    return t ? new Date(t).toLocaleString() : "N/A";
                  })()}
                  {selectedProposal?.resolved_by && (
                    <div style={{ fontSize: "10px", fontWeight: 600, marginTop: "4px", textTransform: "none", opacity: 0.85 }}>
                      by {selectedProposal.resolved_by}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="gs-workspace-placeholder">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent-purple)', marginBottom: '12px' }}>
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                <path d="M2 10h20" />
              </svg>
              <p>เลือกรายการทางซ้ายเพื่อดูรายละเอียด</p>
            </div>
          )}
        </div>
      </div>

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
