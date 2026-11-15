// Relationship graph service — read-only lists of persons, service
// accounts and groups through the backend proxy (/api/kanidm/*). The
// graph is built on the client from these entries; no writes, so no
// withStepUp.

import { apiFetch } from '@/shared/services/http-client';
import type { KanidmEntry } from '@/shared/types/kanidm';
import type { GraphInput } from '../graph';

const PERSON_BASE = '/api/kanidm/v1/person';
const SERVICE_ACCOUNT_BASE = '/api/kanidm/v1/service_account';
const GROUP_BASE = '/api/kanidm/v1/group';

class GraphService {
  private static instance: GraphService;

  private constructor() {}

  static getInstance(): GraphService {
    if (!GraphService.instance) {
      GraphService.instance = new GraphService();
    }
    return GraphService.instance;
  }

  /**
   * The raw entries of the three list routes (vendor person_list,
   * service_account_list and group_list: GET /v1/* -> [{ attrs: {...} }]).
   */
  async load(): Promise<GraphInput> {
    const [persons, serviceAccounts, groups] = await Promise.all([
      apiFetch<KanidmEntry[]>(PERSON_BASE),
      apiFetch<KanidmEntry[]>(SERVICE_ACCOUNT_BASE),
      apiFetch<KanidmEntry[]>(GROUP_BASE),
    ]);
    return { persons, serviceAccounts, groups };
  }
}

export const graphService = GraphService.getInstance();
