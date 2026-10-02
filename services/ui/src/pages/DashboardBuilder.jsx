import React, { useRef, useState } from "react";
import { PageHeader } from "../components/ui";
import DatasetPicker, { datasetLabel } from "../components/builder/DatasetPicker";
import DataPreview from "../components/builder/DataPreview";
import ContextForm from "../components/builder/ContextForm";
import DashboardCanvas from "../components/builder/DashboardCanvas";
import RefinePanel from "../components/builder/RefinePanel";
import SaveDialog from "../components/builder/SaveDialog";
import SavedDashboards from "../components/builder/SavedDashboards";
import { dashboardsApi } from "../utils/dashboardsApi";
import "./DashboardBuilder.css";

export const STEPS = ["เลือกชุดข้อมูล", "ดูข้อมูล", "ระบุความต้องการ", "แดชบอร์ด"];

function Stepper({ step, maxStep, onStep }) {
  return (
    <ol className="dbb-stepper" aria-label="ขั้นตอนสร้างแดชบอร์ด">
      {STEPS.map((label, i) => (
        <li key={label} className={i === step ? "is-current" : i <= maxStep ? "is-done" : ""}>
          <button type="button" onClick={() => onStep(i)} disabled={i > maxStep} aria-current={i === step ? "step" : undefined}>
            <span className="dbb-step-num">{i + 1}</span>
            {label}
          </button>
        </li>
      ))}
    </ol>
  );
}

