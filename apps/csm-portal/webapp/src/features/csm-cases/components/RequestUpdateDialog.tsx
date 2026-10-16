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
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItemButton,
  ListSubheader,
  Skeleton,
  TextField,
  Typography,
} from "@wso2/oxygen-ui";
import { Send } from "@wso2/oxygen-ui-icons-react";
import { useMemo, useState, type JSX } from "react";
import { escapeHtml } from "@utils/sanitizeHtml";
import { useGetCaseUpdateRequestTemplates } from "@features/csm-cases/api/useRequestCaseUpdate";
import {
  REQUEST_UPDATE_STAGE_LABEL,
  type CaseUpdateRequestCategory,
} from "@features/csm-cases/utils/caseUpdateRequests";
import {
  templateHtmlToPlainText,
  type ResolvedCommentTemplate,
} from "@features/csm-cases/utils/commentTemplates";
import type { BeCaseUpdateRequestStage } from "@api/backend/types";

/** Payload this dialog produces on confirm — mirrors `RequestCaseUpdateInput` minus `caseId`. */
export interface RequestUpdateSavePayload {
  stage: BeCaseUpdateRequestStage;
  customContent?: string;
}

interface RequestUpdateDialogProps {
  /** Which fixed reminder-message set to offer — see `deriveCaseUpdateRequestCategory`. */
  category: CaseUpdateRequestCategory;
  /**
   * Response templates applicable to this case, offered alongside the three
   * fixed reminders. This dialog is the only way to send a customer-visible
   * message while the case is waiting on the customer — the comment composer
   * refuses one in those states — so the template library has to be reachable
   * from here.
   */
  templates?: ResolvedCommentTemplate[];
  /** True while the `POST /cases/{id}/request-update` call is in flight. */
  isSaving: boolean;
  onClose: () => void;
  onSave: (payload: RequestUpdateSavePayload) => void;
}

/** The three server-rendered reminders; "custom" is not one of them. */
type FixedStage = Exclude<BeCaseUpdateRequestStage, "custom">;

const FIXED_STAGES: FixedStage[] = ["first", "second", "final"];

/** One entry in the message list, whichever kind it came from. */
interface MessageChoice {
  key: string;
  label: string;
  group: string;
  /** Fixed-reminder stage, when this choice is one. */
  stage?: FixedStage;
  /** Source markup, when the choice has any — sent verbatim if left unedited. */
  sourceHtml?: string;
}

/**
 * "Request update": nudge the customer for a response, or send them another
 * canned message, while the case is waiting on them.
 *
 * Laid out like the templated-reply dialog — pick a message on the left, read
 * and adjust it on the right, send from the same place — so the two read as
 * one feature rather than two. The body is a plain description box rather than
 * a rich-text editor on purpose: these are short prose nudges, and an editor's
 * toolbar is more machinery than that needs.
 *
 * An untouched message posts its own markup verbatim — a fixed reminder goes
 * as its `stage`, so the backend renders the server-side copy, and a template
 * posts its authored HTML with its lists intact. Once edited, the engineer's
 * text is escaped and wrapped in paragraphs, so a literal "<" they type can
 * never reach the customer as markup.
 */
