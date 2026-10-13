import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import Login from "./Login";

const mockLogin = vi.fn();
const mockSignup = vi.fn();
const mockLoginWithSSO = vi.fn();
const mockLoginAsDemo = vi.fn();

vi.mock("../hooks/useAuth", () => ({
  useAuth: () => ({
    isAuthenticated: false,
    username: null,
    userProfile: null,
    isDemoMode: false,
    authStatusMessage: "",
    login: mockLogin,
    signup: mockSignup,
    loginWithSSO: mockLoginWithSSO,
    loginAsDemo: mockLoginAsDemo,
    logout: vi.fn(),
  }),
}));

describe("Databricks-grade Login & Registration UI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders Databricks showcase and default Sign In form", () => {
    render(
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    );

    expect(screen.getByText("Data Serve")).toBeInTheDocument();
    expect(screen.getByText("Lakehouse Operations")).toBeInTheDocument();
    expect(screen.getByText("Sign In")).toBeInTheDocument();
    expect(screen.getByText("Create Account")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/admin or work email/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sign In to Workspace/i })).toBeInTheDocument();
  });

  it("contains preserved one-click Demo Mode reviewer button", () => {
    render(
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    );

    const demoBtn = screen.getByText(/เข้าชมโหมด Demo/i);
    expect(demoBtn).toBeInTheDocument();

    fireEvent.click(demoBtn);
    expect(mockLoginAsDemo).toHaveBeenCalledTimes(1);
  });

  it("switches smoothly between Sign In and Create Account modes", () => {
    render(
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    );

    // Click Create Account tab
    const createAccountTab = screen.getByRole("button", { name: "Create Account" });
    fireEvent.click(createAccountTab);

    // Verify registration fields appear
    expect(screen.getByLabelText(/Full Name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Work Email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Organization/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Professional Role/i)).toBeInTheDocument();
    expect(screen.getByText(/Community Edition/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Enterprise Lakehouse/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Create Lakehouse Account/i })).toBeInTheDocument();
  });

  it("validates password length and matching confirmation during registration", async () => {
    render(
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: "Create Account" }));

    fireEvent.change(screen.getByLabelText(/Full Name/i), { target: { value: "Test User" } });
    fireEvent.change(screen.getByLabelText(/Work Email/i), { target: { value: "user@lakehouse.io" } });
    fireEvent.change(screen.getByLabelText(/Organization/i), { target: { value: "Test Org" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "123" } });
    fireEvent.change(screen.getByLabelText("Confirm Password"), { target: { value: "123456" } });

    fireEvent.click(screen.getByRole("button", { name: /Create Lakehouse Account/i }));

    expect(await screen.findByText(/รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร/i)).toBeInTheDocument();
    expect(mockSignup).not.toHaveBeenCalled();
  });

  it("submits valid registration data to signup handler", async () => {
    mockSignup.mockResolvedValueOnce({ status: "success", username: "alex_user" });

    render(
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: "Create Account" }));

    fireEvent.change(screen.getByLabelText(/Full Name/i), { target: { value: "Alex Johnson" } });
    fireEvent.change(screen.getByLabelText(/Work Email/i), { target: { value: "alex@lakehouse.io" } });
    fireEvent.change(screen.getByLabelText(/Organization/i), { target: { value: "Acme Lakehouse" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret123" } });
    fireEvent.change(screen.getByLabelText("Confirm Password"), { target: { value: "secret123" } });

    fireEvent.click(screen.getByRole("button", { name: /Create Lakehouse Account/i }));

    await waitFor(() => {
      expect(mockSignup).toHaveBeenCalledWith(
        expect.objectContaining({
          fullName: "Alex Johnson",
          email: "alex@lakehouse.io",
          organization: "Acme Lakehouse",
          password: "secret123",
        })
      );
    });
  });
});
