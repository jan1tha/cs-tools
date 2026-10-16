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

package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/wso2-open-operations/cs-tools/entity-service/internal/apierror"
	"github.com/wso2-open-operations/cs-tools/entity-service/internal/domain"
)

// ResponseTemplateRepository persists the canned comment bodies leads
// maintain for engineers.
type ResponseTemplateRepository interface {
	// ListResponseTemplates returns templates matching req, newest-updated
	// first. Inactive templates are excluded unless req.IncludeInactive.
	// A CaseType/State filter also matches a template that declares no
	// restriction on that axis, since an empty list means "applies to all".
	ListResponseTemplates(ctx context.Context, req domain.ListResponseTemplatesRequest) ([]domain.ResponseTemplate, error)
	// GetResponseTemplate returns one template regardless of active state.
	// Returns a NotFoundError when id does not exist.
	GetResponseTemplate(ctx context.Context, id string) (domain.ResponseTemplate, error)
	// CreateResponseTemplate stores a new template at version 1 and records
	// that first version in the history.
	CreateResponseTemplate(ctx context.Context, req domain.CreateResponseTemplateRequest, actorEmail string) (domain.ResponseTemplate, error)
	// UpdateResponseTemplate applies req's set fields, bumps the version and
	// appends the resulting revision to the history -- all in one
	// transaction, so a template's live row and its history can never
	// disagree. Returns a NotFoundError when id does not exist.
	UpdateResponseTemplate(ctx context.Context, req domain.UpdateResponseTemplateRequest, actorEmail string) (domain.ResponseTemplate, error)
	// ListResponseTemplateVersions returns the template's full revision
	// history, newest first.
	ListResponseTemplateVersions(ctx context.Context, id string) ([]domain.ResponseTemplateVersion, error)
}

type responseTemplateRepo struct {
	db *pgxpool.Pool
}

// NewResponseTemplateRepository constructs a Postgres-backed
// ResponseTemplateRepository.
func NewResponseTemplateRepository(db *pgxpool.Pool) ResponseTemplateRepository {
	return &responseTemplateRepo{db: db}
}

const responseTemplateColumns = `id::TEXT, name, category, COALESCE(description, ''), content, audience,
	applicable_case_types, applicable_states, is_active, version,
	created_on, created_by, updated_on, updated_by`

func scanResponseTemplate(row pgx.Row) (domain.ResponseTemplate, error) {
	var t domain.ResponseTemplate
	var audience string
	if err := row.Scan(
		&t.ID, &t.Name, &t.Category, &t.Description, &t.Content, &audience,
		&t.ApplicableCaseTypes, &t.ApplicableStates, &t.IsActive, &t.Version,
		&t.CreatedOn, &t.CreatedBy, &t.UpdatedOn, &t.UpdatedBy,
	); err != nil {
		return domain.ResponseTemplate{}, err
	}
	t.Audience = domain.ResponseTemplateAudience(audience)
	return t, nil
}

// ListResponseTemplates implements ResponseTemplateRepository.
func (r *responseTemplateRepo) ListResponseTemplates(ctx context.Context, req domain.ListResponseTemplatesRequest) ([]domain.ResponseTemplate, error) {
	// Each applicability filter also matches the unrestricted case
	// (cardinality zero) -- a template that names no states applies in every
	// state, rather than in none.
	query := `SELECT ` + responseTemplateColumns + ` FROM response_template
		WHERE ($1::BOOLEAN OR is_active)
		  AND ($2::TEXT = '' OR category = $2)
		  AND ($3::TEXT = '' OR CARDINALITY(applicable_case_types) = 0 OR $3 = ANY(applicable_case_types))
		  AND ($4::TEXT = '' OR CARDINALITY(applicable_states) = 0 OR $4 = ANY(applicable_states))
		ORDER BY updated_on DESC`

	rows, err := r.db.Query(ctx, query, req.IncludeInactive, req.Category, req.CaseType, req.State)
	if err != nil {
		return nil, fmt.Errorf("list response templates: %w", err)
	}
	defer rows.Close()

	templates := make([]domain.ResponseTemplate, 0)
	for rows.Next() {
		t, err := scanResponseTemplate(rows)
		if err != nil {
			return nil, fmt.Errorf("scan response template: %w", err)
		}
		templates = append(templates, t)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list response templates: %w", err)
	}
	return templates, nil
}

