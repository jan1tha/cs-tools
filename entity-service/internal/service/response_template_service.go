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
	"strings"

	"github.com/wso2-open-operations/cs-tools/entity-service/internal/apierror"
	"github.com/wso2-open-operations/cs-tools/entity-service/internal/domain"
	"github.com/wso2-open-operations/cs-tools/entity-service/internal/repository"
)

// validResponseTemplateAudience guards the audience field, which the database
// also constrains -- rejecting here gives the caller a 400 naming the field
// instead of a 500 carrying a constraint violation.
var validResponseTemplateAudience = map[domain.ResponseTemplateAudience]bool{
	domain.ResponseTemplateAudiencePublic:   true,
	domain.ResponseTemplateAudienceInternal: true,
}

// maxResponseTemplateContentBytes bounds a template body. Generous next to any
// real canned reply, but a template is inserted into a comment whose own
// request body is capped, so an unbounded one could produce a comment that can
// never be posted.
const maxResponseTemplateContentBytes = 64 * 1024

type responseTemplateService struct {
	repo     repository.ResponseTemplateRepository
	userRepo repository.UserRepository
}

// NewResponseTemplateService constructs the Postgres-backed
// ResponseTemplateService.
func NewResponseTemplateService(repo repository.ResponseTemplateRepository, userRepo repository.UserRepository) ResponseTemplateService {
	return &responseTemplateService{repo: repo, userRepo: userRepo}
}

// ListResponseTemplates implements ResponseTemplateService.
func (s *responseTemplateService) ListResponseTemplates(ctx context.Context, req domain.ListResponseTemplatesRequest) (domain.ListResponseTemplatesResponse, error) {
	req.Category = strings.TrimSpace(req.Category)
	req.CaseType = strings.TrimSpace(req.CaseType)
	req.State = strings.TrimSpace(req.State)

	templates, err := s.repo.ListResponseTemplates(ctx, req)
	if err != nil {
		return domain.ListResponseTemplatesResponse{}, err
	}
	return domain.ListResponseTemplatesResponse{Templates: templates, Total: len(templates)}, nil
}

// GetResponseTemplate implements ResponseTemplateService.
func (s *responseTemplateService) GetResponseTemplate(ctx context.Context, id string) (domain.ResponseTemplate, error) {
	if err := validateUUIDs("id", []string{id}); err != nil {
		return domain.ResponseTemplate{}, err
	}
	return s.repo.GetResponseTemplate(ctx, id)
}

// CreateResponseTemplate implements ResponseTemplateService.
func (s *responseTemplateService) CreateResponseTemplate(ctx context.Context, req domain.CreateResponseTemplateRequest) (domain.ResponseTemplate, error) {
	req.Name = strings.TrimSpace(req.Name)
	req.Category = strings.TrimSpace(req.Category)
	req.Description = strings.TrimSpace(req.Description)
	req.Content = strings.TrimSpace(req.Content)
	if req.Audience == "" {
		req.Audience = domain.ResponseTemplateAudiencePublic
	}
	if err := validateResponseTemplateFields(req.Name, req.Category, req.Content, &req.Audience); err != nil {
		return domain.ResponseTemplate{}, err
	}

	actor, err := s.resolveTemplateActor(ctx)
	if err != nil {
		return domain.ResponseTemplate{}, err
	}
	return s.repo.CreateResponseTemplate(ctx, req, actor)
}

// UpdateResponseTemplate implements ResponseTemplateService.
func (s *responseTemplateService) UpdateResponseTemplate(ctx context.Context, req domain.UpdateResponseTemplateRequest) (domain.ResponseTemplate, error) {
	if err := validateUUIDs("id", []string{req.ID}); err != nil {
		return domain.ResponseTemplate{}, err
	}
	trimInPlace(req.Name)
	trimInPlace(req.Category)
	trimInPlace(req.Description)
	trimInPlace(req.Content)

	// An update that sets nothing would still bump the version and append a
	// history entry, which would read as an edit that changed nothing.
	if req.Name == nil && req.Category == nil && req.Description == nil &&
		req.Content == nil && req.Audience == nil && req.ApplicableCaseTypes == nil &&
		req.ApplicableStates == nil && req.IsActive == nil {
		return domain.ResponseTemplate{}, &apierror.ValidationError{Msg: "at least one field must be provided"}
	}
	if err := validateResponseTemplateFields(
		derefOrEmpty(req.Name), derefOrEmpty(req.Category), derefOrEmpty(req.Content), req.Audience,
	); err != nil {
		return domain.ResponseTemplate{}, err
	}

	actor, err := s.resolveTemplateActor(ctx)
	if err != nil {
		return domain.ResponseTemplate{}, err
	}
	return s.repo.UpdateResponseTemplate(ctx, req, actor)
}

// ListResponseTemplateVersions implements ResponseTemplateService.
func (s *responseTemplateService) ListResponseTemplateVersions(ctx context.Context, id string) ([]domain.ResponseTemplateVersion, error) {
	if err := validateUUIDs("id", []string{id}); err != nil {
		return nil, err
	}
	// Surfaces a NotFoundError for an unknown id, rather than an empty
	// history that reads as "this template has never been edited".
	if _, err := s.repo.GetResponseTemplate(ctx, id); err != nil {
		return nil, err
	}
	return s.repo.ListResponseTemplateVersions(ctx, id)
}

// resolveTemplateActor returns the caller's email, recorded as the editor on
// every create and update -- RESP-002's audit requirement is only met if the
// identity comes from the caller's own token, never from the request body.
func (s *responseTemplateService) resolveTemplateActor(ctx context.Context) (string, error) {
	email, err := resolveCallerEmail(ctx)
	if err != nil {
		return "", err
	}
	return email, nil
}

// validateResponseTemplateFields applies the rules shared by create and
// update. Empty name/category/content are only rejected when the caller
// actually supplied them: an update omitting a field keeps its current value.
func validateResponseTemplateFields(name, category, content string, audience *domain.ResponseTemplateAudience) error {
	if name == "" && category == "" && content == "" && audience == nil {
		return nil
	}
	if name != "" && len(name) > 255 {
		return &apierror.ValidationError{Msg: "name must be 255 characters or fewer"}
	}
	if category != "" && len(category) > 255 {
		return &apierror.ValidationError{Msg: "category must be 255 characters or fewer"}
	}
	if len(content) > maxResponseTemplateContentBytes {
		return &apierror.ValidationError{Msg: "content is too large"}
	}
	if audience != nil && !validResponseTemplateAudience[*audience] {
		return &apierror.ValidationError{Msg: "audience contains invalid value: " + string(*audience)}
	}
	return nil
}

// trimInPlace trims an optional string field, leaving an unset one unset.
func trimInPlace(v *string) {
	if v != nil {
		*v = strings.TrimSpace(*v)
	}
}

// derefOrEmpty reads an optional string as "" when unset, so one validation
// helper serves both create (always set) and update (any subset set).
func derefOrEmpty(v *string) string {
	if v == nil {
		return ""
	}
	return *v
}
