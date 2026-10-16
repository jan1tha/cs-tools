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

import type { CaseState } from "@features/csm-dashboard/types/abtDashboard";
import { escapeHtml, sanitizeRichTextHtml } from "@utils/sanitizeHtml";

/**
 * Canned comment bodies an engineer can drop into the case composer instead of
 * retyping the same message on every case, then edit before sending. The
 * engineer always sees the rendered text in the editor first — nothing here is
 * ever posted on its own.
 *
 * Templates live in this module rather than coming from the backend because
 * there is no template API for case comments yet. `resolveCommentTemplates` is
 * the only thing the UI calls, so swapping this list for a fetched one later
 * means replacing this module's internals, not the composer.
 */

/** Who a template is written for, which decides the composer's own toggle. */
export type CommentTemplateAudience = "public" | "internal";

/** Everything a template needs to fill its placeholders. */
export interface CommentTemplateContext {
  /** The case's current state; `undefined` while the case is still loading. */
  state: CaseState | undefined;
  /** Whether the signed-in engineer is this case's assignee. */
  assigneeIsMe: boolean;
  /**
   * Whether a customer-visible reply can actually be posted on this case
   * right now, by this engineer — the same question the composer's own gate
   * answers (see `publicCommentGateReason`). Customer-facing templates are
   * offered on this rather than on assignment alone: a case waiting on the
   * customer can be nudged by any engineer, and hiding the templates there
   * would withhold them exactly where chasing is the expected next step.
   * Absent falls back to `assigneeIsMe`, the rule that applies on an
   * in-progress case.
   */
  canPostPublicComment?: boolean;
  /**
   * Display name of the case's assigned engineer, e.g. "Jane Doe". The
   * literal "Unassigned" placeholder some sources use for an unassigned case
   * is treated as absent.
   */
  assigneeName?: string | null;
  /** The case's own type, for templates narrowed to one. */
  caseType?: string;
  /** Display name of whoever raised the case. */
  reporterName?: string | null;
  /**
   * Reporter's email, used only to tell a customer contact from a WSO2
   * engineer — a case is often raised on the customer's behalf by an
   * engineer, and greeting a colleague in a customer-facing message reads as
   * a mistake.
   */
  reporterEmail?: string | null;
}

interface CommentTemplateDefinition {
  id: string;
  /** Picker entry text. */
  label: string;
  /** Groups related templates in the picker, and is searchable. */
  category: string;
  /** One-line explanation of when to reach for it, shown under the label. */
  description: string;
  audience: CommentTemplateAudience;
  /** Case states this template is offered in. */
  appliesTo: readonly CaseState[];
  /**
   * When true, this template is only offered to an engineer who can actually
   * post a customer-visible reply right now (see
   * `CommentTemplateContext.canPostPublicComment`). Set for anything
   * customer-facing, so a colleague is never handed a message the backend
   * would refuse from them.
   */
  requiresPublicReply: boolean;
  build: (ctx: CommentTemplateContext) => string;
}

/** A template with its placeholders already filled for one specific case. */
export interface ResolvedCommentTemplate {
  id: string;
  label: string;
  category: string;
  description: string;
  audience: CommentTemplateAudience;
  /** Ready to drop into the composer. */
  bodyHtml: string;
}

/** Some sources report an unassigned case's engineer as this literal string. */
const UNASSIGNED = "unassigned";

/** Matches the same check UserProfilePage applies to spot an internal user. */
const WSO2_EMAIL_DOMAIN = "@wso2.com";

/**
 * Who a customer-facing message should greet: the person who raised the case,
 * but only when they are demonstrably a customer. Returns "" otherwise, and
 * the template then opens with a plain "Hi," for the engineer to complete.
 *
 * "Demonstrably" is deliberately strict — the reporter is greeted only when
 * their identity is a real email address that is not a WSO2 one. Anything
 * else (missing, or a bare system identifier like "seed" that some sources
 * put in the creator field) could be an engineer or an automation account.
 *
 * There is deliberately no fallback to the account's "primary contact": the
 * case detail mapper derives that field from the reporter too, so falling
 * back to it would re-introduce exactly the name this check just rejected. A
 * real account-contact fallback needs a distinct field from the backend
 * first. A missing name in a template the engineer edits before sending is a
 * far smaller problem than confidently greeting a WSO2 colleague in a message
 * addressed to the customer.
 */
export function greetingNameFor(ctx: CommentTemplateContext): string {
  const email = (ctx.reporterEmail ?? "").trim().toLowerCase();
  const reporterIsCustomer =
    email.includes("@") && !email.endsWith(WSO2_EMAIL_DOMAIN);
  return reporterIsCustomer ? firstNameOf(ctx.reporterName) : "";
}