// GetResponseTemplate implements ResponseTemplateRepository.
func (r *responseTemplateRepo) GetResponseTemplate(ctx context.Context, id string) (domain.ResponseTemplate, error) {
	t, err := scanResponseTemplate(r.db.QueryRow(ctx,
		`SELECT `+responseTemplateColumns+` FROM response_template WHERE id = $1`, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.ResponseTemplate{}, &apierror.NotFoundError{Msg: "response template not found"}
	}
	if err != nil {
		return domain.ResponseTemplate{}, fmt.Errorf("get response template: %w", err)
	}
	return t, nil
}

// CreateResponseTemplate implements ResponseTemplateRepository.
func (r *responseTemplateRepo) CreateResponseTemplate(ctx context.Context, req domain.CreateResponseTemplateRequest, actorEmail string) (domain.ResponseTemplate, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return domain.ResponseTemplate{}, fmt.Errorf("create response template: begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	now := time.Now().UTC()
	caseTypes := nonNilStrings(req.ApplicableCaseTypes)
	states := nonNilStrings(req.ApplicableStates)

	t, err := scanResponseTemplate(tx.QueryRow(ctx,
		`INSERT INTO response_template
		    (id, created_on, updated_on, created_by, updated_by, name, category, description,
		     content, audience, applicable_case_types, applicable_states, is_active, version)
		 VALUES (gen_random_uuid(), $1, $1, $2, $2, $3, $4, $5, $6, $7, $8, $9, TRUE, 1)
		 RETURNING `+responseTemplateColumns,
		now, actorEmail, req.Name, req.Category, req.Description,
		req.Content, string(req.Audience), caseTypes, states,
	))
	if err != nil {
		return domain.ResponseTemplate{}, fmt.Errorf("create response template: %w", err)
	}

	if err := insertResponseTemplateVersion(ctx, tx, t, actorEmail); err != nil {
		return domain.ResponseTemplate{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return domain.ResponseTemplate{}, fmt.Errorf("create response template: commit tx: %w", err)
	}
	return t, nil
}

// UpdateResponseTemplate implements ResponseTemplateRepository.
func (r *responseTemplateRepo) UpdateResponseTemplate(ctx context.Context, req domain.UpdateResponseTemplateRequest, actorEmail string) (domain.ResponseTemplate, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return domain.ResponseTemplate{}, fmt.Errorf("update response template: begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// COALESCE against a typed null per field keeps this one statement
	// regardless of how many fields the caller set, and the version bump
	// happens in the same statement so it can't drift from the content.
	t, err := scanResponseTemplate(tx.QueryRow(ctx,
		`UPDATE response_template SET
		    name                  = COALESCE($2, name),
		    category              = COALESCE($3, category),
		    description           = COALESCE($4, description),
		    content               = COALESCE($5, content),
		    audience              = COALESCE($6, audience),
		    applicable_case_types = COALESCE($7, applicable_case_types),
		    applicable_states     = COALESCE($8, applicable_states),
		    is_active             = COALESCE($9, is_active),
		    version               = version + 1,
		    updated_on            = $10,
		    updated_by            = $11
		  WHERE id = $1
		  RETURNING `+responseTemplateColumns,
		req.ID, req.Name, req.Category, req.Description, req.Content,
		audienceArg(req.Audience), req.ApplicableCaseTypes, req.ApplicableStates,
		req.IsActive, time.Now().UTC(), actorEmail,
	))
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.ResponseTemplate{}, &apierror.NotFoundError{Msg: "response template not found"}
	}
	if err != nil {
		return domain.ResponseTemplate{}, fmt.Errorf("update response template: %w", err)
	}

	if err := insertResponseTemplateVersion(ctx, tx, t, actorEmail); err != nil {
		return domain.ResponseTemplate{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return domain.ResponseTemplate{}, fmt.Errorf("update response template: commit tx: %w", err)
	}
	return t, nil
}

// ListResponseTemplateVersions implements ResponseTemplateRepository.
func (r *responseTemplateRepo) ListResponseTemplateVersions(ctx context.Context, id string) ([]domain.ResponseTemplateVersion, error) {
	rows, err := r.db.Query(ctx,
		`SELECT version, name, category, COALESCE(description, ''), content, audience, is_active, changed_by, changed_on
		   FROM response_template_version WHERE template_id = $1 ORDER BY version DESC`, id)
	if err != nil {
		return nil, fmt.Errorf("list response template versions: %w", err)
	}
	defer rows.Close()

	versions := make([]domain.ResponseTemplateVersion, 0)
	for rows.Next() {
		var v domain.ResponseTemplateVersion
		var audience string
		if err := rows.Scan(&v.Version, &v.Name, &v.Category, &v.Description, &v.Content,
			&audience, &v.IsActive, &v.ChangedBy, &v.ChangedOn); err != nil {
			return nil, fmt.Errorf("scan response template version: %w", err)
		}
		v.Audience = domain.ResponseTemplateAudience(audience)
		versions = append(versions, v)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list response template versions: %w", err)
	}
	return versions, nil
}

// insertResponseTemplateVersion appends t's current revision to the history,
// inside the caller's transaction so the live row and its history commit
// together or not at all.
func insertResponseTemplateVersion(ctx context.Context, tx pgx.Tx, t domain.ResponseTemplate, actorEmail string) error {
	if _, err := tx.Exec(ctx,
		`INSERT INTO response_template_version
		    (id, template_id, version, name, category, description, content, audience,
		     applicable_case_types, applicable_states, is_active, changed_by, changed_on)
		 VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
		t.ID, t.Version, t.Name, t.Category, t.Description, t.Content,
		string(t.Audience), t.ApplicableCaseTypes, t.ApplicableStates, t.IsActive,
		actorEmail, t.UpdatedOn,
	); err != nil {
		return fmt.Errorf("record response template version: %w", err)
	}
	return nil
}

// nonNilStrings normalizes a nil slice to an empty one, so a template with no
// declared applicability stores '{}' (meaning "applies to all") rather than
// NULL, which the NOT NULL column would reject.
func nonNilStrings(v []string) []string {
	if v == nil {
		return []string{}
	}
	return v
}

// audienceArg converts the optional audience into something the driver can
// bind: a typed nil pointer would be sent as its underlying string type, so
// the nil case has to become an untyped nil for COALESCE to keep the
// existing value.
func audienceArg(a *domain.ResponseTemplateAudience) any {
	if a == nil {
		return nil
	}
	return string(*a)
}