function EngineNote({ draft }) {
  const label = {
    groq: `สร้างโดย AI (${draft.model})`,
    rules: "สร้างแบบกฎอัตโนมัติ เพราะ AI ไม่พร้อม",
    saved: `แดชบอร์ดที่บันทึกไว้: ${draft.savedName}`
  }[draft.engine];
  return (
    <div className={`dbb-engine is-${draft.engine}`} role="status">
      {label}
      {draft.warnings?.length > 0 && (
        <details>
          <summary>หมายเหตุ {draft.warnings.length} รายการ</summary>
          <ul>{draft.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </details>
      )}
    </div>
  );
}

export default function DashboardBuilder() {
  const [step, setStepRaw] = useState(0);
  const [dataset, setDataset] = useState(null);
  const [request, setRequest] = useState({ context: "", audience: "business" });
  const [draft, setDraft] = useState(null);
  const [selections, setSelections] = useState({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [refinements, setRefinements] = useState([]);
  const [changes, setChanges] = useState(null);
  const [saved, setSaved] = useState(null);
  const [showSave, setShowSave] = useState(false);
  const [notice, setNotice] = useState("");
  // Guards against late responses: `epoch` changes with the dataset, `seq` counts the calls per kind,
  // and `committed` holds the selections that match the data currently on screen.
  const epoch = useRef(0);
  const seq = useRef({});
  const committed = useRef({});

  const maxStep = draft ? 3 : dataset ? 2 : 0;

  const setStep = (next) => {
    setError("");
    setStepRaw(next);
  };

  const chooseDataset = (next) => {
    if (dataset?.name !== next.name) {
      epoch.current += 1;
      committed.current = {};
      setDraft(null);
      setSelections({});
      setRefinements([]);
      setChanges(null);
      setSaved(null);
      setError("");
      setBusy("");
    }
    setDataset(next);
  };

  // Starting a call (or invalidating a kind) makes every earlier call of that kind stale.
  const bump = (kind) => (seq.current[kind] = (seq.current[kind] || 0) + 1);

  // `work(live)` must check live() after every await before it writes state: a response is dropped
  // when the dataset changed or a newer call of the same kind has started.
  const run = async (kind, work) => {
    const myEpoch = epoch.current;
    const mySeq = bump(kind);
    const live = () => myEpoch === epoch.current && mySeq === seq.current[kind];
    setBusy(kind);
    setError("");
    try {
      return await work(live);
    } catch (e) {
      if (live()) setError(e.message);
      return null;
    } finally {
      if (live()) setBusy("");
    }
  };

  const generate = () => run("generate", async (live) => {
    const result = await dashboardsApi.generate(dataset.name, request.context, request.audience);
    if (!live()) return;
    bump("refine"); // a refine or filter render started for the previous draft must not touch the new one
    bump("render");
    committed.current = {};
    setDraft(result);
    setSelections({});
    setRefinements([]);
    setChanges(null);
    setStep(3);
  });

  // Resolves true only when the refined dashboard was committed (the panel then clears its textbox).
  const refine = (instruction) => run("refine", async (live) => {
    const result = await dashboardsApi.refine(dataset.name, draft.spec, instruction);
    if (!live()) return false;
    bump("render"); // a filter render started for the old draft must not overwrite the refined one
    committed.current = {};
    setDraft(result);
    setSelections({});
    setChanges(result.changes);
    setRefinements((list) => [...list, instruction]);
    return true;
  });

  const save = ({ name, description }) => run("save", async (live) => {
    const doc = { name, description, table_name: dataset.name, context: request.context,
      audience: request.audience, spec: draft.spec, refinements };
    const result = saved ? await dashboardsApi.updateSaved(saved.id, doc) : await dashboardsApi.createSaved(doc);
    if (!live()) return; // the save itself happened on the server; only the screen has moved on
    setSaved({ id: result.id, name: result.name, description: result.description || "" });
    setShowSave(false);
    setNotice(`บันทึก "${result.name}" แล้ว`);
  });

  // Opening replaces the whole working state, so it also invalidates every call still in flight for the old one.
  const openSaved = (id) => run("open", async (live) => {
    const doc = await dashboardsApi.getSaved(id);
    const rendered = await dashboardsApi.render(doc.table_name, doc.spec, {});
    if (!live()) return false;
    epoch.current += 1;
    bump("generate");
    bump("refine");
    bump("render");
    committed.current = {};
    setBusy(""); // the calls invalidated above will not clear their own busy flag any more
    setDataset({ name: doc.table_name });
    setRequest({ context: doc.context || "", audience: doc.audience || "business" });
    setRefinements(doc.refinements || []);
    setChanges(null);
    setSaved({ id: doc.id, name: doc.name, description: doc.description || "" });
    setDraft({ spec: rendered.spec, data: rendered.data, engine: "saved", model: null, warnings: [], savedName: doc.name });
    setSelections({});
    setNotice("");
    setStep(3);
    return true;
  });

  const changeSelections = (next) => {
    setSelections(next);
    return run("render", async (live) => {
      try {
        const result = await dashboardsApi.render(dataset.name, draft.spec, next);
        if (!live()) return;
        committed.current = next;
        setDraft((d) => d && { ...d, spec: result.spec, data: result.data });
      } catch (e) {
        if (live()) setSelections(committed.current);
        throw e;
      }
    });
  };

  return (
    <div className="dbb-page">
      <PageHeader pageKey="builder" />
      <Stepper step={step} maxStep={maxStep} onStep={setStep} />
      {error && <p role="alert" className="dbb-error">{error}</p>}
      {notice && <p className="dbb-notice">{notice}</p>}

      {step === 0 && (
        <section className="dbb-panel" aria-label={STEPS[0]}>
          <DatasetPicker selected={dataset} onSelect={chooseDataset} />
          <div className="dbb-actions">
            <button type="button" className="dbb-btn-primary" disabled={!dataset} onClick={() => setStep(1)}>ถัดไป</button>
          </div>
          <SavedDashboards onOpen={openSaved}
            onDeleted={(id) => setSaved((s) => (s?.id === id ? null : s))} />
        </section>
      )}

      {step === 1 && dataset && (
        <section className="dbb-panel" aria-label={STEPS[1]}>
          <DataPreview table={dataset.name} />
          <div className="dbb-actions">
            <button type="button" onClick={() => setStep(0)}>ย้อนกลับ</button>
            <button type="button" className="dbb-btn-primary" onClick={() => setStep(2)}>ถัดไป</button>
          </div>
        </section>
      )}

      {step === 2 && dataset && (
        <section className="dbb-panel" aria-label={STEPS[2]}>
          <ContextForm table={datasetLabel(dataset.name)} value={request} onChange={setRequest} onGenerate={generate} busy={busy === "generate"} />
        </section>
      )}

      {step === 3 && draft && (
        <section className="dbb-panel" aria-label={STEPS[3]}>
          <div className="dbb-toolbar">
            <EngineNote draft={draft} />
            <div className="dbb-actions">
              <button type="button" onClick={() => setStep(2)}>แก้ความต้องการ</button>
              <button type="button" className="dbb-btn-primary" onClick={() => setShowSave(true)}>
                {saved ? "บันทึกการแก้ไข" : "บันทึกแดชบอร์ด"}
              </button>
            </div>
          </div>
          <div className="dbb-workspace">
            <DashboardCanvas spec={draft.spec} data={draft.data} selections={selections}
              onSelectionsChange={changeSelections} busy={busy === "render"} />
            <RefinePanel onRefine={refine} busy={busy === "refine"} changes={changes} history={refinements} />
          </div>
        </section>
      )}

      {showSave && (
        <SaveDialog initial={saved || { name: draft?.spec.title || "", description: draft?.spec.description || "" }}
          onSave={save} onCancel={() => setShowSave(false)} busy={busy === "save"} />
      )}
    </div>
  );
}
