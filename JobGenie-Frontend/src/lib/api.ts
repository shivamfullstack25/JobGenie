const API_BASE_URL =
  (import.meta as any).env?.VITE_API_BASE_URL ?? "http://localhost:8080";
const AI_SERVICE_URL =
  (import.meta as any).env?.VITE_AI_SERVICE_URL ?? "http://localhost:8000";

export interface ResumeUploadResponse {
  success: boolean;
  message?: string;
  error?: string;
  resume?: any;
  metadata?: any;
  insights?: any;
}

export interface JobSearchRequest {
  user_skills: string[];
  preferred_locations: string[];
  job_titles: string[];
  experience_level?: string;
  remote_preference?: string;
}

export interface CoverLetterRequest {
  job_title: string;
  company: string;
  user_skills: string[];
  resume_summary?: string;
  tone?: string;
}

export interface ATSOptimizationRequest {
  resume_content: string;
  job_description: string;
  target_score?: number;
}

export interface CareerAdviceRequest {
  question: string;
  user_context?: any;
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

// AI Service APIs - Updated to use backend endpoints
export const aiAPI = {
  analyzeResume: async (resumeText: string, detailed: boolean = false, jobDescription?: string) => {
    const response = await fetch(`${API_BASE_URL}/api/resumes/insights`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        resume_text: resumeText,
        detailed,
        job_description: jobDescription,
      }),
    });

    return response.json();
  },

  generateCoverLetter: async (request: CoverLetterRequest) => {
    const response = await fetch(`${API_BASE_URL}/api/resumes/generate-cover-letter`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        job_title: request.job_title,
        company_name: request.company,
        resume_content: request.resume_summary || '',
        personal_statement: request.tone || 'professional',
      }),
    });

    return response.json();
  },

  optimizeForATS: async (request: ATSOptimizationRequest) => {
    const response = await fetch(`${API_BASE_URL}/api/resumes/optimize-ats`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        resume_content: request.resume_content,
        job_description: request.job_description,
        target_score: request.target_score || 80,
      }),
    });

    return response.json();
  },

  getCareerAdvice: async (request: CareerAdviceRequest) => {
    const response = await fetch(`${API_BASE_URL}/api/resumes/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        question: request.question,
        user_context: request.user_context,
      }),
    });

    return response.json();
  },

  searchJobs: async (request: JobSearchRequest) => {
    const response = await fetch(`${API_BASE_URL}/api/jobs/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        keywords: request.job_titles,
        location: request.preferred_locations.join(', '),
        max_jobs: 20,
      }),
    });

    return response.json();
  },

  getJobMatches: async (userId: string, resumeId?: string) => {
    const response = await fetch(`${API_BASE_URL}/api/jobs/matches?userId=${userId}${resumeId ? `&resumeId=${resumeId}` : ''}`);
    return response.json();
  },

  getUserApplications: async (userId: string, page: number = 1, size: number = 10) => {
    const response = await fetch(`${API_BASE_URL}/api/jobs/applications?userId=${userId}&page=${page}&size=${size}`);
    return response.json();
  },

  setupScheduler: async (userId: string, scheduleType: string, searchCriteria: any) => {
    const response = await fetch(`${API_BASE_URL}/api/automation/schedule-advanced`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        frequency: scheduleType,
        platforms: ['linkedin', 'indeed', 'naukri'],
        jobPreferences: searchCriteria,
        autoApplyEnabled: false,
      }),
    });

    return response.json();
  },

  getSchedulerStatus: async (userId: string) => {
    const response = await fetch(`${API_BASE_URL}/api/automation/status?userId=${userId}`);
    return response.json();
  },

  deleteScheduler: async (schedulerId: string) => {
    const response = await fetch(`${API_BASE_URL}/api/schedules/${schedulerId}`, {
      method: 'DELETE',
    });
    return response.json();
  },

  // Schedule Management
  createJobSearchSchedule: async (userId: string, scheduleConfig: any) => {
    const response = await fetch(`${API_BASE_URL}/api/schedule/job-search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id: userId,
        ...scheduleConfig,
      }),
    });

    return response.json();
  },

  getUserSchedules: async (userId: string) => {
    const response = await fetch(`${API_BASE_URL}/api/schedules?userId=${userId}`);
    return response.json();
  },

  pauseSchedule: async (scheduleId: string) => {
    const response = await fetch(`${API_BASE_URL}/api/schedules/${scheduleId}/toggle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ isActive: false }),
    });

    return response.json();
  },

  resumeSchedule: async (scheduleId: string) => {
    const response = await fetch(`${API_BASE_URL}/api/schedules/${scheduleId}/toggle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ isActive: true }),
    });

    return response.json();
  },

  // Notification Management
  sendNotification: async (userId: string, notificationType: string, data: any) => {
    const response = await fetch(`${API_BASE_URL}/api/notifications/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id: userId,
        notification_type: notificationType,
        data: data,
      }),
    });

    return response.json();
  },

  getNotificationHistory: async (userId: string, limit: number = 50) => {
    const response = await fetch(`${API_BASE_URL}/api/notifications/history/${userId}?limit=${limit}`);
    return response.json();
  },

  markNotificationAsRead: async (userId: string, notificationId: string) => {
    const response = await fetch(`${API_BASE_URL}/api/notifications/${notificationId}/read?user_id=${userId}`, {
      method: 'POST',
    });

    return response.json();
  },

  getNotificationStats: async (userId: string) => {
    const response = await fetch(`${API_BASE_URL}/api/notifications/stats/${userId}`);
    return response.json();
  },

  executeCrewTask: async (taskType: string, taskData: any) => {
    const response = await fetch(`${API_BASE_URL}/ai/crew/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        task_type: taskType,
        task_data: taskData,
      }),
    });

    return response.json();
  },

  getCrewStatus: async () => {
    const response = await fetch(`${API_BASE_URL}/ai/crew/status`);
    return response.json();
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

  startAutomation: async (userId: string, config: any) => {
    const response = await fetch(`${API_BASE_URL}/api/jobs/automation/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(config),
    });
    return response.json();
  },

  getAutomationStatus: async (userId: string) => {
    const params = new URLSearchParams();
    params.append('userId', userId);

    const response = await fetch(`${API_BASE_URL}/api/jobs/automation/status?${params}`);
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

// User Service APIs
export const userAPI = {
  createUser: async (userData: any) => {
    const response = await fetch(`${API_BASE_URL}/api/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(userData),
    });

    return response.json();
  },

  getUser: async (userId: number) => {
    const response = await fetch(`${API_BASE_URL}/api/users/${userId}`);
    return response.json();
  },

  updateUser: async (userId: number, userData: any) => {
    const response = await fetch(`${API_BASE_URL}/api/users/${userId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(userData),
    });

    return response.json();
  },

  deleteUser: async (userId: number) => {
    const response = await fetch(`${API_BASE_URL}/api/users/${userId}`, {
      method: 'DELETE',
    });
    return response.ok;
  },
};

// Health check
export const healthAPI = {
  checkSpringBoot: async () => {
    const response = await fetch(`${API_BASE_URL}/actuator/health`);
    return response.json();
  },

  checkAIService: async () => {
    const response = await fetch(`${AI_SERVICE_URL}/health`);
    return response.json();
  },
}; 