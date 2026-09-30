import React, { useId, useState } from "react";

export default function InfoHint({ text, label = "คำอธิบาย" }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="ui-infohint">
      <button
        type="button"
        className="ui-infohint-btn"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
      >
        ?
      </button>
      {open && <span role="tooltip" id={id} className="ui-infohint-pop">{text}</span>}
    </span>
  );
}
