import React, { useState } from "react";
import { useApi, postApi } from "../hooks/useApi";
import ConfirmationModal from "../components/ConfirmationModal";
import { PageHeader, LearnMore } from "../components/ui";
import "./Schema.css";

const TAB_LABELS = { CATALOG: "ตารางทั้งหมด", PENDING: "รออนุมัติ", APPROVED: "อนุมัติแล้ว", REJECTED: "ปฏิเสธ" };
const TABS = ["CATALOG", "PENDING", "APPROVED", "REJECTED"];
const PASS_SCORE = 90;

const ACTION_TEXT = {
  coerced_to_string: "ระบบแปลงเป็นข้อความให้แล้ว",
  coerced_to_expected: "ระบบแปลงเป็นชนิดที่คาดไว้ให้แล้ว",
  quarantined: "แถวที่ไม่ตรงถูกกักกัน"
};

const pad = (n) => String(n).padStart(2, "0");

function formatWhen(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const keyText = (key) => (Array.isArray(key) ? key.join(", ") : key || "");

// One line per changed column, in Thai, with what was expected and what the system already did.
function describeDrift(col, d, registeredType) {
  const details = d && typeof d === "object" ? d : {};
  const action = details.action ? (ACTION_TEXT[details.action] || details.action) : "";
  if (details.error === "type_mismatch" || details.error === "type") {
    const from = registeredType || details.expected || "-";
    const text = `ลงทะเบียนไว้ ${from} → พบ ${details.actual || "-"}${action ? ` · ${action}` : ""}`;
    return { badge: "ชนิดไม่ตรง", color: "var(--accent-yellow)", title: col, text };
  }
  if (details.error === "missing_column") {
    return { badge: "คอลัมน์หาย", color: "var(--accent-red)", title: col, text: "ไม่พบในไฟล์ที่นำเข้า" };
  }
  return { badge: "คอลัมน์ใหม่", color: "var(--accent-green)", title: col, text: details.actual ? `ชนิด ${details.actual}` : "" };
}

// A key guess for a table that is not registered yet: an "id" column, else the first "*_id".
function guessPrimaryKey(schema) {
  const names = Object.keys(schema || {});
  if (names.includes("id")) return "id";
  return names.find((n) => n.toLowerCase().endsWith("_id")) || "";
}

// Types the engine can read and produce; anything else is always read as text.
const ENGINE_TYPES = ["StringType", "IntegerType", "DoubleType", "TimestampType"];

// What approving this proposal would really do, per column, so the reviewer is not guessing.
function proposalNotes(proposal, registeredTypes) {
  const notes = [];
  if (String(proposal.run_id || "").startsWith("run_evo_")) {
    notes.push("ข้อเสนอนี้สร้างจากเครื่องมือทดสอบ ไม่ได้มาจากการนำเข้าข้อมูลจริง");
  }
  for (const [col, d] of Object.entries(proposal.drift_details || {})) {
    if (d?.error !== "type_mismatch") continue;
    const registered = registeredTypes[col];
    if (registered && registered === d.actual) {
      notes.push(`${col}: ลงทะเบียนตรงกับที่พบแล้ว การอนุมัติไม่เปลี่ยนอะไร`);
    } else if (d.actual === "StringType" && !ENGINE_TYPES.includes(d.expected)) {
      notes.push(`${col}: ${d.expected} เป็นชนิดที่ระบบอ่านไม่ได้ จึงถูกอ่านเป็นข้อความเสมอ อนุมัติเพื่อเปลี่ยนเป็น StringType แล้วการเตือนซ้ำจะหยุด`);
    } else {
      notes.push(`${col}: อนุมัติจะเปลี่ยนชนิดที่ลงทะเบียนเป็น ${d.actual}`);
    }
  }
  return notes;
}

function Fact({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: "10.5px", color: "var(--text-muted)", fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-main)", marginTop: "2px" }}>{children}</div>
    </div>
  );
}

