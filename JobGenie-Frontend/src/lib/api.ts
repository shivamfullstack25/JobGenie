const API_BASE_URL =
  (import.meta as any).env?.VITE_API_BASE_URL ?? "http://localhost:8080";

export interface ResumeUploadResponse {
  success: boolean;
  message?: string;
  error?: string;
  resume?: any;
  metadata?: any;
  insights?: any;
}

// Resume Service APIs
export const resumeAPI = {
  uploadResume: async (file: File, userId: number): Promise<ResumeUploadResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('userId', userId.toString());

    const response = await fetch(`${API_BASE_URL}/api/resumes/upload`, {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Upload failed (${response.status})`);
    }
    return response.json();
  },

  getUserResumes: async (userId: number) => {
    const response = await fetch(`${API_BASE_URL}/api/resumes/user/${userId}`);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Failed to load resumes (${response.status})`);
    }
    return response.json();
  },

  getResume: async (resumeId: number) => {
    const response = await fetch(`${API_BASE_URL}/api/resumes/${resumeId}`);
    return response.json();
  },

  deleteResume: async (resumeId: number) => {
    const response = await fetch(`${API_BASE_URL}/api/resumes/${resumeId}`, {
      method: 'DELETE',
    });
    return response.ok;
  },

  activateResume: async (resumeId: number) => {
    const response = await fetch(`${API_BASE_URL}/api/resumes/${resumeId}/activate`, {
      method: 'PUT',
    });
    return response.ok;
  },

  getResumeContent: async (resumeId: number) => {
    const response = await fetch(`${API_BASE_URL}/api/resumes/${resumeId}/content`);
    return response.text();
  },
};

