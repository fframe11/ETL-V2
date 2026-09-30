import React from "react";
import { Link } from "react-router-dom";
import { nextStep } from "../../config/pages";

export default function NextStepLink({ from }) {
  const next = nextStep(from);
  if (!next) return null;
  return (
    <Link className="ui-next-step" to={next.path}>
      ถัดไป: {next.label} →
    </Link>
  );
}
