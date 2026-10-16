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
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Switch,
  TextField,
  Typography,
} from "@wso2/oxygen-ui";
import { useState, type JSX } from "react";
import { STATE_LABEL } from "@features/csm-dashboard/utils/abtDashboard";
import type { CaseState } from "@features/csm-dashboard/types/abtDashboard";
import {
  useCreateResponseTemplate,
  useUpdateResponseTemplate,
  type ResponseTemplate,
} from "@features/csm-cases/api/useResponseTemplates";

/**
 * Case states a template can be narrowed to. Mirrors the portal's own case
 * lifecycle; an empty selection means the template is offered in every state.
 *
 * `closed` and `reopened` are deliberately left out — a closed case has no
 * composer to insert a template into, and `reopened` is never a case's own
 * state (only ever a `nextStates` transition marker, see `CaseState`). Keep
 * this list in step with `TEMPLATE_STAGES` in `CsmResponseTemplatesPage`,
 * which groups the library by the same set.
 */
const CASE_STATES: readonly CaseState[] = [
  "open",
  "work_in_progress",
  "awaiting_info",
  "waiting_on_wso2",
  "solution_proposed",
];

interface ResponseTemplateEditorDialogProps {
  /** The template being edited, or null to create a new one. */
  template: ResponseTemplate | null;
  onClose: () => void;
}

/**
 * Create or edit a response template.
 *
 * Retiring is offered here as an "Active" switch rather than a delete action:
 * an engineer's past replies were written from earlier versions of this
 * template, so it has to stay resolvable. Turning it off simply stops it being
 * offered in the composer.
 */
export default function ResponseTemplateEditorDialog({
  template,
  onClose,
}: ResponseTemplateEditorDialogProps): JSX.Element {
  const isEdit = !!template;
  const [name, setName] = useState(template?.name ?? "");
  const [category, setCategory] = useState(template?.category ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [content, setContent] = useState(template?.content ?? "");
  const [audience, setAudience] = useState<"public" | "internal">(
    template?.audience ?? "public",
  );
  const [states, setStates] = useState<string[]>(
    template?.applicableStates ?? [],
  );
  const [isActive, setIsActive] = useState(template?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);

  const create = useCreateResponseTemplate();
  const update = useUpdateResponseTemplate();
  const saving = create.isPending || update.isPending;

  const canSave = name.trim() && category.trim() && content.trim();

  const submit = async (): Promise<void> => {
    if (!canSave) return;
    setError(null);
    const payload = {
      name: name.trim(),
      category: category.trim(),
      description: description.trim(),
      content: content.trim(),
      audience,
      applicableStates: states,
    };
    try {
      if (isEdit && template) {
        await update.mutateAsync({ id: template.id, ...payload, isActive });
      } else {
        await create.mutateAsync(payload);
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the template.");
    }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{isEdit ? "Edit template" : "New template"}</DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 0.5 }}>
          <TextField
            label="Name"
            size="small"
            fullWidth
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={saving}
          />
          <TextField
            label="Category"
            size="small"
            fullWidth
            required
            helperText="Groups related templates in the engineer's picker, e.g. Acknowledgement."
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            disabled={saving}
          />
          <TextField
            label="Description"
            size="small"
            fullWidth
            helperText="One line on when to reach for it."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={saving}
          />
          <TextField
            select
            label="Audience"
            size="small"
            fullWidth
            value={audience}
            onChange={(e) =>
              setAudience(e.target.value === "internal" ? "internal" : "public")
            }
            disabled={saving}
            helperText="Customer-facing templates are only offered to the case's own assignee."
          >
            <MenuItem value="public">Customer-visible reply</MenuItem>
            <MenuItem value="internal">Internal work note</MenuItem>
          </TextField>
          <TextField
            select
            label="Applies to states"
            size="small"
            fullWidth
            value={states}
            onChange={(e) =>
              setStates(
                typeof e.target.value === "string"
                  ? e.target.value.split(",").filter(Boolean)
                  : (e.target.value as unknown as string[]),
              )
            }
            SelectProps={{ multiple: true }}
            helperText="Leave empty to offer this template in every state."
            disabled={saving}
          >
            {CASE_STATES.map((s) => (
              <MenuItem key={s} value={s}>
                {STATE_LABEL[s]}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Content"
            size="small"
            fullWidth
            required
            multiline
            minRows={8}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={saving}
            helperText="Rich-text HTML, e.g. <p>Hi,</p><p>We have received this issue.</p>"
            inputProps={{
              style: {
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                fontSize: "0.825rem",
              },
              spellCheck: false,
            }}
          />

          {isEdit && (
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  disabled={saving}
                />
              }
              label="Active — offered to engineers in the comment composer"
            />
          )}

          {isEdit && (
            <Typography variant="caption" color="text.secondary">
              Saving publishes a new version. Earlier versions stay readable in
              this template's history.
            </Typography>
          )}

          {error && (
            <Typography variant="caption" color="error">
              {error}
            </Typography>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={() => void submit()}
          disabled={!canSave || saving}
          loading={saving}
        >
          {isEdit ? "Save new version" : "Create"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