// Job Service APIs
export const jobAPI = {
  searchJobs: async (keywords?: string, location?: string, page: number = 1, size: number = 10) => {
    const params = new URLSearchParams();
    if (keywords) params.append('keywords', keywords);
    if (location) params.append('location', location);
    params.append('page', page.toString());
    params.append('size', size.toString());

    const response = await fetch(`${API_BASE_URL}/api/jobs/search?${params}`);
    return response.json();
  },

  getJobMatches: async (userId: string, resumeId?: string) => {
    const params = new URLSearchParams();
    params.append('userId', userId);
    if (resumeId) params.append('resumeId', resumeId);

    const response = await fetch(`${API_BASE_URL}/api/jobs/matches?${params}`);
    return response.json();
  },

  // resumeId/coverLetterId are optional: /api/jobs/apply now just logs a manual "I clicked
  // through and applied" record — it no longer round-trips resume content through the AI
  // service (see CLAUDE.md "Product decisions (locked)" — click-out apply, not auto-apply).
  applyToJob: async (jobId: string, userId: string, resumeId?: string, coverLetterId?: string, platform?: string) => {
    const params = new URLSearchParams();
    params.append('jobId', jobId);
    params.append('userId', userId);
    if (platform) params.append('platform', platform);
    if (resumeId) params.append('resumeId', resumeId);
    if (coverLetterId) params.append('coverLetterId', coverLetterId);

    const response = await fetch(`${API_BASE_URL}/api/jobs/apply`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });
    // JobController.applyToJob returns 403 (email not verified), 500 with a JobGenieException
    // error body (e.g. { error: "DUPLICATE_APPLICATION", message: "..." }), etc. — without this
    // check those error bodies were being returned to callers as if they were successful
    // application records.
    if (!response.ok) {
      const text = await response.text();
      let friendly = text || `Apply failed (${response.status})`;
      try {
        const parsed = JSON.parse(text);
        if (parsed?.error === 'DUPLICATE_APPLICATION') {
          friendly = "You've already applied to this job.";
        } else if (parsed?.message) {
          friendly = parsed.message;
        }
      } catch {
        // Not JSON — fall back to the raw text above.
      }
      throw new Error(friendly);
    }
    return response.json();
  },

  getUserApplications: async (userId: string, page: number = 1, size: number = 10) => {
    const params = new URLSearchParams();
    params.append('userId', userId);
    params.append('page', page.toString());
    params.append('size', size.toString());

    const response = await fetch(`${API_BASE_URL}/api/jobs/applications?${params}`);
    return response.json();
  },

  // Moves a logged application through the tracker: APPLIED -> INTERVIEWING -> OFFER /
  // REJECTED / WITHDRAWN. Status is normalized to uppercase server-side, but we send it
  // uppercase anyway for clarity. Mirrors applyToJob's error handling: JobController returns
  // a JSON body ({ timestamp, status, error, message }) for 400 (invalid status), 404 (no such
  // application), and 403 (application belongs to another user).
  updateApplicationStatus: async (
    applicationId: string | number,
    userId: string | number,
    status: string,
  ) => {
    const params = new URLSearchParams();
    params.append('userId', String(userId));
    params.append('status', status.toUpperCase());

    const response = await fetch(
      `${API_BASE_URL}/api/jobs/applications/${applicationId}/status?${params}`,
      { method: 'PATCH' },
    );
    if (!response.ok) {
      const text = await response.text();
      let friendly = text || `Status update failed (${response.status})`;
      try {
        const parsed = JSON.parse(text);
        if (parsed?.message) {
          friendly = parsed.message;
        } else if (parsed?.error) {
          friendly = parsed.error;
        }
      } catch {
        // Not JSON — fall back to the raw text above.
      }
      throw new Error(friendly);
    }
    return response.json();
  },

  saveJob: async (payload: {
    userId: string | number;
    jobId: string;
    title?: string;
    company?: string;
    location?: string;
    platform?: string;
    url?: string;
    matchScore?: number;
  }) => {
    const response = await fetch(`${API_BASE_URL}/api/jobs/saved`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Save failed (${response.status})`);
    }
    return response.json();
  },

  getSavedJobs: async (userId: string) => {
    const response = await fetch(
      `${API_BASE_URL}/api/jobs/saved?userId=${encodeURIComponent(userId)}`,
    );
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Failed to load saved jobs (${response.status})`);
    }
    return response.json();
  },

  unsaveJob: async (userId: string, jobId: string) => {
    const response = await fetch(
      `${API_BASE_URL}/api/jobs/saved?userId=${encodeURIComponent(userId)}&jobId=${encodeURIComponent(jobId)}`,
      { method: 'DELETE' },
    );
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Unsave failed (${response.status})`);
    }
    return response.json();
  },


};

// Candidate Profile APIs (user-service). The profile is the canonical record of the candidate:
// every fact carries provenance, and software can only ever propose changes to facts the user has
// stated. The Authorization header is added by lib/authFetch, so these only carry the user id.
export type Provenance = 'FACT' | 'INFERRED' | 'AI_GENERATED' | 'USER_APPROVED';

export interface ProfileFact {
  value: unknown;
  provenance: Provenance | null;
  source: string | null;
  confidence: number | null;
  lastUpdated: string | null;
  verifiedByUser: boolean;
}

export interface CandidateProfileView {
  userId: number;
  version: number;
  updatedAt: string | null;
  facts: Record<string, ProfileFact>;
  missingRequired: string[];
  pendingProposals: number;
}

export interface ProfileProposal {
  id: number;
  field: string;
  proposedValue: unknown;
  currentValue: unknown;
  provenance: Provenance;
  source: string;
  confidence: number | null;
  reason: string | null;
  createdAt: string;
}

export interface ProfileVersionEntry {
  id: number;
  version: number;
  author: string;
  reason: string | null;
  createdAt: string;
}

async function profileRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/api/candidate-profile${path}`, init);
  if (!response.ok) {
    const text = await response.text();
    let message = text || `Request failed (${response.status})`;
    try {
      message = JSON.parse(text)?.message ?? message;
    } catch {
      // not JSON
    }
    throw new Error(message);
  }
  const type = response.headers.get('content-type') ?? '';
  return (type.includes('json') ? response.json() : response.text()) as Promise<T>;
}

