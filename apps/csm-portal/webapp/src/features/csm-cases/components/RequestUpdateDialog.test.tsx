// Copyright (c) 2026 WSO2 LLC. (https://www.wso2.com).
//
// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied.  See the License for the
// specific language governing permissions and limitations
// under the License.

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import RequestUpdateDialog from "@features/csm-cases/components/RequestUpdateDialog";
import { useGetCaseUpdateRequestTemplates } from "@features/csm-cases/api/useRequestCaseUpdate";
import type { BeCaseUpdateRequestTemplates } from "@api/backend/types";

vi.mock("@features/csm-cases/api/useRequestCaseUpdate", () => ({
  useGetCaseUpdateRequestTemplates: vi.fn(),
}));

const mockedUseGetTemplates = vi.mocked(useGetCaseUpdateRequestTemplates);

const TEMPLATES: BeCaseUpdateRequestTemplates = {
  generic: {
    first: "<p>Hi Team,</p><p>Generic first reminder.</p>",
    second: "<p>Hi Team,</p><p>Generic second reminder.</p>",
    final: "<p>Hi Team,</p><p>Generic final notice.</p>",
  },
  migration: {
    first: "<p>Hi Team,</p><p>Migration first reminder.</p>",
    second: "<p>Hi Team,</p><p>Migration second reminder.</p>",
    final: "<p>Hi Team,</p><p>Migration final notice.</p>",
  },
};

function mockTemplatesLoaded(
  templates: BeCaseUpdateRequestTemplates = TEMPLATES,
): void {
  mockedUseGetTemplates.mockReturnValue({
    data: templates,
    isLoading: false,
    isError: false,
  } as ReturnType<typeof useGetCaseUpdateRequestTemplates>);
}

/** Pick a message from the left-hand list by its visible label. */
function selectMessage(label: RegExp | string): void {
  fireEvent.click(screen.getByText(label));
}

const LIBRARY = [
  {
    id: "follow-up",
    label: "Follow up on pending information",
    category: "Follow-up",
    description: "Remind the customer the case is waiting on their input.",
    audience: "public" as const,
    bodyHtml:
      "<p>Hi Dana,</p><p>We are following up on the information requested.</p>",
  },
];

function renderDialog(props: Partial<React.ComponentProps<typeof RequestUpdateDialog>> = {}) {
  const onSave = vi.fn();
  const onClose = vi.fn();
  render(
    <RequestUpdateDialog
      category="generic"
      isSaving={false}
      onClose={onClose}
      onSave={onSave}
      {...props}
    />,
  );
  return { onSave, onClose };
}

describe("RequestUpdateDialog", () => {
  it("offers the three reminders and a custom message, and seeds the box with the first", () => {
    mockTemplatesLoaded();
    renderDialog();
    // Queried as controls, not text: the message box below holds the chosen
    // reminder's wording, so a text match would find that too.
    for (const label of ["First reminder", "Second reminder", "Final notice", "Custom message"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
    // The chosen message is editable text, not a read-only preview.
    expect(screen.getByLabelText(/^message/i)).toHaveValue(
      "Hi Team,\n\nGeneric first reminder.",
    );
  });

  it("uses the migration wording when the case is a migration engagement", () => {
    mockTemplatesLoaded();
    renderDialog({ category: "migration" });
    expect(screen.getByLabelText(/^message/i)).toHaveValue(
      "Hi Team,\n\nMigration first reminder.",
    );
  });

  it("swaps the box contents when another message is picked", () => {
    mockTemplatesLoaded();
    renderDialog();
    selectMessage(/final notice/i);
    expect(screen.getByLabelText(/^message/i)).toHaveValue(
      "Hi Team,\n\nGeneric final notice.",
    );
  });

  it("sends an untouched reminder as its stage, so the backend renders its own copy", () => {
    mockTemplatesLoaded();
    const { onSave } = renderDialog();
    selectMessage(/second reminder/i);
    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));
    expect(onSave).toHaveBeenCalledWith({ stage: "second" });
  });

  it("escapes and wraps the engineer's own wording once they edit it", () => {
    mockTemplatesLoaded();
    const { onSave } = renderDialog();
    fireEvent.change(screen.getByLabelText(/^message/i), {
      target: { value: "Any update on <this>?" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));
    expect(onSave).toHaveBeenCalledWith({
      stage: "custom",
      customContent: "<p>Any update on &lt;this&gt;?</p>",
    });
  });

  it("starts a custom message empty and blocks Send until something is written", () => {
    mockTemplatesLoaded();
    const { onSave } = renderDialog();
    selectMessage(/custom message/i);
    expect(screen.getByLabelText(/^message/i)).toHaveValue("");
    expect(screen.getByRole("button", { name: /^send$/i })).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/^message/i), {
      target: { value: "Could you confirm whether this is still reproducible?" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));
    expect(onSave).toHaveBeenCalledWith({
      stage: "custom",
      customContent: "<p>Could you confirm whether this is still reproducible?</p>",
    });
  });

  it("lists response templates alongside the reminders and posts one verbatim", () => {
    mockTemplatesLoaded();
    const { onSave } = renderDialog({ templates: LIBRARY });
    selectMessage("Follow up on pending information");
    // Shown as editable text...
    expect(screen.getByLabelText(/^message/i)).toHaveValue(
      "Hi Dana,\n\nWe are following up on the information requested.",
    );
    // ...but sent as its own markup while untouched, so its formatting survives.
    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));
    expect(onSave).toHaveBeenCalledWith({
      stage: "custom",
      customContent: LIBRARY[0].bodyHtml,
    });
  });

  it("shows only the reminders when no templates apply", () => {
    mockTemplatesLoaded();
    renderDialog({ templates: [] });
    expect(
      screen.queryByText("Follow up on pending information"),
    ).not.toBeInTheDocument();
  });

  it("still allows a message of the engineer's own when the reminders fail to load", () => {
    mockedUseGetTemplates.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as ReturnType<typeof useGetCaseUpdateRequestTemplates>);
    const { onSave } = renderDialog();
    expect(screen.getByText(/couldn't load the reminder messages/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^message/i), {
      target: { value: "Checking in on this case." },
    });
    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));
    expect(onSave).toHaveBeenCalledWith({
      stage: "custom",
      customContent: "<p>Checking in on this case.</p>",
    });
  });

  it("disables the actions while a send is in flight", () => {
    mockTemplatesLoaded();
    renderDialog({ isSaving: true });
    expect(screen.getByRole("button", { name: /^send$/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /close/i })).toBeDisabled();
  });

  it("calls onClose on Close without sending anything", () => {
    mockTemplatesLoaded();
    const { onSave, onClose } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });
});
