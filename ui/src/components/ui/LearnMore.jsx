import React from "react";

export default function LearnMore({ summary = "เรียนรู้เพิ่มเติม", children }) {
  return (
    <details className="ui-learn-more">
      <summary>{summary}</summary>
      <div className="ui-learn-more-body">{children}</div>
    </details>
  );
}