const jsonBody = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const profileAPI = {
  get: (userId: number | string) =>
    profileRequest<CandidateProfileView>(`?userId=${userId}`),
  schema: () =>
    profileRequest<{ fields: Record<string, 'SCALAR' | 'LIST' | 'OBJECT'>; requiredForApplications: string[] }>('/schema'),
  setField: (userId: number | string, field: string, value: unknown, reason?: string) =>
    profileRequest<unknown>(`/fields?userId=${userId}`, { ...jsonBody({ field, value, reason }), method: 'PUT' }),
  approveField: (userId: number | string, field: string) =>
    profileRequest<unknown>(`/fields/approve?userId=${userId}`, jsonBody({ field })),
  proposals: (userId: number | string) =>
    profileRequest<ProfileProposal[]>(`/proposals?userId=${userId}`),
  decideProposal: (userId: number | string, id: number, approve: boolean) =>
    profileRequest<unknown>(`/proposals/${id}/decision?userId=${userId}`, jsonBody({ approve })),
  versions: (userId: number | string) =>
    profileRequest<ProfileVersionEntry[]>(`/versions?userId=${userId}`),
  rollback: (userId: number | string, version: number) =>
    profileRequest<{ currentVersion: number }>(`/rollback?userId=${userId}`, jsonBody({ version })),
  importResume: (userId: number | string) =>
    profileRequest<{ applied: number; proposed: number; unchanged: number; errors: string[] }>(
      `/import-resume?userId=${userId}`,
      { method: 'POST' },
    ),
  exportYaml: (userId: number | string) => profileRequest<string>(`/export?userId=${userId}`),
  importYaml: (userId: number | string, yaml: string, confirm: boolean) =>
    profileRequest<{ applied: number; proposed: number; unchanged: number; errors: string[] }>(
      `/import?userId=${userId}&confirm=${confirm}`,
      { method: 'POST', headers: { 'Content-Type': 'application/x-yaml' }, body: yaml },
    ),
};

// Resume tailoring (AI service, via the gateway's /ai/** route). Stateless: the profile values are
// sent with the request. The result only ever contains things from the profile.
export interface TailoredResume {
  document: {
    preset: string;
    label: string;
    skills: string[];
    missing: string[];
    unverified_fields: string[];
    discarded_rewrites: string[];
    violations: string[];
  };
  text: string;
}

export const resumeAgentAPI = {
  presets: async (): Promise<{ id: string; label: string }[]> => {
    const response = await fetch(`${API_BASE_URL}/ai/v2/resume/presets`);
    if (!response.ok) throw new Error(`Could not load role presets (${response.status})`);
    return (await response.json()).presets;
  },
  tailor: async (
    profile: Record<string, unknown>,
    preset: string,
    jobDescription?: string,
    provenance?: Record<string, string>,
  ): Promise<TailoredResume> => {
    const response = await fetch(`${API_BASE_URL}/ai/v2/resume/tailor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile, preset, job_description: jobDescription || null, provenance }),
    });
    if (!response.ok) {
      const text = await response.text();
      let message = text;
      try {
        message = JSON.parse(text).detail ?? text;
      } catch {
        // not JSON
      }
      throw new Error(message || `Tailoring failed (${response.status})`);
    }
    return response.json();
  },
};

// Job discovery (AI service, via /ai/**): permitted public job-board feeds only, each result
// normalised, de-duplicated, safety-scored and (given a profile) matched with its reasoning.
export interface DiscoveredJob {
  job: {
    job_id: string; source: string; source_job_id: string | null; url: string; application_url: string;
    company: string; title: string; description: string; location: string; remote_type: string;
    salary_min: number | null; salary_max: number | null; currency: string | null;
    posted_date: string | null; ats_type: string | null; visa_sponsorship: boolean | null;
    required_skills: string[];
  };
  safety: { risk_score: number; level: 'LOW' | 'MEDIUM' | 'HIGH'; reasons: string[]; blocks_automation: boolean };
  match: {
    match_score: number; recommendation: string; confidence: number; strengths: string[]; weaknesses: string[];
    missing_skills: string[]; salary_fit: string; location_fit: string; visa_fit: string; career_fit: string;
    tiers_used: string[];
  } | null;
}

export interface DiscoveryResult {
  total: number;
  jobs: DiscoveredJob[];
  duplicate_groups: { survivor: string; duplicates: string[]; reasons: string[] }[];
  skipped: { platform: string; reason: string }[];
  errors: { platform: string; error: string }[];
}

export interface PlatformPolicyInfo {
  platform: string; search: string; profileUpdate: string; apply: string; sourceUrl: string; reviewedOn: string; notes: string;
}

export const discoveryAPI = {
  discover: async (body: {
    keywords: string[]; location: string; boards: string[]; profile?: Record<string, unknown>; limit?: number;
  }): Promise<DiscoveryResult> => {
    const response = await fetch(`${API_BASE_URL}/ai/v2/jobs/discover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text();
      let message = text;
      try { message = JSON.parse(text).detail ?? text; } catch { /* not JSON */ }
      throw new Error(message || `Search failed (${response.status})`);
    }
    return response.json();
  },
  policies: async (): Promise<{ switches: { globalAutomationEnabled: boolean; dryRun: boolean; disabledPlatforms: string[] }; policies: PlatformPolicyInfo[] }> => {
    const response = await fetch(`${API_BASE_URL}/ai/v2/platforms/policies`);
    if (!response.ok) throw new Error(`Could not load platform policies (${response.status})`);
    return response.json();
  },
};

