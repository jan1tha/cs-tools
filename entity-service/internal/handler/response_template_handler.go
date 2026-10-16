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
	"encoding/json"
	"net/http"

	"github.com/wso2-open-operations/cs-tools/entity-service/internal/domain"
	"github.com/wso2-open-operations/cs-tools/entity-service/internal/service"
)

// ResponseTemplateHandler handles HTTP requests for the response-template
// resource.
type ResponseTemplateHandler struct {
	svc service.ResponseTemplateService
}

// NewResponseTemplateHandler constructs a ResponseTemplateHandler with the
// given service.
func NewResponseTemplateHandler(svc service.ResponseTemplateService) *ResponseTemplateHandler {
	return &ResponseTemplateHandler{svc: svc}
}

// SearchResponseTemplates handles POST /response-templates/search.
func (h *ResponseTemplateHandler) SearchResponseTemplates(w http.ResponseWriter, r *http.Request) {
	var req domain.ListResponseTemplatesRequest
	if !decodeRequest(w, r, &req) {
		return
	}
	resp, err := h.svc.ListResponseTemplates(r.Context(), req)
	if err != nil {
		writeServiceError(w, r, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}

// GetResponseTemplate handles GET /response-templates/{id}.
func (h *ResponseTemplateHandler) GetResponseTemplate(w http.ResponseWriter, r *http.Request) {
	resp, err := h.svc.GetResponseTemplate(r.Context(), r.PathValue("id"))
	if err != nil {
		writeServiceError(w, r, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}

// CreateResponseTemplate handles POST /response-templates.
func (h *ResponseTemplateHandler) CreateResponseTemplate(w http.ResponseWriter, r *http.Request) {
	var req domain.CreateResponseTemplateRequest
	if !decodeRequest(w, r, &req) {
		return
	}
	template, err := h.svc.CreateResponseTemplate(r.Context(), req)
	if err != nil {
		writeServiceError(w, r, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(domain.ResponseTemplateResponse{
		Message:  "Response template created successfully",
		Template: template,
	})
}

// UpdateResponseTemplate handles PATCH /response-templates/{id}.
func (h *ResponseTemplateHandler) UpdateResponseTemplate(w http.ResponseWriter, r *http.Request) {
	var req domain.UpdateResponseTemplateRequest
	if !decodeRequest(w, r, &req) {
		return
	}
	req.ID = r.PathValue("id")
	template, err := h.svc.UpdateResponseTemplate(r.Context(), req)
	if err != nil {
		writeServiceError(w, r, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(domain.ResponseTemplateResponse{
		Message:  "Response template updated successfully",
		Template: template,
	})
}

// ListResponseTemplateVersions handles GET /response-templates/{id}/versions.
func (h *ResponseTemplateHandler) ListResponseTemplateVersions(w http.ResponseWriter, r *http.Request) {
	versions, err := h.svc.ListResponseTemplateVersions(r.Context(), r.PathValue("id"))
	if err != nil {
		writeServiceError(w, r, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"versions": versions, "total": len(versions)})
}