/**
 * First word of a display name, for a greeting or a sign-off — "Jane Doe"
 * becomes "Jane". Returns "" for a blank or placeholder name so callers can
 * fall back rather than greeting an empty string.
 */
export function firstNameOf(fullName: string | null | undefined): string {
  const trimmed = (fullName ?? "").trim();
  if (!trimmed || trimmed.toLowerCase() === UNASSIGNED) return "";
  return trimmed.split(/\s+/)[0] ?? "";
}

/**
 * Acknowledgement sent once a case has been picked up, telling the customer
 * their issue has landed with a named engineer.
 *
 * Offered on `work_in_progress` as well as `open` deliberately. A public
 * comment is only accepted while the case is in progress and ongoing (see
 * `caseAcceptsPublicComments`), so an acknowledgement restricted to `open`
 * would be offered exclusively in the one state it cannot be sent from — the
 * engineer would insert it, hit the composer's public-reply lock, start work,
 * and find the template gone. Covering both states means it is there
 * throughout the window where acknowledging is the natural next thing to do.
 */
const ACKNOWLEDGE_RECEIPT: CommentTemplateDefinition = {
  id: "acknowledge-receipt",
  label: "Acknowledge receipt",
  category: "Acknowledgement",
  description: "Confirm the case has been received and is being looked at.",
  audience: "public",
  appliesTo: ["open", "work_in_progress"],
  requiresPublicReply: true,
  build: (ctx) => {
    const { assigneeName } = ctx;
    // Names come from case data and land in the editor as HTML, so they are
    // escaped here rather than trusted — a customer or account name can
    // legitimately contain "&" or quotes.
    const greetingName = greetingNameFor(ctx);
    const greeting = greetingName ? `Hi ${escapeHtml(greetingName)},` : "Hi,";
    const signOffName = firstNameOf(assigneeName);
    const signOff = signOffName
      ? `Best regards,<br />${escapeHtml(signOffName)}`
      : "Best regards,";
    return [
      `<p>${greeting}</p>`,
      "<p>We have received this issue. We will analyze this and get back to you soon.</p>",
      `<p>${signOff}</p>`,
    ].join("");
  },
};


/**
 * Signature block shared by every customer-facing template, so a change to
 * how engineers sign off happens in one place.
 */
function signOff(assigneeName: string | null | undefined): string {
  const name = firstNameOf(assigneeName);
  return name
    ? `<p>Best regards,<br />${escapeHtml(name)}</p>`
    : "<p>Best regards,</p>";
}

/** Opening line, addressed to the customer when it is safe to name them. */
function greeting(ctx: CommentTemplateContext): string {
  const name = greetingNameFor(ctx);
  return name ? `<p>Hi ${escapeHtml(name)},</p>` : "<p>Hi,</p>";
}

/**
 * Asks the customer for the diagnostic detail an engineer almost always
 * needs before real analysis can start.
 */
const REQUEST_DETAILS: CommentTemplateDefinition = {
  id: "request-details",
  label: "Request more details",
  category: "Information request",
  description: "Ask for logs, versions and steps needed to investigate.",
  audience: "public",
  appliesTo: ["work_in_progress", "awaiting_info"],
  requiresPublicReply: true,
  build: (ctx) =>
    [
      greeting(ctx),
      "<p>To investigate this further, could you please share the following?</p>",
      "<ul><li>Relevant server logs covering the time of the issue</li>" +
        "<li>The exact product version and deployment pattern in use</li>" +
        "<li>Steps to reproduce, and how often the issue occurs</li></ul>",
      "<p>Once we have these, we will continue the analysis and get back to you.</p>",
      signOff(ctx.assigneeName),
    ].join(""),
};

/** Keeps a long-running investigation visibly alive for the customer. */
const PROGRESS_UPDATE: CommentTemplateDefinition = {
  id: "progress-update",
  label: "Progress update",
  category: "Progress update",
  description: "Tell the customer where the investigation currently stands.",
  audience: "public",
  appliesTo: ["work_in_progress", "waiting_on_wso2"],
  requiresPublicReply: true,
  build: (ctx) =>
    [
      greeting(ctx),
      "<p>A quick update on this case: we are still analyzing the issue and will share our findings as soon as we have them.</p>",
      "<p>Thank you for your patience.</p>",
      signOff(ctx.assigneeName),
    ].join(""),
};

