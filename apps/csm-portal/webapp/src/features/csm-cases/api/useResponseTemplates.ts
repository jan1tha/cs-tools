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
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { useBackendApi } from "@api/backend/client";
import { ApiQueryKeys } from "@constants/apiConstants";

/** A lead-maintained template as the backend stores it. */
export interface ResponseTemplate {
  id: string;
  name: string;
  category: string;
  description?: string;
  content: string;
  audience: "public" | "internal";
  /** Empty means the template applies to every case type. */
  applicableCaseTypes: string[];
  /** Empty means the template applies in every case state. */
  applicableStates: string[];
  isActive: boolean;
  version: number;
  createdOn: string;
  createdBy: string;
  updatedOn: string;
  updatedBy: string;
}

/** One revision in a template's history. */
export interface ResponseTemplateVersion {
  version: number;
  name: string;
  category: string;
  description?: string;
  content: string;
  audience: "public" | "internal";
  isActive: boolean;
  changedBy: string;
  changedOn: string;
}

interface ListResponse {
  templates: ResponseTemplate[];
  total: number;
}

export interface ResponseTemplateFilters {
  /** Management view only — the composer never asks for retired templates. */
  includeInactive?: boolean;
  category?: string;
  caseType?: string;
  state?: string;
}

export interface CreateResponseTemplateInput {
  name: string;
  category: string;
  description?: string;
  content: string;
  audience: "public" | "internal";
  applicableCaseTypes?: string[];
  applicableStates?: string[];
}

export type UpdateResponseTemplateInput = Partial<CreateResponseTemplateInput> & {
  id: string;
  isActive?: boolean;
};

/**
 * Lead-maintained templates matching the given filters.
 *
 * A failure resolves to an empty list rather than surfacing: the composer
 * still has its built-in templates, and an engineer mid-reply should not be
 * shown an error banner because the shared library happened to be
 * unreachable.
 */
export function useResponseTemplates(
  filters: ResponseTemplateFilters = {},
  options: { enabled?: boolean } = {},
): UseQueryResult<ResponseTemplate[], Error> {
  const api = useBackendApi();
  return useQuery({
    queryKey: [ApiQueryKeys.CSM_RESPONSE_TEMPLATES, filters],
    enabled: options.enabled ?? true,
    queryFn: async (): Promise<ResponseTemplate[]> => {
      const response = await api.post<ResponseTemplateFilters, ListResponse>(
        "/response-templates/search",
        {
          includeInactive: filters.includeInactive ?? false,
          category: filters.category ?? "",
          caseType: filters.caseType ?? "",
          state: filters.state ?? "",
        },
      );
      return response?.templates ?? [];
    },
  });
}

/** A template's revision history — who changed what, and when. */
export function useResponseTemplateVersions(
  id: string | undefined,
): UseQueryResult<ResponseTemplateVersion[], Error> {
  const api = useBackendApi();
  return useQuery({
    queryKey: [ApiQueryKeys.CSM_RESPONSE_TEMPLATE_VERSIONS, id ?? ""],
    enabled: !!id,
    queryFn: async (): Promise<ResponseTemplateVersion[]> => {
      const response = await api.get<{ versions: ResponseTemplateVersion[] }>(
        `/response-templates/${encodeURIComponent(id ?? "")}/versions`,
      );
      return response?.versions ?? [];
    },
  });
}

export function useCreateResponseTemplate(): UseMutationResult<
  unknown,
  Error,
  CreateResponseTemplateInput
> {
  const api = useBackendApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateResponseTemplateInput) =>
      api.post("/response-templates", input),
    onSuccess: () =>
      void queryClient.invalidateQueries({
        queryKey: [ApiQueryKeys.CSM_RESPONSE_TEMPLATES],
      }),
  });
}

/**
 * Edits a template. Retiring one is this same call with `isActive: false` —
 * there is no delete, since an engineer's past replies were written from
 * versions that have to stay readable.
 */
export function useUpdateResponseTemplate(): UseMutationResult<
  unknown,
  Error,
  UpdateResponseTemplateInput
> {
  const api = useBackendApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: UpdateResponseTemplateInput) =>
      api.patch(`/response-templates/${encodeURIComponent(id)}`, patch),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({
        queryKey: [ApiQueryKeys.CSM_RESPONSE_TEMPLATES],
      });
      void queryClient.invalidateQueries({
        queryKey: [ApiQueryKeys.CSM_RESPONSE_TEMPLATE_VERSIONS, variables.id],
      });
    },
  });
}
