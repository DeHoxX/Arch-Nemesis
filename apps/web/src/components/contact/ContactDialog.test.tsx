import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ContactDialog } from "./ContactDialog";
import * as api from "@/lib/api";
import { ApiError } from "@/lib/api";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    postLead: vi.fn(),
  };
});

describe("ContactDialog Component", () => {
  const onOpenChange = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("shows client-side validation messages for empty required fields and limits", async () => {
    const user = userEvent.setup();
    render(
      <ContactDialog
        open={true}
        onOpenChange={onOpenChange}
        designId="design-123"
        versionNo={1}
      />
    );

    const sendBtn = screen.getByRole("button", { name: "Send" });
    await user.click(sendBtn);

    const nameErr = await screen.findByText("Name is required.");
    expect(nameErr).toBeDefined();

    const emailErr = await screen.findByText("Email is required.");
    expect(emailErr).toBeDefined();

    expect(api.postLead).not.toHaveBeenCalled();

    // Invalid email format
    const emailInput = screen.getByLabelText("Email");
    await user.type(emailInput, "not-an-email");
    await user.click(sendBtn);

    const emailFormatErr = await screen.findByText("Please enter a valid email address.");
    expect(emailFormatErr).toBeDefined();
  });

  it("renders honeypot field with tabindex=-1, autocomplete=off, aria-hidden=true, and sr-only container", () => {
    render(
      <ContactDialog
        open={true}
        onOpenChange={onOpenChange}
        designId="design-123"
        versionNo={1}
      />
    );

    const honeypotInput = document.querySelector('input[name="website"]') as HTMLInputElement;
    expect(honeypotInput).not.toBeNull();
    expect(honeypotInput.getAttribute("tabindex")).toBe("-1");
    expect(honeypotInput.getAttribute("autocomplete")).toBe("off");
    expect(honeypotInput.getAttribute("aria-hidden")).toBe("true");

    const container = honeypotInput.closest(".sr-only");
    expect(container).not.toBeNull();
    expect(container?.getAttribute("aria-hidden")).toBe("true");
  });

  it("forwards honeypot value in request payload when filled by a bot", async () => {
    const user = userEvent.setup();
    vi.mocked(api.postLead).mockResolvedValueOnce({ status: "received" });

    render(
      <ContactDialog
        open={true}
        onOpenChange={onOpenChange}
        designId="design-123"
        versionNo={1}
      />
    );

    await user.type(screen.getByLabelText("Name"), "Bot Name");
    await user.type(screen.getByLabelText("Email"), "bot@example.com");

    const honeypotInput = document.querySelector('input[name="website"]') as HTMLInputElement;
    await user.type(honeypotInput, "https://spamsite.org");

    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(api.postLead).toHaveBeenCalledWith({
        design_id: "design-123",
        version_no: 1,
        name: "Bot Name",
        email: "bot@example.com",
        note: null,
        website: "https://spamsite.org",
      });
    });
  });

  it("displays exact success text upon successful submission", async () => {
    const user = userEvent.setup();
    vi.mocked(api.postLead).mockResolvedValueOnce({ status: "received" });

    render(
      <ContactDialog
        open={true}
        onOpenChange={onOpenChange}
        designId="design-123"
        versionNo={2}
      />
    );

    await user.type(screen.getByLabelText("Name"), "Alice Cooper");
    await user.type(screen.getByLabelText("Email"), "alice@example.com");
    await user.type(screen.getByLabelText(/Note/i), "Looking forward to hearing from you.");

    await user.click(screen.getByRole("button", { name: "Send" }));

    const successEl = await screen.findByText(
      "Thanks. Our team will contact you about this design."
    );
    expect(successEl).toBeDefined();
  });

  it("displays API error in plain text and preserves user inputs on 422 or 500 error", async () => {
    const user = userEvent.setup();
    vi.mocked(api.postLead).mockRejectedValueOnce(
      new ApiError("email: Invalid email address format.", "INPUT_INVALID", 422)
    );

    render(
      <ContactDialog
        open={true}
        onOpenChange={onOpenChange}
        designId="design-123"
        versionNo={1}
      />
    );

    const nameInput = screen.getByLabelText("Name") as HTMLInputElement;
    const emailInput = screen.getByLabelText("Email") as HTMLInputElement;
    const noteInput = screen.getByLabelText(/Note/i) as HTMLTextAreaElement;

    await user.type(nameInput, "Alice Smith");
    await user.type(emailInput, "alice@custom-domain.org");
    await user.type(noteInput, "Initial inquiry note.");

    await user.click(screen.getByRole("button", { name: "Send" }));

    const errEl = await screen.findByText("email: Invalid email address format.");
    expect(errEl).toBeDefined();

    // Inputs must be preserved, never reset on failure
    expect(nameInput.value).toBe("Alice Smith");
    expect(emailInput.value).toBe("alice@custom-domain.org");
    expect(noteInput.value).toBe("Initial inquiry note.");
  });

  it("renders hostile user strings safely as plain text literals without HTML interpretation", async () => {
    const user = userEvent.setup();
    const hostileString = '<script>alert("xss")</script><img src=x onerror=alert(1)>';

    render(
      <ContactDialog
        open={true}
        onOpenChange={onOpenChange}
        designId="design-123"
        versionNo={1}
      />
    );

    const nameInput = screen.getByLabelText("Name");
    await user.type(nameInput, hostileString);
    await user.type(screen.getByLabelText("Email"), "valid@example.com");

    expect(screen.getByDisplayValue(hostileString)).toBeDefined();
    expect(document.querySelector("script")).toBeNull();
  });

  it("disables submit button and shows Sending... while submission promise is pending", async () => {
    const user = userEvent.setup();
    let resolvePromise: (value: { status: "received" }) => void = () => {};
    const pendingPromise = new Promise<{ status: "received" }>((resolve) => {
      resolvePromise = resolve;
    });

    vi.mocked(api.postLead).mockImplementation(() => pendingPromise);

    render(
      <ContactDialog
        open={true}
        onOpenChange={onOpenChange}
        designId="design-123"
        versionNo={1}
      />
    );

    await user.type(screen.getByLabelText("Name"), "Jane Doe");
    await user.type(screen.getByLabelText("Email"), "jane@example.com");

    const sendBtn = screen.getByRole("button", { name: "Send" });
    await user.click(sendBtn);

    // While promise is unresolved, button must be disabled and display Sending...
    const sendingBtn = screen.getByRole("button", { name: "Sending..." }) as HTMLButtonElement;
    expect(sendingBtn).toBeDefined();
    expect(sendingBtn.disabled).toBe(true);

    // Resolve promise inside act to flush state update
    await act(async () => {
      resolvePromise({ status: "received" });
    });

    const successMsg = await screen.findByText(
      "Thanks. Our team will contact you about this design."
    );
    expect(successMsg).toBeDefined();
  });

  it("sends exact current version and design id passed from parent page", async () => {
    const user = userEvent.setup();
    vi.mocked(api.postLead).mockResolvedValueOnce({ status: "received" });

    render(
      <ContactDialog
        open={true}
        onOpenChange={onOpenChange}
        designId="design-target-999"
        versionNo={5}
      />
    );

    await user.type(screen.getByLabelText("Name"), "Bob Stone");
    await user.type(screen.getByLabelText("Email"), "bob@example.com");

    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(api.postLead).toHaveBeenCalledWith(
        expect.objectContaining({
          design_id: "design-target-999",
          version_no: 5,
        })
      );
    });
  });

  it("writes zero lead values to localStorage or sessionStorage", async () => {
    const user = userEvent.setup();
    vi.mocked(api.postLead).mockResolvedValueOnce({ status: "received" });

    render(
      <ContactDialog
        open={true}
        onOpenChange={onOpenChange}
        designId="design-123"
        versionNo={1}
      />
    );

    const secretName = "ConfidentialLeadName";
    const secretEmail = "confidential@secretcompany.com";
    const secretNote = "SuperSecretBusinessContextNote";

    await user.type(screen.getByLabelText("Name"), secretName);
    await user.type(screen.getByLabelText("Email"), secretEmail);
    await user.type(screen.getByLabelText(/Note/i), secretNote);

    await user.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText("Thanks. Our team will contact you about this design.");

    // Verify localStorage and sessionStorage contain zero lead strings
    const allLocal = Object.entries(localStorage).map(([k, v]) => `${k}:${v}`).join(" ");
    const allSession = Object.entries(sessionStorage).map(([k, v]) => `${k}:${v}`).join(" ");

    expect(allLocal.includes(secretName)).toBe(false);
    expect(allLocal.includes(secretEmail)).toBe(false);
    expect(allLocal.includes(secretNote)).toBe(false);

    expect(allSession.includes(secretName)).toBe(false);
    expect(allSession.includes(secretEmail)).toBe(false);
    expect(allSession.includes(secretNote)).toBe(false);
  });

  it("shows not-loaded text and disables Send button when design id is missing", () => {
    render(
      <ContactDialog
        open={true}
        onOpenChange={onOpenChange}
        designId=""
        versionNo={undefined}
      />
    );

    expect(screen.getAllByText("Design specification is not loaded yet.").length).toBeGreaterThan(0);
    const sendBtn = screen.getByRole("button", { name: "Send" }) as HTMLButtonElement;
    expect(sendBtn.disabled).toBe(true);
  });
});
