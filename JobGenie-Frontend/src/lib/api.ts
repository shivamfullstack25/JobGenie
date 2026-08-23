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

  autoApplyToJob: async (jobId: string, userId: string, resumeId: string, coverLetterId?: string) => {
    // JobController.applyToJob binds jobId/userId/resumeId/coverLetterId as @RequestParam, not a
    // JSON @RequestBody — a JSON POST here was always rejected (missing required parameters).
    // jobAPI.applyToJob already sends the correct form-encoded request; reuse it instead of
    // duplicating (and re-breaking) the same call.
    return jobAPI.applyToJob(jobId, userId, resumeId, coverLetterId);
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

  // Advanced Auto-Apply Endpoints
  advancedAutoApply: async (jobUrl: string, platform: string, userCredentials: any, resumePath: string, coverLetter: string = '') => {
    const response = await fetch(`${API_BASE_URL}/api/advanced-auto-apply`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        job_url: jobUrl,
        platform: platform,
        user_credentials: userCredentials,
        resume_path: resumePath,
        cover_letter: coverLetter,
      }),
    });

    return response.json();
  },

  batchAutoApply: async (jobs: any[], userCredentials: any, resumePath: string, maxApplications: number = 10) => {
    const response = await fetch(`${API_BASE_URL}/api/auto-apply/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jobs: jobs,
        user_credentials: userCredentials,
        resume_path: resumePath,
        max_applications: maxApplications,
        delay_between_applications: 60,
      }),
    });

    return response.json();
  },

  searchAndApply: async (keywords: string[], location: string, platforms: string[] = ['linkedin', 'indeed']) => {
    const response = await fetch(`${API_BASE_URL}/api/jobs/search-and-apply`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        keywords: keywords,
        location: location,
        platforms: platforms,
        max_jobs: 50,
      }),
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

  createAutoApplySchedule: async (userId: string, scheduleConfig: any) => {
    const response = await fetch(`${API_BASE_URL}/api/schedule/auto-apply`, {
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

  applyToJob: async (jobId: string, userId: string, resumeId: string, coverLetterId?: string) => {
    const params = new URLSearchParams();
    params.append('jobId', jobId);
    params.append('userId', userId);
    params.append('resumeId', resumeId);
    if (coverLetterId) params.append('coverLetterId', coverLetterId);

    const response = await fetch(`${API_BASE_URL}/api/jobs/apply`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });
    // JobController.applyToJob returns 403 (email not verified), 500 (application errors,
    // e.g. duplicate application / no resume content), etc. — without this check those error
    // bodies were being returned to callers as if they were successful application records.
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Apply failed (${response.status})`);
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