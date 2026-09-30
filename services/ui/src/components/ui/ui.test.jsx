import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PageHeader, InfoHint, LearnMore, NextStepLink } from "./index";
import { getPage } from "../../config/pages";
import { visibleText } from "../../test/visibleText";

describe("PageHeader", () => {
  it("uses the nav label as the title and shows the step and subtitle", () => {
    render(<PageHeader pageKey="pipeline" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Jobs & Pipelines");
    expect(screen.getByText(getPage("pipeline").subtitle)).toBeInTheDocument();
    expect(screen.getByText("ขั้นที่ 3/4")).toBeInTheDocument();
  });

  it("renders actions and no step chip for non-workflow pages", () => {
    render(<PageHeader pageKey="schema" actions={<button>ทำ</button>} />);
    expect(screen.getByRole("button", { name: "ทำ" })).toBeInTheDocument();
    expect(screen.queryByText(/ขั้นที่/)).toBeNull();
  });

  it("throws for an unknown page key", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<PageHeader pageKey="nope" />)).toThrow(/Unknown page key/);
  });
});

describe("InfoHint", () => {
  it("keeps the explanation hidden until hovered", () => {
    render(<InfoHint text="คำอธิบายยาว" />);
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.mouseEnter(screen.getByRole("button", { name: "คำอธิบาย" }));
    expect(screen.getByRole("tooltip")).toHaveTextContent("คำอธิบายยาว");
  });

  it("opens on keyboard focus and closes on Escape", () => {
    render(<InfoHint text="x" />);
    const btn = screen.getByRole("button", { name: "คำอธิบาย" });
    fireEvent.focus(btn);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.keyDown(btn, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("toggles on tap for touch screens", () => {
    render(<InfoHint text="x" />);
    fireEvent.click(screen.getByRole("button", { name: "คำอธิบาย" }));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });
});

describe("LearnMore", () => {
  it("shows only its summary until opened", () => {
    const { container } = render(<LearnMore summary="ทำไม">รายละเอียดยาวมาก</LearnMore>);
    expect(visibleText(container)).toBe("ทำไม");
  });
});

describe("NextStepLink", () => {
  it("links to the next workflow page", () => {
    render(<MemoryRouter><NextStepLink from="pipeline" /></MemoryRouter>);
    const link = screen.getByRole("link");
    expect(link).toHaveTextContent("ถัดไป: Workspace Exports");
    expect(link).toHaveAttribute("href", "/export");
  });

  it("renders nothing after the last step", () => {
    const { container } = render(<MemoryRouter><NextStepLink from="export" /></MemoryRouter>);
    expect(container).toBeEmptyDOMElement();
  });
});