export default function RequestUpdateDialog({
  category,
  templates = [],
  isSaving,
  onClose,
  onSave,
}: RequestUpdateDialogProps): JSX.Element {
  const {
    data: fixedTemplates,
    isLoading,
    isError,
  } = useGetCaseUpdateRequestTemplates();

  const choices = useMemo((): MessageChoice[] => {
    const reminders: MessageChoice[] = FIXED_STAGES.map((stage) => ({
      key: `stage:${stage}`,
      label: REQUEST_UPDATE_STAGE_LABEL[stage],
      group: "Reminders",
      stage,
      sourceHtml: fixedTemplates?.[category]?.[stage],
    }));
    const library: MessageChoice[] = templates.map((t) => ({
      key: `template:${t.id}`,
      label: t.label,
      group: t.category || "Response templates",
      sourceHtml: t.bodyHtml,
    }));
    return [
      ...reminders,
      ...library,
      { key: "custom", label: "Custom message", group: "Other" },
    ];
  }, [fixedTemplates, category, templates]);

  const [selectedKey, setSelectedKey] = useState<string>("stage:first");
  const [message, setMessage] = useState("");
  // True while the box still holds exactly what the chosen message seeded it
  // with — which is what lets an unedited choice post its own markup.
  const [pristine, setPristine] = useState(true);

  const selected = choices.find((c) => c.key === selectedKey) ?? null;

  // Seeding happens on selection rather than in an effect: from that point the
  // box holds the engineer's own text, and a re-render must never overwrite
  // what they have typed.
  const select = (choice: MessageChoice): void => {
    setSelectedKey(choice.key);
    setMessage(choice.sourceHtml ? templateHtmlToPlainText(choice.sourceHtml) : "");
    setPristine(true);
  };

  // The first render has no server templates yet, so the default selection's
  // box fills in once they arrive -- but only while it is still untouched.
  const seededSelection = selected?.sourceHtml
    ? templateHtmlToPlainText(selected.sourceHtml)
    : "";
  if (pristine && message === "" && seededSelection !== "") {
    setMessage(seededSelection);
  }

  const trimmed = message.trim();
  const canSubmit = trimmed.length > 0 && !isSaving;
  const groups = [...new Set(choices.map((c) => c.group))];

  const handleSave = (): void => {
    if (!canSubmit || !selected) return;
    if (pristine && selected.stage) {
      onSave({ stage: selected.stage });
      return;
    }
    if (pristine && selected.sourceHtml) {
      onSave({ stage: "custom", customContent: selected.sourceHtml });
      return;
    }
    const html = trimmed
      .split(/\n+/)
      .filter((line) => line.trim().length > 0)
      .map((line) => `<p>${escapeHtml(line.trim())}</p>`)
      .join("");
    onSave({ stage: "custom", customContent: html });
  };

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Request update</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Post a customer-visible comment nudging the customer for a response.
          Pick a message, adjust it if you need to, and send.
        </Typography>

        {isError && (
          <Alert severity="error" sx={{ mb: 1.5 }}>
            Couldn't load the reminder messages. You can still send your own
            message, or close and try again.
          </Alert>
        )}

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "minmax(0, 240px) 1fr" },
            gap: 2,
          }}
        >
          <List
            dense
            disablePadding
            sx={{
              border: 1,
              borderColor: "divider",
              borderRadius: 1,
              maxHeight: 320,
              overflowY: "auto",
            }}
          >
            {groups.map((group) => (
              <Box key={group} component="li" sx={{ listStyle: "none" }}>
                <ListSubheader disableSticky sx={{ lineHeight: 2.2 }}>
                  {group}
                </ListSubheader>
                {choices
                  .filter((c) => c.group === group)
                  .map((c) => (
                    <ListItemButton
                      key={c.key}
                      selected={selectedKey === c.key}
                      disabled={isSaving}
                      onClick={() => select(c)}
                      sx={{ py: 0.75 }}
                    >
                      <Typography variant="body2">{c.label}</Typography>
                    </ListItemButton>
                  ))}
              </Box>
            ))}
          </List>

          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Chip size="small" variant="outlined" label="Customer-visible" />
              {!pristine && (
                <Typography variant="caption" color="text.secondary">
                  Edited
                </Typography>
              )}
            </Box>

            {isLoading && selected?.stage ? (
              <Skeleton variant="rounded" width="100%" height={200} />
            ) : (
              <TextField
                label="Message"
                placeholder="Write the message to post on this case…"
                multiline
                minRows={8}
                fullWidth
                size="small"
                value={message}
                onChange={(e) => {
                  setMessage(e.target.value);
                  setPristine(false);
                }}
                disabled={isSaving}
              />
            )}
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isSaving}>
          Close
        </Button>
        <Button
          variant="contained"
          startIcon={<Send size={16} />}
          disabled={!canSubmit}
          loading={isSaving}
          onClick={handleSave}
        >
          Send
        </Button>
      </DialogActions>
    </Dialog>
  );
}
