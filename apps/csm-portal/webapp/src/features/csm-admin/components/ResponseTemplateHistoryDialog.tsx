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
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Skeleton,
  Typography,
} from "@wso2/oxygen-ui";
import type { JSX } from "react";
import { sanitizeRichTextHtml } from "@utils/sanitizeHtml";
import {
  useResponseTemplateVersions,
  type ResponseTemplate,
} from "@features/csm-cases/api/useResponseTemplates";

interface ResponseTemplateHistoryDialogProps {
  template: ResponseTemplate;
  onClose: () => void;
}

/**
 * A template's revision history — every version ever published, newest first,
 * each with the editor and timestamp behind it.
 *
 * This is what makes retiring rather than deleting worth the trade: an
 * engineer's past reply was written from whichever version was current at the
 * time, so the wording of that version stays readable here.
 */
export default function ResponseTemplateHistoryDialog({
  template,
  onClose,
}: ResponseTemplateHistoryDialogProps): JSX.Element {
  const { data: versions, isLoading, isError } = useResponseTemplateVersions(
    template.id,
  );

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>History — {template.name}</DialogTitle>
      <DialogContent dividers>
        {isLoading && <Skeleton height={120} />}

        {isError && (
          <Typography variant="body2" color="error">
            Could not load this template's history.
          </Typography>
        )}

        {!isLoading && !isError && (versions ?? []).length === 0 && (
          <Typography variant="body2" color="text.secondary">
            No history recorded for this template.
          </Typography>
        )}

        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          {(versions ?? []).map((v) => (
            <Box
              key={v.version}
              sx={{
                border: 1,
                borderColor: "divider",
                borderRadius: 1,
                p: 1.5,
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  flexWrap: "wrap",
                  mb: 0.5,
                }}
              >
                <Chip size="small" label={`v${v.version}`} />
                <Typography variant="caption" color="text.secondary">
                  {new Date(v.changedOn).toLocaleString()} · {v.changedBy}
                </Typography>
                {!v.isActive && (
                  <Chip size="small" variant="outlined" label="Retired" />
                )}
              </Box>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                {v.name} · {v.category}
              </Typography>
              {/* The version's own wording, sanitized the same way the
                  comment it produced is rendered on the case. */}
              <Box
                data-testid={`template-version-${v.version}`}
                sx={{
                  "& p": { my: 0.5 },
                  "& ul": { my: 0.5, pl: 2.5 },
                  fontSize: "0.875rem",
                }}
                dangerouslySetInnerHTML={{
                  __html: sanitizeRichTextHtml(v.content),
                }}
              />
            </Box>
          ))}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