export default function Schema() {
  const showSimulator = new URLSearchParams(window.location.search).get("test") === "1";
  const [tab, setTab] = useState("CATALOG");
  const proposalStatus = tab === "CATALOG" ? "PENDING" : tab;
  const proposals = useApi(`/schema/proposals?status=${proposalStatus}`, { refreshInterval: 10000, enabled: tab !== "CATALOG" });
  const catalog = useApi("/schema/tables", { refreshInterval: 15000 });

  const [selectedId, setSelectedId] = useState(null);
  const [selectedTable, setSelectedTable] = useState(null);
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

  // Test tool (only with ?test=1): registers a fake schema change in Elasticsearch.
  const [simTable, setSimTable] = useState("");
  const [simColumn, setSimColumn] = useState("");
  const [simType, setSimType] = useState("DoubleType");
  const [simDriftType, setSimDriftType] = useState("new_column");

  const q = searchTable.trim().toLowerCase();
  const catalogTables = React.useMemo(() => {
    const all = catalog.data?.tables || [];
    return q ? all.filter((t) => t.name.toLowerCase().includes(q)) : all;
  }, [catalog.data, q]);
  const catalogByName = React.useMemo(
    () => Object.fromEntries((catalog.data?.tables || []).map((t) => [t.name, t])),
    [catalog.data]
  );
  const pendingTotal = catalog.data?.pending_total ?? 0;

  const filteredProposals = React.useMemo(() => {
    const raw = proposals.data?.proposals || [];
    if (!q) return raw;
    return raw.filter((p) => String(p.table_name || "").toLowerCase().includes(q) || String(p.run_id || "").toLowerCase().includes(q));
  }, [proposals.data, q]);

  // Start on the newest table / the first proposal so the right side is never empty.
  React.useEffect(() => {
    if (tab !== "CATALOG") return;
    if (catalogTables.length > 0 && (!selectedTable || !catalogTables.some((t) => t.name === selectedTable))) {
      setSelectedTable(catalogTables[0].name);
    }
  }, [tab, catalogTables, selectedTable]);

  React.useEffect(() => {
    if (tab === "CATALOG") return;
    if (filteredProposals.length > 0 && (!selectedId || !filteredProposals.some((p) => p.id === selectedId))) {
      setSelectedId(filteredProposals[0].id);
    }
  }, [tab, filteredProposals, selectedId]);

  const selectedProposal = filteredProposals.find((p) => p.id === selectedId) || proposals.data?.proposals?.find((p) => p.id === selectedId);
  const tableInfo = catalogTables.find((t) => t.name === selectedTable) || null;

  // Defaults come from what the table already has registered, not from table names.
  const registered = selectedProposal ? catalogByName[selectedProposal.table_name] : null;
  const registeredKey = keyText(registered?.primary_key);
  const registeredDate = registered?.date_column || "";
  const registeredTypes = React.useMemo(
    () => Object.fromEntries((registered?.columns || []).map((c) => [c.name, c.type])),
    [registered]
  );
  React.useEffect(() => {
    if (!selectedProposal) {
      setPrimaryKeyOverride("");
      setDateColumnOverride("");
      return;
    }
    setPrimaryKeyOverride(registeredKey || guessPrimaryKey(selectedProposal.proposed_schema));
    setDateColumnOverride(registeredDate);
  }, [selectedId, selectedProposal, registeredKey, registeredDate]);

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
      setTab("PENDING");
      setActionResult({ success: true, message: `บันทึกข้อเสนอทดสอบ '${simTable}.${simColumn}' แล้ว` });
      await proposals.refetch();
      catalog.refetch();
      if (res.id) setSelectedId(res.id);
    } catch (err) {
      setActionResult({ success: false, message: `บันทึกข้อเสนอไม่สำเร็จ: ${err.message}` });
    } finally {
      setSubmitting(false);
    }
  };

  const handleBulkAction = async (action) => {
    setSubmitting(true);
    setActionResult(null);
    try {
      await postApi(`/schema/proposals/${action}`);
      setActionResult({ success: true, message: action === "approve-all" ? "อนุมัติทุกรายการแล้ว" : "ปฏิเสธทุกรายการแล้ว" });
      setSelectedId(null);
      proposals.refetch();
      catalog.refetch();
    } catch (err) {
      setActionResult({ success: false, message: `ดำเนินการไม่สำเร็จ: ${err.message}` });
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
        // Only send what the reviewer changed; the registered key is kept as it is.
        const params = [];
        if (primaryKeyOverride && primaryKeyOverride !== registeredKey) params.push(`primary_key=${encodeURIComponent(primaryKeyOverride)}`);
        if (dateColumnOverride !== registeredDate) params.push(`date_column=${encodeURIComponent(dateColumnOverride)}`);
        if (params.length > 0) endpoint += `?${params.join("&")}`;
      }
      const res = await postApi(endpoint);
      const repeats = res.closed_duplicates ? ` และปิดรายการซ้ำอีก ${res.closed_duplicates} รายการ` : "";
      setActionResult({ success: true, message: `${action === "approve" ? "อนุมัติ" : "ปฏิเสธ"}แล้ว${repeats}` });
      setSelectedId(null);
      proposals.refetch();
      catalog.refetch();
    } catch (err) {
      setActionResult({ success: false, message: `${action === "approve" ? "อนุมัติ" : "ปฏิเสธ"}ไม่สำเร็จ: ${err.message}` });
    } finally {
      setSubmitting(false);
    }
  };

  const openProposalsOf = (name) => {
    setSearchTable(name);
    setSelectedId(null);
    setActionResult(null);
    setTab("PENDING");
  };

  const scoreColor = (score) => (score == null ? "var(--text-muted)" : score >= PASS_SCORE ? "var(--accent-green)" : "var(--accent-red)");

  return (
    <div className="gs-schema">

      <PageHeader pageKey="schema" />

      {showSimulator && (
        <details open style={{ background: "#FFFFFF", border: "1px solid #CBD5E1", borderRadius: "10px" }}>
          <summary style={{ padding: "10px 16px", fontSize: "12px", fontWeight: 700, color: "#475569", cursor: "pointer" }}>
            เครื่องมือทดสอบ: สร้างข้อเสนอเปลี่ยน Schema ปลอม
          </summary>
          <form onSubmit={handleCreateProposal} style={{ padding: "0 16px 16px 16px", display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "flex-end" }}>
            <input aria-label="ตารางทดสอบ" type="text" value={simTable} placeholder="ชื่อตาราง"
              onChange={(e) => setSimTable(e.target.value.replace(/[^a-zA-Z0-9_]/g, "_"))}
              style={{ padding: "6px 10px", borderRadius: "6px", border: "1px solid #CBD5E1", fontSize: "12px" }} />
            <input aria-label="คอลัมน์ทดสอบ" type="text" value={simColumn} placeholder="ชื่อคอลัมน์"
              onChange={(e) => setSimColumn(e.target.value.replace(/[^a-zA-Z0-9_]/g, "_"))}
              style={{ padding: "6px 10px", borderRadius: "6px", border: "1px solid #CBD5E1", fontSize: "12px" }} />
            <select aria-label="ชนิดข้อมูลทดสอบ" value={simType} onChange={(e) => setSimType(e.target.value)}
              style={{ padding: "6px 10px", borderRadius: "6px", border: "1px solid #CBD5E1", fontSize: "12px" }}>
              <option value="DoubleType">DoubleType</option>
              <option value="StringType">StringType</option>
              <option value="IntegerType">IntegerType</option>
              <option value="TimestampType">TimestampType</option>
            </select>
            <select aria-label="ประเภทการเปลี่ยน" value={simDriftType} onChange={(e) => setSimDriftType(e.target.value)}
              style={{ padding: "6px 10px", borderRadius: "6px", border: "1px solid #CBD5E1", fontSize: "12px" }}>
              <option value="new_column">เพิ่มคอลัมน์</option>
              <option value="type_mismatch">ชนิดข้อมูลเปลี่ยน</option>
            </select>
            <button type="submit" disabled={submitting} className="gs-btn-approve">บันทึก</button>
          </form>
        </details>
      )}

      {actionResult && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: "8px",
            fontSize: "12px",
            background: actionResult.success ? "#d1fae5" : "#fee2e2",
            border: `1px solid ${actionResult.success ? "#10b981" : "#ef4444"}`,
            color: actionResult.success ? "#059669" : "#dc2626"
          }}
        >
          {actionResult.message}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
        <div className="gs-filter-tabs" style={{ alignSelf: "flex-start" }}>
          {TABS.map((t) => (
            <button
              key={t}
              className={`gs-filter-btn ${tab === t ? "active" : ""}`}
              onClick={() => {
                setTab(t);
                setSelectedId(null);
                setActionResult(null);
              }}
            >
              {TAB_LABELS[t]}{t === "PENDING" && pendingTotal > 0 ? ` (${pendingTotal})` : ""}
            </button>
          ))}
        </div>

        <div style={{ minWidth: "240px" }}>
          <input
            type="text"
            aria-label="ค้นหาตาราง"
            value={searchTable}
            onChange={(e) => setSearchTable(e.target.value)}
            placeholder="ค้นหาตาราง"
            style={{ width: "100%", padding: "6px 12px", borderRadius: "6px", border: "1px solid #CBD5E1", fontSize: "12px", background: "#FFFFFF", color: "#0F172A" }}
          />
        </div>
      </div>

      <div className="gs-schema-layout">
        {/* Left column */}
        <div className="gs-schema-list">
          <div className="gs-scard">
            {tab === "CATALOG" ? (
              <>
                <h3>{catalogTables.length} ตาราง</h3>
                <div className="gs-proposals">
                  {catalog.loading ? (
                    <div className="gs-empty">กำลังโหลด...</div>
                  ) : catalog.error ? (
                    <div className="gs-empty" style={{ color: "var(--accent-red)" }}>โหลดรายการไม่สำเร็จ</div>
                  ) : catalogTables.length === 0 ? (
                    <div className="gs-empty">ยังไม่มีตารางที่ลงทะเบียน</div>
                  ) : (
                    catalogTables.map((t) => (
                      <div
                        key={t.name}
                        data-testid="catalog-row"
                        className={`gs-proposal-item ${t.name === selectedTable ? "selected" : ""}`}
                        onClick={() => setSelectedTable(t.name)}
                      >
                        <div className="gs-proposal-header">
                          <span className="gs-table-tag">{t.name}</span>
                          {t.pending_proposals > 0 && (
                            <span className="gs-severity-badge" style={{ borderColor: "var(--accent-yellow)", color: "var(--accent-yellow)" }}>
                              รออนุมัติ {t.pending_proposals}
                            </span>
                          )}
                        </div>
                        <div className="gs-proposal-meta">
                          <span>{t.column_count} คอลัมน์</span>
                          <span style={{ color: scoreColor(t.latest_score) }}>
                            {t.latest_score != null ? `${Number(t.latest_score).toFixed(1)}%` : "ยังไม่เคยรัน"}
                          </span>
                          <span>{formatWhen(t.latest_at)}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            ) : (
              <>
                <h3>{filteredProposals.length} รายการ</h3>
                {tab === "PENDING" && filteredProposals.length > 0 && (
                  <div style={{ display: "flex", gap: "8px", padding: "8px 12px 12px 12px", borderBottom: "1px solid var(--border-color)", marginBottom: "8px" }}>
                    <button
                      onClick={() => triggerConfirm(
                        "อนุมัติทุกรายการที่รออยู่?",
                        `อนุมัติ ${proposals.data?.total ?? filteredProposals.length} รายการและอัปเดต Schema ทันที (รวมทุกตาราง ไม่ใช่เฉพาะที่ค้นหา)`,
                        () => handleBulkAction("approve-all")
                      )}
                      disabled={submitting}
                      style={{ flex: 1, padding: "6px 10px", fontSize: "11px", fontWeight: 600, background: "rgba(16, 185, 129, 0.15)", border: "1.5px solid var(--accent-green, #10B981)", color: "var(--accent-green, #10B981)", borderRadius: "6px", cursor: submitting ? "not-allowed" : "pointer" }}
                    >
                      {submitting ? "กำลังดำเนินการ..." : "อนุมัติทั้งหมด"}
                    </button>
                    <button
                      onClick={() => triggerConfirm(
                        "ปฏิเสธทุกรายการที่รออยู่?",
                        `ปฏิเสธ ${proposals.data?.total ?? filteredProposals.length} รายการ (รวมทุกตาราง) Schema ที่ลงทะเบียนไว้ไม่เปลี่ยน`,
                        () => handleBulkAction("reject-all")
                      )}
                      disabled={submitting}
                      style={{ flex: 1, padding: "6px 10px", fontSize: "11px", fontWeight: 600, background: "rgba(239, 68, 68, 0.15)", border: "1.5px solid var(--accent-red, #EF4444)", color: "var(--accent-red, #EF4444)", borderRadius: "6px", cursor: submitting ? "not-allowed" : "pointer" }}
                    >
                      {submitting ? "กำลังดำเนินการ..." : "ปฏิเสธทั้งหมด"}
                    </button>
                  </div>
                )}
                <div className="gs-proposals">
                  {proposals.loading ? (
                    <div className="gs-empty">กำลังโหลด...</div>
                  ) : proposals.error ? (
                    <div className="gs-empty" style={{ color: "var(--accent-red)" }}>โหลดรายการไม่สำเร็จ</div>
                  ) : filteredProposals.length === 0 ? (
                    <div className="gs-empty">ไม่มีรายการ</div>
                  ) : (
                    filteredProposals.map((p) => {
                      const driftColumns = p.drift_details ? Object.keys(p.drift_details) : [];
                      return (
                        <div
                          key={p.id}
                          data-testid="proposal-row"
                          className={`gs-proposal-item ${p.id === selectedId ? "selected" : ""}`}
                          onClick={() => {
                            setSelectedId(p.id);
                            setActionResult(null);
                          }}
                        >
                          <div className="gs-proposal-header">
                            <span className="gs-table-tag">{p.table_name}</span>
                            {p.occurrences > 1 && (
                              <span className="gs-severity-badge" style={{ borderColor: "var(--accent-purple)", color: "var(--accent-purple)" }}>
                                พบ {p.occurrences} ครั้ง
                              </span>
                            )}
                          </div>
                          {driftColumns.length > 0 && (
                            <div style={{ fontSize: "10.5px", color: "var(--text-muted)", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {driftColumns.length} คอลัมน์: {driftColumns.join(", ")}
                            </div>
                          )}
                          <div className="gs-proposal-meta">
                            <span>ตรวจพบ {formatWhen(p.last_seen || p.proposed_at)}</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="gs-schema-workspace">
          {tab === "CATALOG" ? (
            tableInfo ? (
              <div className="gs-scard gs-workspace-card" data-testid="catalog-detail">
                <div className="gs-workspace-header">
                  <div>
                    <h2>{tableInfo.name}</h2>
                    <span>{tableInfo.registered ? "ลงทะเบียน Schema แล้ว" : "ยังไม่ได้ลงทะเบียน Schema"}</span>
                  </div>
                  {tableInfo.pending_proposals > 0 && (
                    <div className="gs-actions">
                      <button className="gs-btn-approve" onClick={() => openProposalsOf(tableInfo.name)}>
                        ดูข้อเสนอที่รออนุมัติ ({tableInfo.pending_proposals})
                      </button>
                    </div>
                  )}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "14px", marginBottom: "16px" }}>
                  <Fact label="คีย์หลัก">{keyText(tableInfo.primary_key) || "-"}</Fact>
                  <Fact label="คอลัมน์วันที่">{tableInfo.date_column || "-"}</Fact>
                  <Fact label="จำนวนคอลัมน์">{tableInfo.column_count}</Fact>
                  <Fact label="รอบที่ตรวจ">{tableInfo.runs}</Fact>
                  <Fact label="คะแนนล่าสุด">
                    <span style={{ color: scoreColor(tableInfo.latest_score) }}>
                      {tableInfo.latest_score != null ? `${Number(tableInfo.latest_score).toFixed(2)}%` : "-"}
                    </span>
                  </Fact>
                  <Fact label="ตรวจล่าสุด">{formatWhen(tableInfo.latest_at) || "-"}</Fact>
                </div>

                <h4 style={{ fontSize: "12px", fontWeight: 800, marginBottom: "8px", color: "var(--text-muted)" }}>คอลัมน์</h4>
                {tableInfo.columns.length === 0 ? (
                  <div className="gs-empty">ยังไม่มีข้อมูล Schema ของตารางนี้</div>
                ) : (
                  <div style={{ maxHeight: "360px", overflowY: "auto", border: "1px solid var(--border-color)", borderRadius: "8px" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                      <thead>
                        <tr style={{ textAlign: "left", color: "var(--text-muted)", fontSize: "11px" }}>
                          <th style={{ padding: "6px 10px" }}>ชื่อคอลัมน์</th>
                          <th style={{ padding: "6px 10px" }}>ชนิดข้อมูล</th>
                          <th style={{ padding: "6px 10px" }}>บทบาท</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tableInfo.columns.map((c) => {
                          const keys = Array.isArray(tableInfo.primary_key) ? tableInfo.primary_key : [tableInfo.primary_key];
                          const role = keys.includes(c.name) ? "คีย์หลัก" : c.name === tableInfo.date_column ? "คอลัมน์วันที่" : "";
                          return (
                            <tr key={c.name} style={{ borderTop: "1px solid var(--border-color)" }}>
                              <td style={{ padding: "6px 10px", fontFamily: "var(--font-mono)" }}>{c.name}</td>
                              <td style={{ padding: "6px 10px", fontFamily: "var(--font-mono)" }}>{c.type}</td>
                              <td style={{ padding: "6px 10px", color: "var(--accent-purple)", fontWeight: 700 }}>{role}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : (
              <div className="gs-workspace-placeholder">
                <p>เลือกตารางทางซ้ายเพื่อดูรายละเอียด</p>
              </div>
            )
          ) : selectedProposal ? (
            <div className="gs-scard gs-workspace-card">
              <div className="gs-workspace-header">
                <div>
                  <h2>{selectedProposal.table_name}</h2>
                  <span>
                    {selectedProposal.occurrences > 1
                      ? `พบ ${selectedProposal.occurrences} ครั้ง ตั้งแต่ ${formatWhen(selectedProposal.first_seen)} ถึง ${formatWhen(selectedProposal.last_seen)}`
                      : `ตรวจพบ ${formatWhen(selectedProposal.last_seen || selectedProposal.proposed_at)}`}
                  </span>
                </div>
                {tab === "PENDING" && (
                  <div className="gs-actions">
                    <button
                      disabled={submitting}
                      className="gs-btn-approve"
                      onClick={() => triggerConfirm(
                        "อนุมัติการเปลี่ยน Schema?",
                        `Schema ที่พบจะถูกบันทึกเป็น Schema ของตาราง ${selectedProposal.table_name} ทันที ย้อนกลับไม่ได้`,
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
                        `Schema ที่ลงทะเบียนไว้ของตาราง ${selectedProposal.table_name} จะไม่เปลี่ยน ข้อมูลที่นำเข้าแล้วไม่ถูกแก้ไขหรือกักกันย้อนหลัง`,
                        () => handleAction(selectedProposal.id, "reject")
                      )}
                    >
                      {submitting ? "กำลังปฏิเสธ..." : "ปฏิเสธ"}
                    </button>
                  </div>
                )}
              </div>

              {tab === "PENDING" && (
                <div style={{ fontSize: "11.5px", color: "var(--text-muted)", lineHeight: 1.5, marginBottom: "12px" }}>
                  <div><strong>อนุมัติ:</strong> ใช้ชนิดข้อมูลที่พบเป็น Schema ของตารางนี้ การนำเข้าครั้งต่อไปจะถือว่าตรงกับ Schema</div>
                  <div><strong>ปฏิเสธ:</strong> Schema ที่ลงทะเบียนไว้ไม่เปลี่ยน ข้อมูลที่นำเข้าแล้วไม่ถูกแก้ไขย้อนหลัง</div>
                  {selectedProposal.occurrences > 1 && <div>การตัดสินใจนี้ปิดการตรวจพบซ้ำทั้ง {selectedProposal.occurrences} ครั้งพร้อมกัน</div>}
                </div>
              )}

              {tab === "PENDING" && proposalNotes(selectedProposal, registeredTypes).length > 0 && (
                <ul data-testid="proposal-notes" style={{ margin: "0 0 12px 0", padding: "8px 12px", listStyle: "none", fontSize: "11.5px", lineHeight: 1.5, background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: "8px", color: "#92400E" }}>
                  {proposalNotes(selectedProposal, registeredTypes).map((note, i) => <li key={i}>{note}</li>)}
                </ul>
              )}

              <div className="gs-drift-details-section">
                <h4 style={{ fontSize: "12px", fontWeight: 800, marginBottom: "8px", color: "var(--text-muted)" }}>สิ่งที่เปลี่ยน</h4>
                <div className="gs-drift-lines">
                  {Object.entries(selectedProposal.drift_details || {}).map(([col, d]) => {
                    const line = describeDrift(col, d, registeredTypes[col]);
                    return (
                      <div key={col} className="gs-drift-line">
                        <span className="gs-drift-badge" style={{ backgroundColor: line.color }}>{line.badge}</span>
                        <div className="gs-drift-info">
                          <strong>{line.title}</strong>
                          <p>{line.text}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <LearnMore summary="ดู Schema ที่เสนอ (JSON)">
                <pre style={{ background: "#0f172a", color: "#cbd5e1", borderRadius: "8px", padding: "10px", fontSize: "11px", maxHeight: "220px", overflow: "auto" }}>
                  {JSON.stringify(selectedProposal.proposed_schema || {}, null, 2)}
                </pre>
              </LearnMore>

              {tab === "PENDING" && (
                <div className="gs-governance-config">
                  <h4 style={{ fontSize: "11.5px", fontWeight: 800, color: "var(--text-main)" }}>ตั้งค่าก่อนอนุมัติ</h4>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    <div className="gs-input-grp">
                      <label htmlFor="schema-pk" style={{ fontSize: "10.5px", fontWeight: 700, color: "var(--text-muted)" }}>คีย์หลัก</label>
                      <input id="schema-pk" type="text" placeholder="เช่น user_id" value={primaryKeyOverride} onChange={(e) => setPrimaryKeyOverride(e.target.value)} />
                    </div>
                    <div className="gs-input-grp">
                      <label htmlFor="schema-date" style={{ fontSize: "10.5px", fontWeight: 700, color: "var(--text-muted)" }}>คอลัมน์วันที่</label>
                      <input id="schema-date" type="text" placeholder="เช่น created_date" value={dateColumnOverride} onChange={(e) => setDateColumnOverride(e.target.value)} />
                    </div>
                  </div>
                  {registered && (
                    <div style={{ fontSize: "10.5px", color: "var(--text-muted)", marginTop: "6px" }}>
                      ค่าที่ลงทะเบียนไว้: คีย์หลัก {registeredKey || "-"} · คอลัมน์วันที่ {registeredDate || "-"}
                    </div>
                  )}
                </div>
              )}

              {tab !== "PENDING" && (
                <div
                  style={{
                    padding: "12px",
                    textAlign: "center",
                    borderRadius: "8px",
                    border: `1.5px solid ${tab === "APPROVED" ? "var(--accent-green)" : "var(--accent-red)"}`,
                    color: tab === "APPROVED" ? "var(--accent-green)" : "var(--accent-red)",
                    fontWeight: 700,
                    fontSize: "12px",
                    marginTop: "auto"
                  }}
                >
                  {tab === "APPROVED" ? "อนุมัติ" : "ปฏิเสธ"}เมื่อ {formatWhen(selectedProposal.resolved_at || selectedProposal.proposed_at) || "-"}
                  {selectedProposal.resolved_by ? ` โดย ${selectedProposal.resolved_by}` : ""}
                </div>
              )}
            </div>
          ) : (
            <div className="gs-workspace-placeholder">
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
