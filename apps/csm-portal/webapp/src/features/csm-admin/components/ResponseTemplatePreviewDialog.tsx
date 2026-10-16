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
  Typography,
} from "@wso2/oxygen-ui";
import type { JSX } from "react";
import { sanitizeRichTextHtml } from "@utils/sanitizeHtml";

interface ResponseTemplatePreviewDialogProps {
  name: string;
  contentHtml: string;
  /** Built-ins are code, so the preview says so instead of offering an edit. */
  isBuiltIn: boolean;
  onClose: () => void;
}

/**
 * Shows a template's wording as an engineer will meet it in the composer.
 *
 * Read-only for both sources. For a built-in this is the only way to see the
 * wording at all (there is no editor for one); for a custom template it answers
 * "what does this actually say?" without opening the editor and risking an
 * accidental new version.
 *
 * A built-in's `{customer}`/`{engineer}` placeholders are shown literally —
 * on a real case they are filled from the case's own reporter and assignee.
 */
export default function ResponseTemplatePreviewDialog({
  name,
  contentHtml,
  isBuiltIn,
  onClose,
}: ResponseTemplatePreviewDialogProps): JSX.Element {
  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{name}</DialogTitle>
      <DialogContent dividers>
        {isBuiltIn && (
          <Typography variant="caption" color="text.secondary">
            Built in to the portal. {"{customer}"} and {"{engineer}"} are filled
            from the case when an engineer inserts it.
          </Typography>
        )}
        <Box
          data-testid="template-preview-body"
          sx={{
            mt: isBuiltIn ? 1 : 0,
            "& p": { my: 0.5 },
            "& ul": { my: 0.5, pl: 2.5 },
            fontSize: "0.875rem",
          }}
          // Sanitized the same way the comment it produces is rendered on the
          // case itself, so the preview cannot show more than the real thing.
          dangerouslySetInnerHTML={{ __html: sanitizeRichTextHtml(contentHtml) }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
