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

import {
  Box,
  Button,
  Chip,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@wso2/oxygen-ui";
import { Plus } from "@wso2/oxygen-ui-icons-react";
import { useMemo, useState, type JSX } from "react";
import {
  useResponseTemplates,
  type ResponseTemplate,
} from "@features/csm-cases/api/useResponseTemplates";
import {
  builtInTemplateCatalogue,
  type BuiltInTemplateSummary,
} from "@features/csm-cases/utils/commentTemplates";
import { STATE_LABEL } from "@features/csm-dashboard/utils/abtDashboard";
import type { CaseState } from "@features/csm-dashboard/types/abtDashboard";
import { usePortalAccess } from "@context/current-user/usePortalAccess";
import ResponseTemplateEditorDialog from "@features/csm-admin/components/ResponseTemplateEditorDialog";
import ResponseTemplateHistoryDialog from "@features/csm-admin/components/ResponseTemplateHistoryDialog";
import ResponseTemplatePreviewDialog from "@features/csm-admin/components/ResponseTemplatePreviewDialog";

/**
 * The stages a template can be offered in, in case-lifecycle order — the
 * spine of this page's grouping and the tabs across the top.
 *
 * `closed` and `reopened` are deliberately absent, matching the editor's own
 * list: a closed case has no composer to insert a template into, and
 * `reopened` is never a case's own state (see `CaseState`'s doc comment).
 */
const TEMPLATE_STAGES: readonly CaseState[] = [
  "open",
  "work_in_progress",
  "awaiting_info",
  "waiting_on_wso2",
  "solution_proposed",
];

/** One row of the library, from either source. */
interface LibraryRow {
  key: string;
  name: string;
  category: string;
  description: string;
  audience: "public" | "internal";
  /** Empty means "offered in every stage". */
  applicableStates: string[];
  content: string;
  /** Built-ins ship with the portal; custom ones a lead added. */
  source: "built-in" | "custom";
  /** Only a custom row has one — what Edit and History act on. */
  template?: ResponseTemplate;
}

function builtInRow(t: BuiltInTemplateSummary): LibraryRow {
  return {
    key: `built-in:${t.id}`,
    name: t.name,
    category: t.category,
    description: t.description,
    audience: t.audience,
    applicableStates: t.applicableStates,
    content: t.content,
    source: "built-in",
  };
}

function customRow(t: ResponseTemplate): LibraryRow {
  return {
    key: `custom:${t.id}`,
    name: t.name,
    category: t.category,
    description: t.description ?? "",
    audience: t.audience,
    applicableStates: t.applicableStates,
    content: t.content,
    source: "custom",
    template: t,
  };
}

/** Human-readable stage list; an empty list reads as "every stage". */
function stagesLabel(states: string[]): string {
  if (states.length === 0) return "Every stage";
  return states
    .map((s) => STATE_LABEL[s as CaseState] ?? s.replace(/_/g, " "))
    .join(", ");
}

/**
 * A row belongs to a stage when it names it, or when it names none at all —
 * an unrestricted template really is offered in the stage being viewed, so
 * hiding it from that stage's list would misreport what engineers see.
 */
function rowAppliesTo(row: LibraryRow, stage: CaseState): boolean {
  return row.applicableStates.length === 0 || row.applicableStates.includes(stage);
}

/**
 * The shared response-template library: everything an engineer can be offered
 * while replying to a case, across every stage of the case lifecycle, on one
 * page.
 *
 * Both sources are listed together — the templates the portal ships (read-only:
 * they are code, so there is nothing to edit or retire) and the ones leads have
 * added — because the question this page answers is "what does the team get
 * offered on an awaiting-info case?", and an answer covering only half the
 * library would be wrong. Rows are grouped by stage rather than filtered to
 * one, so the whole lifecycle is visible without clicking through it; a
 * template offered in several stages appears under each, which is exactly how
 * engineers meet it.
 *
 * Retired custom templates stay listed (greyed, restorable from the editor)
 * rather than hidden: there is no delete, so a lead needs to see what already
 * exists before writing a near-duplicate of something retired months ago.
 *
 * Creating and editing are `admin`/`timecard_approver` only (see
 * `canManageResponseTemplates`). Everyone else who can reach Settings gets the
 * same listing read-only — useful in itself, and consistent with the backend,
 * which serves the library at `PermView` and gates only the writes.
 */
export default function CsmResponseTemplatesPage(): JSX.Element {
  // includeInactive: this is the management view, the one place retired
  // templates are meant to be visible.
  const { data: templates, isLoading, isError } = useResponseTemplates({
    includeInactive: true,
  });
  const { canManageResponseTemplates } = usePortalAccess();
  const [editing, setEditing] = useState<ResponseTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  const [historyFor, setHistoryFor] = useState<ResponseTemplate | null>(null);
  const [previewing, setPreviewing] = useState<LibraryRow | null>(null);

  const rows = useMemo(
    () => [
      ...builtInTemplateCatalogue().map(builtInRow),
      ...(templates ?? []).map(customRow),
    ],
    [templates],
  );

  // Every stage gets a section, including one with nothing in it: a lead
  // looking for the gap in coverage is a reason this page exists.
  const sections = useMemo(
    () =>
      TEMPLATE_STAGES.map((stage) => ({
        stage,
        rows: rows.filter((row) => rowAppliesTo(row, stage)),
      })),
    [rows],
  );

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 2,
          flexWrap: "wrap",
        }}
      >
        <Box>
          <Typography variant="h5">Response templates</Typography>
          <Typography variant="body2" color="text.secondary">
            Every canned reply engineers can insert and edit while replying to a
            case, listed by the stage it is offered in.
          </Typography>
        </Box>
        {canManageResponseTemplates && (
          <Button
            variant="contained"
            size="small"
            startIcon={<Plus size={16} />}
            onClick={() => setCreating(true)}
          >
            New template
          </Button>
        )}
      </Box>

      {isError && (
        <Typography variant="body2" color="error">
          Could not load the templates your team has added. The portal's
          built-in ones are listed below.
        </Typography>
      )}

      {!canManageResponseTemplates && (
        <Typography variant="body2" color="text.secondary">
          Adding and editing templates is limited to team leads and admins.
        </Typography>
      )}

      {isLoading && <Skeleton height={220} />}

      {!isLoading &&
        sections.map(({ stage, rows: stageRows }) => (
          <Box
            key={stage}
            data-testid={`stage-${stage}`}
            sx={{ display: "flex", flexDirection: "column", gap: 1 }}
          >
            <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
              <Typography variant="subtitle2">{STATE_LABEL[stage]}</Typography>
              <Typography variant="caption" color="text.secondary">
                {stageRows.length === 1
                  ? "1 template"
                  : `${stageRows.length} templates`}
              </Typography>
            </Box>

            <Box
              sx={{
                border: 1,
                borderColor: "divider",
                borderRadius: 1,
                overflow: "hidden",
              }}
            >
              <TableContainer>
                <Table
                  size="small"
                  sx={{ "& .MuiTableCell-root": { borderColor: "divider" } }}
                >
                  <TableHead>
                    <TableRow sx={{ bgcolor: "action.hover" }}>
                      <TableCell sx={{ maxWidth: 260 }}>Name</TableCell>
                      <TableCell>Category</TableCell>
                      <TableCell>Audience</TableCell>
                      <TableCell>Source</TableCell>
                      <TableCell sx={{ maxWidth: 240 }}>Offered in</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {stageRows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6}>
                          <Typography variant="body2" color="text.secondary">
                            No template is offered at this stage yet.
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )}

                    {stageRows.map((row) => (
                      <TableRow
                        key={row.key}
                        sx={{
                          opacity:
                            row.template && !row.template.isActive ? 0.55 : 1,
                        }}
                      >
                        <TableCell sx={{ maxWidth: 260 }}>
                          <Typography variant="body2">{row.name}</Typography>
                          {row.description && (
                            <Typography variant="caption" color="text.secondary">
                              {row.description}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>{row.category}</TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            variant="outlined"
                            label={
                              row.audience === "internal"
                                ? "Internal"
                                : "Customer"
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            variant="outlined"
                            label={
                              row.source === "built-in" ? "Built-in" : "Custom"
                            }
                          />
                        </TableCell>
                        <TableCell sx={{ maxWidth: 240 }}>
                          <Typography variant="caption">
                            {stagesLabel(row.applicableStates)}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Box
                            sx={{
                              display: "flex",
                              gap: 0.5,
                              justifyContent: "flex-end",
                              alignItems: "center",
                            }}
                          >
                            {row.template && !row.template.isActive && (
                              <Chip
                                size="small"
                                label="Retired"
                                variant="outlined"
                              />
                            )}
                            {row.template && (
                              <Typography variant="caption" color="text.secondary">
                                v{row.template.version}
                              </Typography>
                            )}
                            <Button
                              size="small"
                              onClick={() => setPreviewing(row)}
                            >
                              Preview
                            </Button>
                            {row.template && canManageResponseTemplates && (
                              <>
                                <Button
                                  size="small"
                                  onClick={() => setHistoryFor(row.template!)}
                                >
                                  History
                                </Button>
                                <Button
                                  size="small"
                                  onClick={() => setEditing(row.template!)}
                                >
                                  Edit
                                </Button>
                              </>
                            )}
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          </Box>
        ))}

      {(creating || editing) && (
        <ResponseTemplateEditorDialog
          template={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}

      {historyFor && (
        <ResponseTemplateHistoryDialog
          template={historyFor}
          onClose={() => setHistoryFor(null)}
        />
      )}

      {previewing && (
        <ResponseTemplatePreviewDialog
          name={previewing.name}
          contentHtml={previewing.content}
          isBuiltIn={previewing.source === "built-in"}
          onClose={() => setPreviewing(null)}
        />
      )}
    </Box>
  );
}
