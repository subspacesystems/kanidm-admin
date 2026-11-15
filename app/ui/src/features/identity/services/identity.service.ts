// Identity verification service — posts to the backend proxy
// (/api/kanidm/v1/person/{id}/_identify_user). The proxy forwards the
// POST to Kanidm and demands an active write privilege, so a stale
// session answers reauth_required (403); the page wraps the calls in
// withStepUp, not this service.

import { apiFetch } from '@/shared/services/http-client';
import {
  parseIdentifyResponse,
  startRequestBody,
  submitCodeRequestBody,
  type IdentifyResult,
} from '../identity-verification.ts';

const IDENTIFY_BASE = '/api/kanidm/v1/person';

class IdentityService {
  private static instance: IdentityService;

  private constructor() {}

  static getInstance(): IdentityService {
    if (!IdentityService.instance) {
      IdentityService.instance = new IdentityService();
    }
    return IdentityService.instance;
  }

  /** Start the verification for the other person (wire: `"Start"`). */
  async start(personId: string): Promise<IdentifyResult> {
    const answer = await apiFetch<unknown>(
      `${IDENTIFY_BASE}/${encodeURIComponent(personId)}/_identify_user`,
      { method: 'POST', body: startRequestBody() }
    );
    return parseIdentifyResponse(answer);
  }

  /** Submit the other person's code (wire: `{"SubmitCode":{"other_totp":n}}`). */
  async submitCode(personId: string, code: number): Promise<IdentifyResult> {
    const answer = await apiFetch<unknown>(
      `${IDENTIFY_BASE}/${encodeURIComponent(personId)}/_identify_user`,
      { method: 'POST', body: submitCodeRequestBody(code) }
    );
    return parseIdentifyResponse(answer);
  }
}

export const identityService = IdentityService.getInstance();