/** Chases a customer whose input the case is currently blocked on. */
const AWAITING_INFO_FOLLOW_UP: CommentTemplateDefinition = {
  id: "awaiting-info-follow-up",
  label: "Follow up on pending information",
  category: "Follow-up",
  description: "Remind the customer the case is waiting on their input.",
  audience: "public",
  appliesTo: ["awaiting_info"],
  requiresPublicReply: true,
  build: (ctx) =>
    [
      greeting(ctx),
      "<p>We are following up on the information requested earlier, which we need before we can continue our analysis.</p>",
      "<p>Please let us know if anything is unclear or if you need more time.</p>",
      signOff(ctx.assigneeName),
    ].join(""),
};

/** Invites the customer to confirm a proposed fix so the case can close. */
const SOLUTION_FOLLOW_UP: CommentTemplateDefinition = {
  id: "solution-follow-up",
  label: "Confirm the proposed solution",
  category: "Resolution",
  description: "Ask the customer to verify the solution already shared.",
  audience: "public",
  appliesTo: ["solution_proposed"],
  requiresPublicReply: true,
  build: (ctx) =>
    [
      greeting(ctx),
      "<p>Could you please confirm whether the proposed solution resolves the issue on your side?</p>",
      "<p>If it does, we will proceed to close this case. If anything is still outstanding, let us know and we will continue working on it.</p>",
      signOff(ctx.assigneeName),
    ].join(""),
};

/**
 * Internal handover note. The only template not addressed to the customer,
 * and so the only one not restricted to the assignee — a colleague picking
 * the case up is exactly who needs it.
 */
const HANDOVER_NOTE: CommentTemplateDefinition = {
  id: "handover-note",
  label: "Handover note",
  category: "Internal",
  description: "Summarize state for whoever picks this case up next.",
  audience: "internal",
  appliesTo: ["open", "work_in_progress", "awaiting_info", "waiting_on_wso2", "solution_proposed"],
  requiresPublicReply: false,
  build: () =>
    [
      "<p><strong>Handover note</strong></p>",
      "<ul><li>Current understanding of the issue: </li>",
      "<li>What has been tried so far: </li>",
      "<li>Next step for whoever picks this up: </li></ul>",
    ].join(""),
};

/**
 * Every template known to the portal. Adding a stage's template — an
 * "awaiting info" chaser, a "solution proposed" summary — means adding an
 * entry here with its own `appliesTo`; nothing else has to change.
 */
const COMMENT_TEMPLATES: readonly CommentTemplateDefinition[] = [
  ACKNOWLEDGE_RECEIPT,
  REQUEST_DETAILS,
  PROGRESS_UPDATE,
  AWAITING_INFO_FOLLOW_UP,
  SOLUTION_FOLLOW_UP,
  HANDOVER_NOTE,
];

/**
 * A built-in template as the Settings library lists it: the definition itself,
 * not a copy resolved against one particular case.
 *
 * Shaped to line up field-for-field with the stored templates a lead creates
 * (`ResponseTemplate`), so the management table renders both from one row
 * component instead of branching per source.
 */
export interface BuiltInTemplateSummary {
  id: string;
  name: string;
  category: string;
  description: string;
  audience: CommentTemplateAudience;
  /** Every stage this template is offered in — never empty for a built-in. */
  applicableStates: CaseState[];
  /** Body with `{customer}`/`{engineer}` left visible, see `CATALOGUE_CONTEXT`. */
  content: string;
}

/**
 * Context used to render a built-in's body for the library listing. Names are
 * single tokens on purpose: `firstNameOf` takes the first whitespace-separated
 * word, so a multi-word placeholder like "{customer first name}" would be
 * shown clipped to "{customer". The email is a syntactically real, non-WSO2
 * address so `greetingNameFor` takes the customer branch and the listing shows
 * the greeting an engineer actually gets.
 */
const CATALOGUE_CONTEXT: CommentTemplateContext = {
  state: undefined,
  assigneeIsMe: true,
  canPostPublicComment: true,
  assigneeName: "{engineer}",
  reporterName: "{customer}",
  reporterEmail: "contact@example.com",
};

/**
 * Every template the portal ships, across every stage — what the Settings
 * library lists alongside the ones leads have added, so the page shows the
 * full set an engineer can be offered rather than only the custom part of it.
 *
 * These are read-only there: they are code, not rows, so there is nothing to
 * edit or retire. A lead who wants different wording adds their own.
 */
export function builtInTemplateCatalogue(): BuiltInTemplateSummary[] {
  return COMMENT_TEMPLATES.map((t) => ({
    id: t.id,
    name: t.label,
    category: t.category,
    description: t.description,
    audience: t.audience,
    applicableStates: [...t.appliesTo],
    content: t.build(CATALOGUE_CONTEXT),
  }));
}

