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

import { describe, expect, it } from "vitest";
import {
  firstNameOf,
  greetingNameFor,
  resolveCommentTemplates,
  templateHtmlToPlainText,
  type CommentTemplateContext,
} from "@features/csm-cases/utils/commentTemplates";

const BASE: CommentTemplateContext = {
  state: "open",
  assigneeIsMe: true,
  assigneeName: "Jane Doe",
  reporterName: "John Smith",
  reporterEmail: "john.smith@acme.example",
};

function ack(ctx: Partial<CommentTemplateContext> = {}) {
  return resolveCommentTemplates({ ...BASE, ...ctx }).find(
    (t) => t.id === "acknowledge-receipt",
  );
}

describe("firstNameOf", () => {
  it("takes the first word of a display name", () => {
    expect(firstNameOf("Jane Doe")).toBe("Jane");
    expect(firstNameOf("  Jane   Doe ")).toBe("Jane");
    expect(firstNameOf("Jane")).toBe("Jane");
  });

  it("treats a blank or unassigned placeholder as no name", () => {
    expect(firstNameOf("")).toBe("");
    expect(firstNameOf("   ")).toBe("");
    expect(firstNameOf(null)).toBe("");
    expect(firstNameOf(undefined)).toBe("");
    expect(firstNameOf("Unassigned")).toBe("");
  });
});

describe("greetingNameFor — who a customer-facing message addresses", () => {
  it("greets the reporter when they are a customer", () => {
    expect(greetingNameFor(BASE)).toBe("John");
  });

  it("greets nobody when a WSO2 engineer raised the case", () => {
    // Raised on the customer's behalf — greeting the engineer by name in a
    // message going to the customer would read as a mistake.
    expect(greetingNameFor({ ...BASE, reporterEmail: "engineer@wso2.com" })).toBe("");
  });

  it("greets nobody when the creator field holds a system identifier", () => {
    // Some sources put a bare name like "seed" or a sync-job id there.
    expect(greetingNameFor({ ...BASE, reporterEmail: "seed" })).toBe("");
  });

  it("greets nobody when the reporter's email is unknown", () => {
    expect(greetingNameFor({ ...BASE, reporterEmail: null })).toBe("");
    expect(greetingNameFor({ ...BASE, reporterEmail: "  " })).toBe("");
  });
});

describe("resolveCommentTemplates — acknowledgement", () => {
  it("greets the customer and signs off with the assignee, both by first name", () => {
    const template = ack();
    expect(template?.bodyHtml).toBe(
      "<p>Hi John,</p>" +
        "<p>We have received this issue. We will analyze this and get back to you soon.</p>" +
        "<p>Best regards,<br />Jane</p>",
    );
  });

  it("is marked as customer-facing so the composer posts it publicly", () => {
    expect(ack()?.audience).toBe("public");
  });

  it("is offered while the case is open and once work has started", () => {
    expect(ack({ state: "open" })).toBeDefined();
    expect(ack({ state: "work_in_progress" })).toBeDefined();
  });

  it("is not offered in states where acknowledging no longer makes sense", () => {
    expect(ack({ state: "solution_proposed" })).toBeUndefined();
    expect(ack({ state: "awaiting_info" })).toBeUndefined();
    expect(ack({ state: "waiting_on_wso2" })).toBeUndefined();
    expect(ack({ state: "closed" })).toBeUndefined();
  });

  it("is not offered to anyone but the assignee, who alone can reply publicly", () => {
    expect(ack({ assigneeIsMe: false })).toBeUndefined();
  });

  it("offers nothing at all while the case is still loading", () => {
    expect(resolveCommentTemplates({ ...BASE, state: undefined })).toEqual([]);
  });

  it("falls back to a neutral greeting and sign-off when neither name is known", () => {
    const template = ack({
      reporterName: null,
      reporterEmail: null,
      assigneeName: "Unassigned",
    });
    expect(template?.bodyHtml).toBe(
      "<p>Hi,</p>" +
        "<p>We have received this issue. We will analyze this and get back to you soon.</p>" +
        "<p>Best regards,</p>",
    );
  });

  it("escapes names rather than letting them inject markup", () => {
    const template = ack({
      reporterName: '<img src=x onerror="alert(1)">',
      // Only the first word is used, so the escapable character has to be in it.
      assigneeName: "Ben&Co Smith",
    });
    expect(template?.bodyHtml).toContain("&lt;img");
    expect(template?.bodyHtml).not.toContain("<img");
    expect(template?.bodyHtml).toContain("Ben&amp;Co");
  });
});

describe("templateHtmlToPlainText", () => {
  it("keeps paragraph boundaries instead of running them together", () => {
    expect(
      templateHtmlToPlainText("<p>Hi Dana,</p><p>We have received this issue.</p>"),
    ).toBe("Hi Dana,\n\nWe have received this issue.");
  });

  it("renders list items as bullets", () => {
    const text = templateHtmlToPlainText(
      "<p>Please share:</p><ul><li>Server logs</li><li>Product version</li></ul>",
    );
    expect(text).toContain("• Server logs");
    expect(text).toContain("• Product version");
  });

  it("treats a line break as a line break", () => {
    expect(templateHtmlToPlainText("<p>Best regards,<br />Jane</p>")).toBe(
      "Best regards,\nJane",
    );
  });
});
