-- Copyright (c) 2026 WSO2 LLC. (https://www.wso2.com).
--
-- WSO2 LLC. licenses this file to you under the Apache License,
-- Version 2.0 (the "License"); you may not use this file except
-- in compliance with the License.
-- You may obtain a copy of the License at
--
-- http://www.apache.org/licenses/LICENSE-2.0
--
-- Unless required by applicable law or agreed to in writing,
-- software distributed under the License is distributed on an
-- "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
-- KIND, either express or implied.  See the License for the
-- specific language governing permissions and limitations
-- under the License.

-- Canned comment bodies a lead maintains for engineers to insert while
-- composing a case comment.
--
-- applicable_case_types / applicable_states are text arrays rather than enum
-- arrays: both vocabularies already exist as enums used by other columns, but
-- a template narrowed to a value that is later retired should degrade to "not
-- offered" rather than block that enum from ever changing. An empty array
-- means "applies to all", which is also the default.
--
-- is_active replaces deletion outright: a retired template must stay
-- resolvable, since versions of it are referenced by the history table below.
CREATE TABLE IF NOT EXISTS response_template (
    id UUID PRIMARY KEY,
    created_on TIMESTAMPTZ NOT NULL,
    updated_on TIMESTAMPTZ NOT NULL,
    created_by VARCHAR(255) NOT NULL,
    updated_by VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(255) NOT NULL,
    description VARCHAR(1000),
    content TEXT NOT NULL,
    audience VARCHAR(32) NOT NULL DEFAULT 'public',
    applicable_case_types TEXT[] NOT NULL DEFAULT '{}',
    applicable_states TEXT[] NOT NULL DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    -- Bumped on every content-bearing edit; engineers always read this row,
    -- which is by definition the latest version.
    version INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT response_template_audience_check CHECK (audience IN ('public', 'internal')),
    CONSTRAINT response_template_version_check CHECK (version >= 1)
);

CREATE INDEX IF NOT EXISTS idx_response_template_active ON response_template (is_active);
CREATE INDEX IF NOT EXISTS idx_response_template_category ON response_template (category);

-- Append-only history: one row per version ever published, so "who changed
-- what, and when" survives any number of later edits. The current version is
-- duplicated here too, so a template's full history reads from this table
-- alone without having to union the live row.
CREATE TABLE IF NOT EXISTS response_template_version (
    id UUID PRIMARY KEY,
    template_id UUID NOT NULL REFERENCES response_template(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(255) NOT NULL,
    description VARCHAR(1000),
    content TEXT NOT NULL,
    audience VARCHAR(32) NOT NULL,
    applicable_case_types TEXT[] NOT NULL DEFAULT '{}',
    applicable_states TEXT[] NOT NULL DEFAULT '{}',
    is_active BOOLEAN NOT NULL,
    changed_by VARCHAR(255) NOT NULL,
    changed_on TIMESTAMPTZ NOT NULL,
    CONSTRAINT response_template_version_unique UNIQUE (template_id, version)
);

CREATE INDEX IF NOT EXISTS idx_response_template_version_template
    ON response_template_version (template_id, version DESC);
