-- JobGenie Database Initialization Script for PostgreSQL
-- Creates databases and users for all microservices

-- Create databases (PostgreSQL-compatible syntax)
SELECT 'CREATE DATABASE jobgenie_users' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'jobgenie_users')\gexec
SELECT 'CREATE DATABASE jobgenie_jobs' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'jobgenie_jobs')\gexec
SELECT 'CREATE DATABASE jobgenie_resumes' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'jobgenie_resumes')\gexec
SELECT 'CREATE DATABASE jobgenie_notifications' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'jobgenie_notifications')\gexec
SELECT 'CREATE DATABASE jobgenie_ai' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'jobgenie_ai')\gexec

-- Create user (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'jobgenie_user') THEN
        CREATE USER jobgenie_user WITH PASSWORD 'jobgenie_pass';
    END IF;
END
$$;

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE jobgenie_users TO jobgenie_user;
GRANT ALL PRIVILEGES ON DATABASE jobgenie_jobs TO jobgenie_user;
GRANT ALL PRIVILEGES ON DATABASE jobgenie_resumes TO jobgenie_user;
GRANT ALL PRIVILEGES ON DATABASE jobgenie_notifications TO jobgenie_user;
GRANT ALL PRIVILEGES ON DATABASE jobgenie_ai TO jobgenie_user;

-- Connect to each database and create schemas

-- User Service Tables
\c jobgenie_users;

CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    firebase_uid VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    display_name VARCHAR(255),
    profile_picture_url TEXT,
    phone VARCHAR(20),
    location VARCHAR(255),
    role VARCHAR(50) DEFAULT 'user',
    preferences JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_sessions (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id),
    session_token VARCHAR(255) UNIQUE NOT NULL,
    device_id VARCHAR(255),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    is_active BOOLEAN DEFAULT true
);

-- Job Service Tables
\c jobgenie_jobs;

