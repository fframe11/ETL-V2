import React, { useState } from "react";
import { PageHeader } from "../components/ui";
import DatasetPicker from "../components/builder/DatasetPicker";
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

export default function DashboardBuilder() {
  const [step, setStep] = useState(0);
  const [dataset, setDataset] = useState(null);
  const maxStep = 0;

  return (
    <div className="dbb-page">
      <PageHeader pageKey="builder" />
      <Stepper step={step} maxStep={maxStep} onStep={setStep} />
      {step === 0 && (
        <section className="dbb-panel" aria-label={STEPS[0]}>
          <DatasetPicker selected={dataset} onSelect={setDataset} />
          <div className="dbb-actions">
            <button type="button" className="dbb-btn-primary" disabled={!dataset} onClick={() => setStep(1)}>ถัดไป</button>
          </div>
        </section>
      )}
    </div>
  );
}
