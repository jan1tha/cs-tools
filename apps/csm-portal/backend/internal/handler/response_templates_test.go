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
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/wso2-open-operations/cs-tools/apps/csm-portal/backend/internal/middleware"
)

// Who may reach these handlers is decided by the permission each route is
// registered with (PermView to read, PermManageResponseTemplates to maintain)
// and covered by the access-guard matrix in access_test.go. What is left for
// the handler itself is forwarding, path validation, and the caller check.
type mockResponseTemplateClient struct {
	createCalled bool
	updateCalled bool
	lastID       string
}

func (m *mockResponseTemplateClient) SearchResponseTemplates(context.Context, []byte) ([]byte, error) {
	return []byte(`{"templates":[],"total":0}`), nil
}
func (m *mockResponseTemplateClient) CreateResponseTemplate(context.Context, []byte) ([]byte, error) {
	m.createCalled = true
	return []byte(`{"message":"ok"}`), nil
}
func (m *mockResponseTemplateClient) UpdateResponseTemplate(_ context.Context, id string, _ []byte) ([]byte, error) {
	m.updateCalled = true
	m.lastID = id
	return []byte(`{"message":"ok"}`), nil
}
func (m *mockResponseTemplateClient) GetResponseTemplate(_ context.Context, id string) ([]byte, error) {
	m.lastID = id
	return []byte(`{"id":"x"}`), nil
}
func (m *mockResponseTemplateClient) ListResponseTemplateVersions(_ context.Context, id string) ([]byte, error) {
	m.lastID = id
	return []byte(`{"versions":[],"total":0}`), nil
}

const testTemplateID = "11111111-1111-1111-1111-111111111111"

func templateRequest(method, path, body string) *http.Request {
	var r *http.Request
	if body == "" {
		r = httptest.NewRequest(method, path, nil)
	} else {
		r = httptest.NewRequest(method, path, strings.NewReader(body))
	}
	r.SetPathValue("id", testTemplateID)
	return withUser(r)
}

func TestResponseTemplates_ForwardsSearch(t *testing.T) {
	h := NewResponseTemplateHandler(&mockResponseTemplateClient{})
	w := httptest.NewRecorder()
	h.SearchResponseTemplates(w, templateRequest(http.MethodPost, "/response-templates/search", `{}`))
	assertStatus(t, w, http.StatusOK)
}

func TestResponseTemplates_CreateReturns201(t *testing.T) {
	client := &mockResponseTemplateClient{}
	h := NewResponseTemplateHandler(client)
	w := httptest.NewRecorder()
	h.CreateResponseTemplate(w, templateRequest(http.MethodPost, "/response-templates", `{"name":"x"}`))
	assertStatus(t, w, http.StatusCreated)
	if !client.createCalled {
		t.Fatal("expected the create to reach the entity service")
	}
}

func TestResponseTemplates_UpdateForwardsTheID(t *testing.T) {
	client := &mockResponseTemplateClient{}
	h := NewResponseTemplateHandler(client)
	w := httptest.NewRecorder()
	h.UpdateResponseTemplate(w, templateRequest(http.MethodPatch, "/response-templates/"+testTemplateID, `{"isActive":false}`))
	assertStatus(t, w, http.StatusOK)
	if !client.updateCalled || client.lastID != testTemplateID {
		t.Fatalf("expected the update to forward %q, got %q", testTemplateID, client.lastID)
	}
}

// Fail fast on a malformed path rather than handing it to the entity service.
func TestResponseTemplates_RejectsNonUUID(t *testing.T) {
	client := &mockResponseTemplateClient{}
	h := NewResponseTemplateHandler(client)
	r := httptest.NewRequest(http.MethodGet, "/response-templates/not-a-uuid", nil)
	r.SetPathValue("id", "not-a-uuid")
	w := httptest.NewRecorder()
	h.GetResponseTemplate(w, withUser(r))
	assertStatus(t, w, http.StatusBadRequest)
	if client.lastID != "" {
		t.Fatal("a malformed id must never reach the entity service")
	}
}

func TestResponseTemplates_RequiresACaller(t *testing.T) {
	h := NewResponseTemplateHandler(&mockResponseTemplateClient{})
	w := httptest.NewRecorder()
	// No middleware.UserInfo in the context at all.
	r := httptest.NewRequest(http.MethodPost, "/response-templates/search", strings.NewReader(`{}`))
	h.SearchResponseTemplates(w, r)
	assertStatus(t, w, http.StatusUnauthorized)
}

var _ = middleware.UserInfo{}