CREATE TABLE IF NOT EXISTS jobs (
    id BIGSERIAL PRIMARY KEY,
    job_id VARCHAR(255) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    company VARCHAR(255) NOT NULL,
    location VARCHAR(255) NOT NULL,
    description TEXT,
    salary VARCHAR(255),
    type VARCHAR(50),
    posted_at TIMESTAMP,
    required_skills JSONB,
    platform VARCHAR(50),
    url TEXT,
    is_remote BOOLEAN DEFAULT false,
    experience_level VARCHAR(50),
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS job_applications (
    id BIGSERIAL PRIMARY KEY,
    job_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    -- Nullable: JobGenie is a click-out product (see CLAUDE.md "Product decisions (locked)")
    -- — applying is just logging that the user went to the destination site, no resume
    -- required to record it.
    resume_id VARCHAR(255),
    cover_letter_id VARCHAR(255),
    application_status VARCHAR(50) DEFAULT 'submitted',
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    external_application_id VARCHAR(255),
    platform_response JSONB,
    metadata JSONB
);

CREATE TABLE IF NOT EXISTS job_matches (
    id BIGSERIAL PRIMARY KEY,
    job_id BIGINT REFERENCES jobs(id),
    user_id BIGINT NOT NULL,
    resume_id BIGINT NOT NULL,
    match_score INTEGER,
    matching_skills JSONB,
    match_reasons JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS saved_jobs (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    job_id VARCHAR(255) NOT NULL,
    title VARCHAR(255),
    company VARCHAR(255),
    location VARCHAR(255),
    platform VARCHAR(100),
    url TEXT,
    match_score INTEGER,
    saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, job_id)
);

-- Resume Service Tables
\c jobgenie_resumes;

CREATE TABLE IF NOT EXISTS users (
    id BIGINT PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    avatar TEXT,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    profile_image_url TEXT,
    bio TEXT,
    phone_number VARCHAR(50),
    location VARCHAR(255),
    website VARCHAR(255),
    linkedin_url VARCHAR(255),
    github_url VARCHAR(255),
    auth_provider VARCHAR(50) DEFAULT 'synced',
    firebase_uid VARCHAR(255),
    role VARCHAR(50) DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS resumes (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500),
    file_size BIGINT,
    content_type VARCHAR(100),
    parsed_content TEXT,
    metadata JSONB,
    skills JSONB,
    experience JSONB,
    education JSONB,
    summary TEXT,
    ats_score INTEGER,
    is_active BOOLEAN DEFAULT false,
    is_processed BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cover_letters (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    resume_id BIGINT REFERENCES resumes(id),
    job_title VARCHAR(255),
    company_name VARCHAR(255),
    content TEXT NOT NULL,
    tone VARCHAR(50) DEFAULT 'professional',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ats_resumes (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    original_resume_id BIGINT REFERENCES resumes(id),
    job_description TEXT,
    optimized_content TEXT NOT NULL,
    target_keywords JSONB,
    ats_score INTEGER,
    optimization_notes JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Notification Service Tables
\c jobgenie_notifications;

CREATE TABLE IF NOT EXISTS notifications (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    notification_type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    data JSONB,
    is_read BOOLEAN DEFAULT false,
    sent_via JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    read_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notification_templates (
    id BIGSERIAL PRIMARY KEY,
    template_name VARCHAR(255) UNIQUE NOT NULL,
    template_type VARCHAR(50) NOT NULL,
    subject VARCHAR(255),
    html_content TEXT,
    text_content TEXT,
    variables JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
\c jobgenie_users;
CREATE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);

\c jobgenie_jobs;
CREATE INDEX IF NOT EXISTS idx_jobs_job_id ON jobs(job_id);
CREATE INDEX IF NOT EXISTS idx_jobs_platform ON jobs(platform);
CREATE INDEX IF NOT EXISTS idx_jobs_location ON jobs(location);
CREATE INDEX IF NOT EXISTS idx_jobs_posted_at ON jobs(posted_at);
CREATE INDEX IF NOT EXISTS idx_job_applications_user_id ON job_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_job_applications_job_id ON job_applications(job_id);
CREATE INDEX IF NOT EXISTS idx_job_matches_user_id ON job_matches(user_id);
CREATE INDEX IF NOT EXISTS idx_job_matches_score ON job_matches(match_score);
-- Matches SavedJobRepository.findByUserIdOrderBySavedAtDesc — the UNIQUE(user_id, job_id)
-- constraint's index covers user_id lookups but not this sort order.
CREATE INDEX IF NOT EXISTS idx_saved_jobs_user_saved_at ON saved_jobs(user_id, saved_at DESC);

\c jobgenie_resumes;
CREATE INDEX IF NOT EXISTS idx_resumes_user_id ON resumes(user_id);
CREATE INDEX IF NOT EXISTS idx_resumes_active ON resumes(is_active);
CREATE INDEX IF NOT EXISTS idx_resumes_processed ON resumes(is_processed);
CREATE INDEX IF NOT EXISTS idx_cover_letters_user_id ON cover_letters(user_id);
CREATE INDEX IF NOT EXISTS idx_cover_letters_resume_id ON cover_letters(resume_id);
CREATE INDEX IF NOT EXISTS idx_ats_resumes_user_id ON ats_resumes(user_id);

\c jobgenie_notifications;
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(notification_type);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);

-- Insert sample notification templates
\c jobgenie_notifications;

INSERT INTO notification_templates (template_name, template_type, subject, html_content, text_content, variables) 
VALUES 
('job_match_found', 'email', 'New Job Matches Found!', 
 '<h2>🎯 New Job Matches Found!</h2><p>We found {{job_count}} new job matches for you.</p>', 
 'New Job Matches Found! We found {{job_count}} new job matches for you.',
 '{"job_count": "number", "jobs": "array"}'),
 
('application_submitted', 'email', 'Application Submitted Successfully',
 '<h2>✅ Application Submitted!</h2><p>Your application for {{job_title}} at {{company}} has been submitted successfully.</p>',
 'Application Submitted! Your application for {{job_title}} at {{company}} has been submitted successfully.',
 '{"job_title": "string", "company": "string", "application_id": "string"}'),
 
('resume_processed', 'email', 'Resume Analysis Complete',
 '<h2>📄 Resume Analysis Complete!</h2><p>Your resume has been analyzed. ATS Score: {{ats_score}}/100</p>',
 'Resume Analysis Complete! Your resume has been analyzed. ATS Score: {{ats_score}}/100',
 '{"ats_score": "number", "skills_count": "number"}')
ON CONFLICT (template_name) DO NOTHING;

COMMIT; 