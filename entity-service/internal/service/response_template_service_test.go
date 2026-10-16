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

package service

import (
	"context"
	"testing"

	"github.com/wso2-open-operations/cs-tools/entity-service/internal/apierror"
	"github.com/wso2-open-operations/cs-tools/entity-service/internal/domain"
)

type stubResponseTemplateRepo struct {
	created     domain.CreateResponseTemplateRequest
	createActor string
	updated     domain.UpdateResponseTemplateRequest
	updateActor string
	getErr      error
}

func (s *stubResponseTemplateRepo) ListResponseTemplates(context.Context, domain.ListResponseTemplatesRequest) ([]domain.ResponseTemplate, error) {
	return []domain.ResponseTemplate{{ID: testDeploymentUUID, Name: "Acknowledge receipt"}}, nil
}
func (s *stubResponseTemplateRepo) GetResponseTemplate(context.Context, string) (domain.ResponseTemplate, error) {
	if s.getErr != nil {
		return domain.ResponseTemplate{}, s.getErr
	}
	return domain.ResponseTemplate{ID: testDeploymentUUID}, nil
}
func (s *stubResponseTemplateRepo) CreateResponseTemplate(_ context.Context, req domain.CreateResponseTemplateRequest, actor string) (domain.ResponseTemplate, error) {
	s.created, s.createActor = req, actor
	return domain.ResponseTemplate{ID: testDeploymentUUID, Name: req.Name, Version: 1}, nil
}
func (s *stubResponseTemplateRepo) UpdateResponseTemplate(_ context.Context, req domain.UpdateResponseTemplateRequest, actor string) (domain.ResponseTemplate, error) {
	s.updated, s.updateActor = req, actor
	return domain.ResponseTemplate{ID: req.ID, Version: 2}, nil
}
func (s *stubResponseTemplateRepo) ListResponseTemplateVersions(context.Context, string) ([]domain.ResponseTemplateVersion, error) {
	return []domain.ResponseTemplateVersion{{Version: 1}}, nil
}

func templateSvc(repo *stubResponseTemplateRepo) ResponseTemplateService {
	return NewResponseTemplateService(repo, stubUserRepo{})
}

func templateCtx(t *testing.T) context.Context {
	t.Helper()
	return contextWithUserIDToken(fakeJWTWithEmail(t, "lead@wso2.com"))
}

// The editor recorded against a template must come from the caller's own
// token -- an author taken from the request body would make the audit trail
// trivially forgeable.
func TestResponseTemplateService_RecordsCallerAsAuthor(t *testing.T) {
	repo := &stubResponseTemplateRepo{}
	_, err := templateSvc(repo).CreateResponseTemplate(templateCtx(t), domain.CreateResponseTemplateRequest{
		Name: "Acknowledge receipt", Category: "Acknowledgement", Content: "<p>Hi,</p>",
	})
	if err != nil {
		t.Fatalf("CreateResponseTemplate: %v", err)
	}
	if repo.createActor != "lead@wso2.com" {
		t.Fatalf("expected caller recorded as author, got %q", repo.createActor)
	}
	// Unset audience defaults to the customer-facing one.
	if repo.created.Audience != domain.ResponseTemplateAudiencePublic {
		t.Fatalf("expected public audience by default, got %q", repo.created.Audience)
	}
}

func TestResponseTemplateService_RejectsUnknownAudience(t *testing.T) {
	bogus := domain.ResponseTemplateAudience("everyone")
	_, err := templateSvc(&stubResponseTemplateRepo{}).CreateResponseTemplate(templateCtx(t),
		domain.CreateResponseTemplateRequest{
			Name: "x", Category: "y", Content: "<p>z</p>", Audience: bogus,
		})
	var ve *apierror.ValidationError
	if !asValidationError(err, &ve) {
		t.Fatalf("expected *apierror.ValidationError, got %T: %v", err, err)
	}
}

// An update setting nothing would still bump the version and append a history
// entry, which would read as an edit that changed nothing.
func TestResponseTemplateService_RejectsEmptyUpdate(t *testing.T) {
	_, err := templateSvc(&stubResponseTemplateRepo{}).UpdateResponseTemplate(templateCtx(t),
		domain.UpdateResponseTemplateRequest{ID: testDeploymentUUID})
	var ve *apierror.ValidationError
	if !asValidationError(err, &ve) {
		t.Fatalf("expected *apierror.ValidationError, got %T: %v", err, err)
	}
}

// Retiring is an update, not a delete -- the row and its history must survive.
func TestResponseTemplateService_DeactivateIsAnUpdate(t *testing.T) {
	repo := &stubResponseTemplateRepo{}
	inactive := false
	if _, err := templateSvc(repo).UpdateResponseTemplate(templateCtx(t),
		domain.UpdateResponseTemplateRequest{ID: testDeploymentUUID, IsActive: &inactive}); err != nil {
		t.Fatalf("UpdateResponseTemplate: %v", err)
	}
	if repo.updated.IsActive == nil || *repo.updated.IsActive {
		t.Fatalf("expected isActive=false to reach the repository, got %+v", repo.updated.IsActive)
	}
	if repo.updateActor != "lead@wso2.com" {
		t.Fatalf("expected caller recorded as editor, got %q", repo.updateActor)
	}
}

func TestResponseTemplateService_RejectsNonUUID(t *testing.T) {
	_, err := templateSvc(&stubResponseTemplateRepo{}).GetResponseTemplate(templateCtx(t), "not-a-uuid")
	var ve *apierror.ValidationError
	if !asValidationError(err, &ve) {
		t.Fatalf("expected *apierror.ValidationError, got %T: %v", err, err)
	}
}

// An unknown template's history must 404 rather than read as "never edited".
func TestResponseTemplateService_VersionsOfUnknownTemplateNotFound(t *testing.T) {
	repo := &stubResponseTemplateRepo{getErr: &apierror.NotFoundError{Msg: "response template not found"}}
	_, err := templateSvc(repo).ListResponseTemplateVersions(templateCtx(t), testDeploymentUUID)
	var nf *apierror.NotFoundError
	if !errorsAsNotFound(err, &nf) {
		t.Fatalf("expected *apierror.NotFoundError, got %T: %v", err, err)
	}
}
