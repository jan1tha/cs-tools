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
  InputAdornment,
  List,
  ListItemButton,
  TextField,
  Typography,
} from "@wso2/oxygen-ui";
import { Lock, Search, Send } from "@wso2/oxygen-ui-icons-react";
import { useMemo, useState, type JSX } from "react";
import Editor from "@components/rich-text-editor/Editor";
import { stripHtmlTags } from "@utils/sanitizeHtml";
import type { ResolvedCommentTemplate } from "@features/csm-cases/utils/commentTemplates";

/** Where a template's message will actually be posted, once sent. */
export type TemplatedReplyDestination = "public" | "internal" | "blocked";

interface TemplatedReplyDialogProps {
  templates: ResolvedCommentTemplate[];
  /**
   * Whether a customer-visible message can be posted on this case right now,
   * by any route (the plain comment endpoint when the case is in progress and
   * assigned to this engineer, or the update-request endpoint when it is
   * waiting on the customer). The parent owns that decision — see
   * CsmCaseDetailPage's own `onSendTemplatedReply`.
   */
  canPostPublic: boolean;
  /** Why a customer-visible message can't be posted, shown when it can't. */
  publicBlockedReason?: string | null;
  isSending: boolean;
  onClose: () => void;
  /** Posts the edited body. The parent picks the endpoint. */
  onSend: (bodyHtml: string, audience: "public" | "internal") => Promise<void>;
}

/** All distinct categories present, in first-seen order, for the filter row. */
function categoriesOf(templates: ResolvedCommentTemplate[]): string[] {
  return [...new Set(templates.map((t) => t.category))];
}

/**
 * Pick a canned message, edit it in place, and post it — one surface, ending
 * in a real send.
 *
 * Deliberately not an "insert into the composer" flow: a templated reply is
 * its own small task (choose the right wording, adjust the details, send),
 * and routing it through the composer both buried the templates inside an
 * editor toolbar and inherited the composer's own restriction that a
 * customer-visible reply needs the case in progress under the signed-in
 * engineer. Sending from here goes through whichever route the case actually
 * allows, which is how a customer-visible templated message reaches a case
 * that is waiting on the customer.
 */
export default function TemplatedReplyDialog({
  templates,
  canPostPublic,
  publicBlockedReason,
  isSending,
  onClose,
  onSend,
}: TemplatedReplyDialogProps): JSX.Element {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The edited body. Seeded from the template on selection; from then on it is
  // the engineer's own text, so re-selecting the same template is what resets
  // it, never a re-render.
  const [body, setBody] = useState("");
  const [editorMountKey, setEditorMountKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const categories = useMemo(() => categoriesOf(templates), [templates]);

  // Search covers the body text too: an engineer looking for "logs" is
  // thinking of what the message says, not what it is called.
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return templates.filter((t) => {
      if (category && t.category !== category) return false;
      if (!q) return true;
      return (
        t.label.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        stripHtmlTags(t.bodyHtml).toLowerCase().includes(q)
      );
    });
  }, [templates, search, category]);

  const selected = visible.find((t) => t.id === selectedId) ?? null;

  const select = (t: ResolvedCommentTemplate): void => {
    setSelectedId(t.id);
    setBody(t.bodyHtml);
    // The rich editor seeds itself from `value` once per mount, so swapping
    // templates needs a remount to actually show the new wording.
    setEditorMountKey((k) => k + 1);
    setError(null);
  };

  const isEmpty = body.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim() === "";
  const blockedForPublic = selected?.audience === "public" && !canPostPublic;
  const canSend = !!selected && !isEmpty && !blockedForPublic && !isSending;

  const send = async (): Promise<void> => {
    if (!selected || !canSend) return;
    setError(null);
    try {
      await onSend(body, selected.audience);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not post the message.");
    }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>Reply with a template</DialogTitle>
      <DialogContent dividers>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "minmax(0, 280px) 1fr" },
            gap: 2,
          }}
        >
          {/* Left: choose */}
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <TextField
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search templates…"
              size="small"
              fullWidth
              autoFocus
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search size={16} />
                  </InputAdornment>
                ),
              }}
            />

            {categories.length > 1 && (
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
                <Chip
                  label="All"
                  size="small"
                  variant={category === null ? "filled" : "outlined"}
                  onClick={() => setCategory(null)}
                />
                {categories.map((c) => (
                  <Chip
                    key={c}
                    label={c}
                    size="small"
                    variant={category === c ? "filled" : "outlined"}
                    onClick={() => setCategory(c)}
                  />
                ))}
              </Box>
            )}

            {visible.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                No template matches “{search}”.
              </Typography>
            ) : (
              <List
                dense
                disablePadding
                sx={{
                  border: 1,
                  borderColor: "divider",
                  borderRadius: 1,
                  maxHeight: 360,
                  overflowY: "auto",
                }}
              >
                {visible.map((t) => (
                  <ListItemButton
                    key={t.id}
                    selected={selected?.id === t.id}
                    onClick={() => select(t)}
                    sx={{ display: "block", py: 1 }}
                  >
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                      <Typography variant="body2">{t.label}</Typography>
                      {t.audience === "internal" && <Lock size={12} />}
                    </Box>
                    <Typography variant="caption" color="text.secondary">
                      {t.category}
                    </Typography>
                  </ListItemButton>
                ))}
              </List>
            )}
          </Box>

          {/* Right: edit, right here, then send */}
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {!selected ? (
              <Box
                sx={{
                  border: 1,
                  borderStyle: "dashed",
                  borderColor: "divider",
                  borderRadius: 1,
                  p: 4,
                  textAlign: "center",
                }}
              >
                <Typography variant="body2" color="text.secondary">
                  Pick a template on the left to edit and send it.
                </Typography>
              </Box>
            ) : (
              <>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    flexWrap: "wrap",
                  }}
                >
                  <Chip
                    size="small"
                    variant="outlined"
                    icon={selected.audience === "internal" ? <Lock size={12} /> : undefined}
                    label={
                      selected.audience === "internal"
                        ? "Internal work note"
                        : "Customer-visible"
                    }
                  />
                  <Typography variant="caption" color="text.secondary">
                    {selected.description}
                  </Typography>
                </Box>

                {blockedForPublic && (
                  <Alert severity="info">
                    {publicBlockedReason ??
                      "A customer-visible message can't be posted on this case right now."}
                  </Alert>
                )}

                {/* The real editor, not a preview — the engineer adjusts the
                    wording here and sends from this same dialog. */}
                <Editor
                  key={editorMountKey}
                  value={body}
                  onChange={setBody}
                  disabled={isSending}
                  placeholder="Edit the message before sending…"
                />

                {error && (
                  <Typography variant="caption" color="error">
                    {error}
                  </Typography>
                )}
              </>
            )}
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isSending}>
          Cancel
        </Button>
        <Button
          variant="contained"
          startIcon={<Send size={16} />}
          disabled={!canSend}
          loading={isSending}
          onClick={() => void send()}
        >
          {selected?.audience === "internal" ? "Post work note" : "Send to customer"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
