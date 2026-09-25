import React from "react";
import { getPage, WORKFLOW_STEPS } from "../../config/pages";

export default function PageHeader({ pageKey, actions = null }) {
  const page = getPage(pageKey);
  return (
    <header className="ui-page-header">
      <div>
        {page.step && <span className="ui-page-step">ขั้นที่ {page.step}/{WORKFLOW_STEPS.length}</span>}
        <h1 className="ui-page-title">{page.label}</h1>
        {page.subtitle && <p className="ui-page-subtitle">{page.subtitle}</p>}
      </div>
      {actions && <div className="ui-page-actions">{actions}</div>}
    </header>
  );
}
