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

package handler

import (
	"context"
	"log/slog"
	"net/http"

	"github.com/wso2-open-operations/cs-tools/apps/csm-portal/backend/internal/middleware"
)

// entityResponseTemplateClient is the subset of entity-service calls this
// handler forwards to.
type entityResponseTemplateClient interface {
	SearchResponseTemplates(ctx context.Context, body []byte) ([]byte, error)
	CreateResponseTemplate(ctx context.Context, body []byte) ([]byte, error)
	UpdateResponseTemplate(ctx context.Context, id string, body []byte) ([]byte, error)
	GetResponseTemplate(ctx context.Context, id string) ([]byte, error)
	ListResponseTemplateVersions(ctx context.Context, id string) ([]byte, error)
}

// ResponseTemplateHandler exposes the canned comment bodies engineers insert
// while composing a case comment, and the management operations a lead uses
// to maintain them.
//
// Authorisation is not decided here: each route is registered with the
// permission it needs (PermView to read, PermManageResponseTemplates to
// create, edit or retire), so this handler only forwards. See
// `route(...)` in cmd/server/main.go.
type ResponseTemplateHandler struct {
	entity entityResponseTemplateClient
}

// NewResponseTemplateHandler creates a ResponseTemplateHandler.
func NewResponseTemplateHandler(entity entityResponseTemplateClient) *ResponseTemplateHandler {
	return &ResponseTemplateHandler{entity: entity}
}

// requireUser resolves the caller, whose id is only used for logging — the
// route's own permission already decided whether they may be here.
func requireUser(w http.ResponseWriter, r *http.Request) (*middleware.UserInfo, bool) {
	user := middleware.UserInfoFromContext(r.Context())
	if user == nil {
		writeError(w, http.StatusUnauthorized, ErrMsgUnauthorized)
		return nil, false
	}
	return user, true
}

// SearchResponseTemplates handles POST /response-templates/search.
func (h *ResponseTemplateHandler) SearchResponseTemplates(w http.ResponseWriter, r *http.Request) {
	user, ok := requireUser(w, r)
	if !ok {
		return
	}
	body, ok := readJSONBody(w, r)
	if !ok {
		return
	}
	result, err := h.entity.SearchResponseTemplates(r.Context(), body)
	if err != nil {
		slog.ErrorContext(r.Context(), "entity SearchResponseTemplates failed", "userID", user.UserID, "err", err)
		mapUpstreamErrorGeneric(w, err, "Failed to load response templates.")
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// GetResponseTemplate handles GET /response-templates/{id}.
func (h *ResponseTemplateHandler) GetResponseTemplate(w http.ResponseWriter, r *http.Request) {
	user, ok := requireUser(w, r)
	if !ok {
		return
	}
	id := r.PathValue("id")
	if !uuidRe.MatchString(id) {
		writeError(w, http.StatusBadRequest, ErrMsgInvalidUUID)
		return
	}
	result, err := h.entity.GetResponseTemplate(r.Context(), id)
	if err != nil {
		slog.ErrorContext(r.Context(), "entity GetResponseTemplate failed", "userID", user.UserID, "err", err)
		mapUpstreamErrorGeneric(w, err, "Failed to load the response template.")
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// CreateResponseTemplate handles POST /response-templates.
func (h *ResponseTemplateHandler) CreateResponseTemplate(w http.ResponseWriter, r *http.Request) {
	user, ok := requireUser(w, r)
	if !ok {
		return
	}
	body, ok := readJSONBody(w, r)
	if !ok {
		return
	}
	result, err := h.entity.CreateResponseTemplate(r.Context(), body)
	if err != nil {
		slog.ErrorContext(r.Context(), "entity CreateResponseTemplate failed", "userID", user.UserID, "err", err)
		mapUpstreamErrorGeneric(w, err, "Failed to create the response template.")
		return
	}
	writeJSON(w, http.StatusCreated, result)
}

// UpdateResponseTemplate handles PATCH /response-templates/{id}. Retiring a
// template is an update setting isActive false; there is no delete route,
// mirroring the entity service's own contract.
func (h *ResponseTemplateHandler) UpdateResponseTemplate(w http.ResponseWriter, r *http.Request) {
	user, ok := requireUser(w, r)
	if !ok {
		return
	}
	id := r.PathValue("id")
	if !uuidRe.MatchString(id) {
		writeError(w, http.StatusBadRequest, ErrMsgInvalidUUID)
		return
	}
	body, ok := readJSONBody(w, r)
	if !ok {
		return
	}
	result, err := h.entity.UpdateResponseTemplate(r.Context(), id, body)
	if err != nil {
		slog.ErrorContext(r.Context(), "entity UpdateResponseTemplate failed", "userID", user.UserID, "err", err)
		mapUpstreamErrorGeneric(w, err, "Failed to update the response template.")
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// ListResponseTemplateVersions handles GET /response-templates/{id}/versions.
// Registered under the manage permission: the history names who changed what
// and when, which is management detail rather than something an engineer
// composing a reply needs.
func (h *ResponseTemplateHandler) ListResponseTemplateVersions(w http.ResponseWriter, r *http.Request) {
	user, ok := requireUser(w, r)
	if !ok {
		return
	}
	id := r.PathValue("id")
	if !uuidRe.MatchString(id) {
		writeError(w, http.StatusBadRequest, ErrMsgInvalidUUID)
		return
	}
	result, err := h.entity.ListResponseTemplateVersions(r.Context(), id)
	if err != nil {
		slog.ErrorContext(r.Context(), "entity ListResponseTemplateVersions failed", "userID", user.UserID, "err", err)
		mapUpstreamErrorGeneric(w, err, "Failed to load the template history.")
		return
	}
	writeJSON(w, http.StatusOK, result)
}