/**
 * Templates offered for one case right now, with placeholders filled. Returns
 * an empty array when nothing applies, which is the common case — the
 * composer shows no template control at all then.
 */
export function resolveCommentTemplates(
  ctx: CommentTemplateContext,
): ResolvedCommentTemplate[] {
  if (!ctx.state) return [];
  const canReplyPublicly = ctx.canPostPublicComment ?? ctx.assigneeIsMe;
  return COMMENT_TEMPLATES.filter(
    (t) =>
      t.appliesTo.includes(ctx.state as CaseState) &&
      (!t.requiresPublicReply || canReplyPublicly),
  ).map((t) => ({
    id: t.id,
    label: t.label,
    category: t.category,
    description: t.description,
    audience: t.audience,
    bodyHtml: t.build(ctx),
  }));
}

/**
 * Folds the lead-maintained templates the backend serves in alongside the
 * built-in ones, applying the same state/assignee rules.
 *
 * Built-ins are kept rather than replaced: they are what a deployment with an
 * empty library (or an unreachable one) still offers, so the composer is never
 * left with nothing. A stored template whose id collides with a built-in wins,
 * which is how a lead overrides the shipped wording.
 *
 * `applicableStates`/`applicableCaseTypes` are matched here rather than
 * relied on from the query, so the same resolved list is correct even when the
 * caller fetched the library unfiltered (the management view does).
 */
export function mergeStoredTemplates(
  builtIn: ResolvedCommentTemplate[],
  stored: StoredCommentTemplate[],
  ctx: CommentTemplateContext,
): ResolvedCommentTemplate[] {
  const applicable = stored.filter((t) => {
    if (!t.isActive) return false;
    if (t.audience === "public" && !(ctx.canPostPublicComment ?? ctx.assigneeIsMe)) {
      return false;
    }
    if (t.applicableStates.length > 0) {
      if (!ctx.state || !t.applicableStates.includes(ctx.state)) return false;
    }
    if (t.applicableCaseTypes.length > 0) {
      if (!ctx.caseType || !t.applicableCaseTypes.includes(ctx.caseType)) return false;
    }
    return true;
  });

  const resolved = applicable.map(
    (t): ResolvedCommentTemplate => ({
      id: t.id,
      label: t.name,
      category: t.category || "General",
      description: t.description ?? "",
      audience: t.audience,
      bodyHtml: t.content,
    }),
  );

  const overridden = new Set(resolved.map((t) => t.id));
  return [...builtIn.filter((t) => !overridden.has(t.id)), ...resolved];
}

/**
 * The shape `mergeStoredTemplates` needs from a stored template — a subset of
 * the API type, so this module stays independent of the query layer.
 */
export interface StoredCommentTemplate {
  id: string;
  name: string;
  category: string;
  description?: string;
  content: string;
  audience: CommentTemplateAudience;
  applicableCaseTypes: string[];
  applicableStates: string[];
  isActive: boolean;
}

/**
 * Renders a template's HTML body as editable plain text, preserving the
 * boundaries that carry meaning: one line per block, a "• " prefix per list
 * item.
 *
 * Deliberately not `stripHtmlTags`, which removes every tag before reading
 * textContent and so collapses `<p>Hi,</p><p>We…</p>` into "Hi,We…" — its own
 * doc comment scopes it to plain-text-in-a-string fields. Deliberately not
 * `htmlToPdfPlainText` either, which does the right thing but lives in a
 * module that statically imports jsPDF; pulling that into the comment UI
 * would drag the PDF library into the main bundle it is kept out of.
 */
export function templateHtmlToPlainText(html: string): string {
  const doc = new DOMParser().parseFromString(
    sanitizeRichTextHtml(html),
    "text/html",
  );
  const lines: string[] = [];
  const walk = (node: Node): void => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = (child.textContent ?? "").replace(/\s+/g, " ").trim();
        if (text) {
          lines[lines.length - 1] = `${lines[lines.length - 1] ?? ""}${text}`;
        }
        return;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) return;
      const el = child as Element;
      const tag = el.tagName.toLowerCase();
      if (tag === "br") {
        lines.push("");
        return;
      }
      const isBlock = /^(p|div|li|ul|ol|h[1-6]|blockquote|tr)$/.test(tag);
      if (isBlock) lines.push(tag === "li" ? "• " : "");
      walk(child);
      if (isBlock) lines.push("");
    });
  };
  walk(doc.body);
  return lines
    .map((l) => l.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
