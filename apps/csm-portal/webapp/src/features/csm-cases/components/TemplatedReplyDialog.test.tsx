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

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

// The real client reads runtime config at module load, absent under vitest.
vi.mock("@api/backend/client", () => ({
  useBackendApi: () => ({ post: vi.fn() }),
}));
vi.mock("@config/apiConfig", () => ({
  apiConfig: { backendUrl: "https://example.test" },
}));

// The rich editor isn't under test here; a textarea stands in for it so the
// "edit it right here" behaviour can be driven directly.
vi.mock("@components/rich-text-editor/Editor", () => ({
  default: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (v: string) => void;
  }) => (
    <textarea
      aria-label="template-body"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

import TemplatedReplyDialog from "@features/csm-cases/components/TemplatedReplyDialog";
import type { ResolvedCommentTemplate } from "@features/csm-cases/utils/commentTemplates";

const TEMPLATES: ResolvedCommentTemplate[] = [
  {
    id: "follow-up",
    label: "Follow up on pending information",
    category: "Follow-up",
    description: "Remind the customer the case is waiting on their input.",
    audience: "public",
    bodyHtml: "<p>Hi Dana,</p><p>We are following up on the information requested.</p>",
  },
  {
    id: "handover-note",
    label: "Handover note",
    category: "Internal",
    description: "Summarize state for the next engineer.",
    audience: "internal",
    bodyHtml: "<p>Current understanding:</p>",
  },
];

function renderDialog(overrides: Partial<React.ComponentProps<typeof TemplatedReplyDialog>> = {}) {
  const onSend = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  render(
    <TemplatedReplyDialog
      templates={TEMPLATES}
      canPostPublic
      isSending={false}
      onClose={onClose}
      onSend={onSend}
      {...overrides}
    />,
  );
  return { onSend, onClose };
}

describe("TemplatedReplyDialog", () => {
  it("lists the templates and prompts for a choice before anything is editable", () => {
    renderDialog();
    expect(screen.getByText("Follow up on pending information")).toBeInTheDocument();
    expect(screen.getByText(/pick a template on the left/i)).toBeInTheDocument();
    expect(screen.queryByLabelText("template-body")).not.toBeInTheDocument();
  });

  it("loads the chosen template into an editor for editing right here", () => {
    renderDialog();
    fireEvent.click(screen.getByText("Follow up on pending information"));
    expect(screen.getByLabelText("template-body")).toHaveValue(
      TEMPLATES[0].bodyHtml,
    );
  });

  it("sends the edited body, not the original template", async () => {
    const { onSend } = renderDialog();
    fireEvent.click(screen.getByText("Follow up on pending information"));
    fireEvent.change(screen.getByLabelText("template-body"), {
      target: { value: "<p>Hi Dana,</p><p>Any update on this?</p>" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send to customer/i }));
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(onSend).toHaveBeenCalledWith(
      "<p>Hi Dana,</p><p>Any update on this?</p>",
      "public",
    );
  });

  it("posts an internal template as a work note, labelling the action as one", async () => {
    const { onSend } = renderDialog();
    fireEvent.click(screen.getByText("Handover note"));
    fireEvent.click(screen.getByRole("button", { name: /post work note/i }));
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(onSend.mock.calls[0][1]).toBe("internal");
  });

  it("closes only once the send succeeds", async () => {
    const { onClose } = renderDialog();
    fireEvent.click(screen.getByText("Handover note"));
    fireEvent.click(screen.getByRole("button", { name: /post work note/i }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("keeps the dialog open and surfaces the failure when the send fails", async () => {
    const onSend = vi.fn().mockRejectedValue(new Error("Upstream refused it."));
    const onClose = vi.fn();
    render(
      <TemplatedReplyDialog
        templates={TEMPLATES}
        canPostPublic
        isSending={false}
        onClose={onClose}
        onSend={onSend}
      />,
    );
    fireEvent.click(screen.getByText("Handover note"));
    fireEvent.click(screen.getByRole("button", { name: /post work note/i }));
    await waitFor(() =>
      expect(screen.getByText("Upstream refused it.")).toBeInTheDocument(),
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it("explains why a customer-facing template can't be sent, rather than hiding it", () => {
    renderDialog({
      canPostPublic: false,
      publicBlockedReason: "Only the case's assigned engineer can reply to the customer.",
    });
    fireEvent.click(screen.getByText("Follow up on pending information"));
    expect(
      screen.getByText(/only the case's assigned engineer can reply/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send to customer/i })).toBeDisabled();
  });

  it("still allows an internal template when a customer reply is blocked", () => {
    renderDialog({ canPostPublic: false, publicBlockedReason: "Blocked." });
    fireEvent.click(screen.getByText("Handover note"));
    expect(screen.getByRole("button", { name: /post work note/i })).toBeEnabled();
  });

  it("searches the body text, not only the name", () => {
    renderDialog();
    fireEvent.change(screen.getByPlaceholderText(/search templates/i), {
      target: { value: "following up" },
    });
    expect(screen.getByText("Follow up on pending information")).toBeInTheDocument();
    expect(screen.queryByText("Handover note")).not.toBeInTheDocument();
  });

  it("filters by category", () => {
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Internal" }));
    expect(screen.getByText("Handover note")).toBeInTheDocument();
    expect(
      screen.queryByText("Follow up on pending information"),
    ).not.toBeInTheDocument();
  });
});

// A case waiting on the customer has its own action for customer-visible
// messages ("Request update"), so a public template must not offer a second
// way to post the same kind of message from here.
describe("TemplatedReplyDialog — cases handled by Request update", () => {
  it("points the engineer at Request update instead of sending", () => {
    renderDialog({
      canPostPublic: false,
      publicBlockedReason:
        "This case is waiting on the customer — use More → Request update to send them a message.",
    });
    fireEvent.click(screen.getByText("Follow up on pending information"));
    expect(screen.getByText(/use more → request update/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send to customer/i })).toBeDisabled();
  });
});