// Application packages + the Approval Center. A package is built by the AI service from the
// user's own profile and is only ever a proposal; it waits in the approval queue (job-service) until
// the user approves, edits, saves or rejects it. JobGenie never submits: approving makes the
// application READY_TO_SUBMIT and the user applies on the employer's site.
export interface ApplicationAnswer {
  question: string; topic: string; answer: unknown; source: string | null; confidence: number;
  requires_approval: boolean; status: 'FILLED' | 'USER_INPUT_REQUIRED' | 'DRAFT_ONLY'; note?: string | null; evidence?: string[] | null;
}

export interface ApplicationPackage {
  job: { job_id: string; title: string; company: string; location: string; source: string };
  decision: string;
  decision_reasons: string[];
  preset: { preset: string; reason: string };
  resume: { text: string };
  cover_letter: { text: string; unsupported_claims: string[] };
  recruiter_message: string;
  answers: ApplicationAnswer[];
  checks: { name: string; passed: boolean; detail: string }[];
  needs_confirmation: string[];
  missing_information: string[];
  submission: { method: string; url: string; platform_mode: string };
  suggested_state: string;
  match: { match_score: number } | null;
  safety: { level: string; reasons: string[] };
}

export interface ApprovalRequestRow {
  id: number; userId: string; jobId: string; jobTitle: string; company: string; location: string; source: string;
  applicationUrl: string; decision: string; matchScore: number | null; riskLevel: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SAVED'; packageData: ApplicationPackage; editedByUser: boolean;
  applicationId: number | null; note: string | null; createdAt: string; decidedAt: string | null;
}

async function jsonOrThrow<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) {
    const text = await response.text();
    let message = text;
    try {
      const parsed = JSON.parse(text);
      message = parsed.message ?? parsed.detail ?? text;
    } catch {
      // not JSON
    }
    throw new Error(message || `${fallback} (${response.status})`);
  }
  return response.json();
}

export const applicationAPI = {
  buildPackage: async (body: {
    profile: Record<string, unknown>; job: unknown; questions: string[]; provenance?: Record<string, string>; applied_job_ids?: string[];
  }): Promise<ApplicationPackage> =>
    jsonOrThrow(await fetch(`${API_BASE_URL}/ai/v2/applications/package`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }), 'Could not prepare the application'),
  queue: async (userId: string | number, pkg: ApplicationPackage): Promise<ApprovalRequestRow> =>
    jsonOrThrow(await fetch(`${API_BASE_URL}/api/approvals?userId=${userId}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pkg),
    }), 'Could not queue the package'),
  list: async (userId: string | number): Promise<ApprovalRequestRow[]> =>
    jsonOrThrow(await fetch(`${API_BASE_URL}/api/approvals?userId=${userId}`), 'Could not load the approval queue'),
  decide: async (
    userId: string | number, id: number, action: 'APPROVE' | 'EDIT' | 'SAVE' | 'REJECT',
    edits?: { coverLetterText?: string; recruiterMessage?: string; answers?: { question: string; answer: string }[] }, note?: string,
  ): Promise<ApprovalRequestRow> =>
    jsonOrThrow(await fetch(`${API_BASE_URL}/api/approvals/${id}/decision?userId=${userId}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, edits, note }),
    }), 'Could not record your decision'),
  history: async (userId: string | number, applicationId: number): Promise<{ id: number; fromState: string | null; toState: string; actor: string; reason: string | null; createdAt: string }[]> =>
    jsonOrThrow(await fetch(`${API_BASE_URL}/api/approvals/applications/${applicationId}/history?userId=${userId}`), 'Could not load history'),
};

