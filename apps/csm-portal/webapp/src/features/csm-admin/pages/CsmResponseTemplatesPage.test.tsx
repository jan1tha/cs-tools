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

import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import type { ResponseTemplate } from "@features/csm-cases/api/useResponseTemplates";

let mockTemplates: ResponseTemplate[] = [];
let mockIsLoading = false;
let mockIsError = false;

// The page only needs the list query; the editor/history dialogs it can open
// pull their mutations from the same module, so those are stubbed too.
vi.mock("@features/csm-cases/api/useResponseTemplates", () => ({
  useResponseTemplates: () => ({
    data: mockTemplates,
    isLoading: mockIsLoading,
    isError: mockIsError,
  }),
  useCreateResponseTemplate: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateResponseTemplate: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useResponseTemplateVersions: () => ({ data: [], isLoading: false }),
}));

let mockCanManage = true;
vi.mock("@context/current-user/usePortalAccess", () => ({
  usePortalAccess: () => ({
    hasAnyRole: true,
    canEscalate: true,
    canDownloadAttachment: true,
    canUseOperations: true,
    canUseTimeCardsAndUpdates: true,
    canWrite: true,
    canCreateUser: false,
    canUseSecurityCenter: true,
    canManageResponseTemplates: mockCanManage,
  }),
}));

import CsmResponseTemplatesPage from "@features/csm-admin/pages/CsmResponseTemplatesPage";

function template(overrides: Partial<ResponseTemplate> = {}): ResponseTemplate {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    name: "Escalation notice",
    category: "Escalation",
    description: "Tell the customer the case has been escalated.",
    content: "<p>Hi,</p><p>We have escalated this.</p>",
    audience: "public",
    applicableCaseTypes: [],
    applicableStates: ["waiting_on_wso2"],
    isActive: true,
    version: 2,
    createdOn: "2026-01-01T00:00:00Z",
    createdBy: "lead@wso2.com",
    updatedOn: "2026-02-01T00:00:00Z",
    updatedBy: "lead@wso2.com",
    ...overrides,
  };
}

/**
 * The section for one stage, by its state key rather than its heading text —
 * the heading label also appears in every row's "Offered in" column, so
 * `getByText` would be ambiguous.
 */
function stageSection(stage: string): HTMLElement {
  return screen.getByTestId(`stage-${stage}`);
}

beforeEach(() => {
  mockTemplates = [];
  mockIsLoading = false;
  mockIsError = false;
  mockCanManage = true;
});

describe("CsmResponseTemplatesPage", () => {
  it("lists every stage of the case lifecycle, not just the ones with custom templates", () => {
    render(<CsmResponseTemplatesPage />);
    for (const [key, heading] of [
      ["open", "Open"],
      ["work_in_progress", "Work in progress"],
      ["awaiting_info", "Awaiting info"],
      ["waiting_on_wso2", "Waiting on WSO2"],
      ["solution_proposed", "Solution proposed"],
    ] as const) {
      // By role, not text: every row's "Offered in" cell repeats these same
      // stage labels, so plain text would match the heading and the cells.
      expect(
        within(stageSection(key)).getByRole("heading", { name: heading }),
      ).toBeInTheDocument();
    }
  });

  it("shows the portal's built-in templates even when the team has added none", () => {
    render(<CsmResponseTemplatesPage />);
    // The acknowledgement built-in is offered on open and work_in_progress.
    expect(screen.getAllByText("Acknowledge receipt").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Built-in").length).toBeGreaterThan(0);
  });

  it("files a template under every stage it is offered in", () => {
    render(<CsmResponseTemplatesPage />);
    // "Handover note" applies to all five stages, so it appears in each.
    expect(screen.getAllByText("Handover note")).toHaveLength(5);
    // "Confirm the proposed solution" applies to solution_proposed alone.
    expect(screen.getAllByText("Confirm the proposed solution")).toHaveLength(1);
    expect(
      within(stageSection("solution_proposed")).getByText(
        "Confirm the proposed solution",
      ),
    ).toBeInTheDocument();
  });

  it("lists a lead's own template alongside the built-ins, under its stage", () => {
    mockTemplates = [template()];
    render(<CsmResponseTemplatesPage />);
    const waiting = stageSection("waiting_on_wso2");
    expect(within(waiting).getByText("Escalation notice")).toBeInTheDocument();
    expect(within(waiting).getByText("Custom")).toBeInTheDocument();
    // Not offered at a stage it does not name.
    expect(
      within(stageSection("open")).queryByText("Escalation notice"),
    ).not.toBeInTheDocument();
  });

  it("offers a stage-unrestricted template at every stage", () => {
    mockTemplates = [template({ name: "Anything goes", applicableStates: [] })];
    render(<CsmResponseTemplatesPage />);
    expect(screen.getAllByText("Anything goes")).toHaveLength(5);
    expect(screen.getAllByText("Every stage").length).toBe(5);
  });

  it("keeps a retired template listed, marked as retired", () => {
    mockTemplates = [template({ isActive: false })];
    render(<CsmResponseTemplatesPage />);
    expect(screen.getByText("Escalation notice")).toBeInTheDocument();
    expect(screen.getByText("Retired")).toBeInTheDocument();
  });

  it("lets a lead add and edit templates", () => {
    mockTemplates = [template()];
    render(<CsmResponseTemplatesPage />);
    expect(
      screen.getByRole("button", { name: "New template" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "History" })).toBeInTheDocument();
  });

  it("hides every write action from someone who cannot maintain the library", () => {
    mockCanManage = false;
    mockTemplates = [template()];
    render(<CsmResponseTemplatesPage />);
    expect(
      screen.queryByRole("button", { name: "New template" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "History" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/limited to team leads and admins/i),
    ).toBeInTheDocument();
    // The listing itself stays readable -- that is the point of showing it.
    expect(screen.getByText("Escalation notice")).toBeInTheDocument();
  });

  it("previews a built-in's wording, placeholders and all", async () => {
    render(<CsmResponseTemplatesPage />);
    const row = screen
      .getAllByText("Acknowledge receipt")[0]!
      .closest("tr") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "Preview" }));
    const body = await screen.findByTestId("template-preview-body");
    expect(body).toHaveTextContent("Hi {customer},");
    expect(body).toHaveTextContent("We have received this issue.");
    expect(body).toHaveTextContent("{engineer}");
  });

  it("still lists the built-ins when the stored library cannot be loaded", () => {
    mockIsError = true;
    render(<CsmResponseTemplatesPage />);
    expect(screen.getByText(/Could not load the templates/i)).toBeInTheDocument();
    expect(screen.getAllByText("Handover note").length).toBe(5);
  });
});
