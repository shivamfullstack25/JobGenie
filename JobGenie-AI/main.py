import asyncio
import json
import logging
import os
from datetime import datetime, timedelta

# ChromaDB/CrewAI need sqlite3 >= 3.35; patch on older system Python builds
try:
    import pysqlite3  # noqa: F401

    import sys

    sys.modules["sqlite3"] = pysqlite3
except ImportError:
    pass

from fastapi import FastAPI, HTTPException, UploadFile, File, Form, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Dict, Any, Optional

# Import Eureka service discovery
from app.config.eureka_config import initialize_service_discovery, cleanup_service_discovery

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def _safe_import(label: str, factory):
    """Import optional heavy services without crashing the whole API."""
    try:
        return factory()
    except Exception as exc:
        logger.warning("Optional service '%s' unavailable: %s", label, exc)
        return None


app = FastAPI(title="JobGenie AI Service", version="1.0.0")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Prometheus metrics — optional instrumentation, must not crash the service if missing
try:
    from prometheus_fastapi_instrumentator import Instrumentator

    Instrumentator().instrument(app).expose(app)
    logger.info("Prometheus instrumentation enabled at /metrics")
except Exception as exc:
    logger.warning("Prometheus instrumentation unavailable: %s", exc)

# Startup and shutdown events
@app.on_event("startup")
async def startup_event():
    """Initialize services on startup"""
    logger.info("JobGenie AI Service starting up...")
    
    # Initialize service discovery with Eureka
    try:
        await initialize_service_discovery()
        logger.info("Service discovery initialized successfully")
    except Exception as e:
        logger.warning(f"Service discovery initialization failed: {e}")
    
    logger.info("JobGenie AI Service started successfully")

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup services on shutdown"""
    logger.info("JobGenie AI Service shutting down...")
    
    # Cleanup service discovery
    try:
        await cleanup_service_discovery()
        logger.info("Service discovery cleanup completed")
    except Exception as e:
        logger.warning(f"Service discovery cleanup failed: {e}")
    
    logger.info("JobGenie AI Service shutdown complete")

# Core services — prefer real implementations; fall back so /health still serves
resume_parser = _safe_import(
    "resume_parser", lambda: __import__("app.services.resume_parser", fromlist=["ResumeParser"]).ResumeParser()
)
cover_letter_generator = _safe_import(
    "cover_letter_generator",
    lambda: __import__("app.services.cover_letter_generator", fromlist=["CoverLetterGenerator"]).CoverLetterGenerator(),
)
ats_optimizer = _safe_import(
    "ats_optimizer", lambda: __import__("app.services.ats_optimizer", fromlist=["ATSOptimizer"]).ATSOptimizer()
)
career_mentor = _safe_import(
    "career_mentor", lambda: __import__("app.services.career_mentor", fromlist=["CareerMentor"]).CareerMentor()
)
job_aggregator = _safe_import(
    "job_aggregator", lambda: __import__("app.services.job_aggregator", fromlist=["JobAggregator"]).JobAggregator()
)
crew_ai_service = _safe_import(
    "crew_ai_service", lambda: __import__("app.services.crew_ai_service", fromlist=["CrewAIService"]).CrewAIService()
)

# Optional / heavy services — degrade gracefully if deps missing
auto_apply_agent = _safe_import(
    "auto_apply", lambda: __import__("app.services.auto_apply_agent", fromlist=["AutoApplyAgent"]).AutoApplyAgent()
)
advanced_auto_apply_agent = _safe_import(
    "advanced_auto_apply",
    lambda: __import__("app.services.advanced_auto_apply", fromlist=["AdvancedAutoApplyAgent"]).AdvancedAutoApplyAgent(),
)
scheduler_agent = _safe_import(
    "scheduler", lambda: __import__("app.services.scheduler_agent", fromlist=["SchedulerAgent"]).SchedulerAgent()
)
notification_service = _safe_import(
    "notification",
    lambda: __import__("app.services.notification_service", fromlist=["NotificationService"]).NotificationService(),
)
market_intelligence = _safe_import(
    "market_intelligence",
    lambda: __import__("app.services.market_intelligence", fromlist=["MarketIntelligence"]).MarketIntelligence(),
)
enhanced_job_matcher = _safe_import(
    "enhanced_job_matcher",
    lambda: __import__("app.services.enhanced_job_matcher", fromlist=["EnhancedJobMatcher"]).EnhancedJobMatcher(),
)


def _require(service, name: str):
    if service is None:
        raise HTTPException(
            status_code=503,
            detail=f"{name} is unavailable (optional dependency missing in this image)",
        )
    return service


# Pydantic models
class JobSearchRequest(BaseModel):
    keywords: List[str]
    location: str
    max_jobs: int = 20
    platforms: Optional[List[str]] = None

class JobMatchRequest(BaseModel):
    resume_skills: List[str]
    job_requirements: List[str]

class CoverLetterRequest(BaseModel):
    job_title: str
    company_name: str
    job_description: str
    resume_content: str
    personal_statement: Optional[str] = None

class ATSOptimizationRequest(BaseModel):
    resume_content: str
    job_description: str
    target_role: str

class CareerAdviceRequest(BaseModel):
    current_role: str
    experience_years: int
    career_goals: str
    skills: List[str]

class AutoApplyRequest(BaseModel):
    job_id: str
    resume_content: str
    cover_letter: str
    platform: str

class SchedulingRequest(BaseModel):
    user_id: str
    interview_type: str
    preferred_dates: List[str]
    timezone: str

class MarketIntelligenceRequest(BaseModel):
    job_title: str
    location: str
    industry: Optional[str] = None

class ResumeInsightsRequest(BaseModel):
    resume_text: str
    detailed: bool = False
    job_description: Optional[str] = None

class ATSResumeRequest(BaseModel):
    resume_content: str
    job_description: str
    target_score: int = 80

class ChatRequest(BaseModel):
    question: str
    user_context: Optional[Dict[str, Any]] = None

class SchedulerSetupRequest(BaseModel):
    user_id: str
    schedule_type: str  # daily, weekly, monthly
    search_criteria: Dict[str, Any]

class SchedulerStatusRequest(BaseModel):
    scheduler_id: str

class AdvancedAutoApplyRequest(BaseModel):
    job_url: str
    platform: str
    user_credentials: Dict[str, str]
    resume_path: str
    cover_letter: Optional[str] = ""

class ScheduleConfigRequest(BaseModel):
    user_id: str
    frequency: str  # daily, weekly, hourly
    search_time: Optional[str] = "09:00"
    keywords: List[str]
    location: str
    platforms: Optional[List[str]] = ["linkedin", "indeed", "naukri"]
    max_jobs_per_search: Optional[int] = 50
    filters: Optional[Dict[str, Any]] = {}

class AutoApplyScheduleRequest(BaseModel):
    user_id: str
    frequency: str  # daily, twice_daily, weekly
    apply_time: Optional[str] = "10:00"
    max_applications_per_run: Optional[int] = 5
    min_match_score: Optional[int] = 70
    platforms: Optional[List[str]] = ["linkedin", "indeed"]
    auto_apply_enabled: Optional[bool] = True
    require_cover_letter: Optional[bool] = True

class NotificationRequest(BaseModel):
    user_id: str
    notification_type: str
    data: Dict[str, Any]

# Health check endpoint for Eureka and Docker
@app.get("/health")
async def health_check():
    """Enhanced health check endpoint for service discovery and Docker"""
    try:
        crew_status = {"initialized": False, "available": False}
        if crew_ai_service is not None and hasattr(crew_ai_service, "get_status"):
            try:
                crew_status = await crew_ai_service.get_status()
            except Exception as e:
                crew_status = {"initialized": False, "error": str(e)}

        services_status = {
            "crew_ai_service": crew_status,
            "job_aggregator": {"available": job_aggregator is not None},
            "resume_parser": {"available": resume_parser is not None},
            "notification_service": {"available": notification_service is not None},
            "scheduler_agent": {"available": scheduler_agent is not None},
        }

        return {
            "status": "UP",
            "service": "jobgenie-ai-service",
            "timestamp": datetime.now().isoformat(),
            "version": "1.0.0",
            "services": services_status,
            "llm_configuration": {
                "provider": os.getenv("LLM_PROVIDER", "auto"),
                "model": os.getenv("LLM_MODEL", "gpt-4"),
                "openai_configured": bool(os.getenv("OPENAI_API_KEY")),
            },
        }
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        # Still report UP so Docker/gateway are not blocked by optional deps
        return {
            "status": "UP",
            "service": "jobgenie-ai-service",
            "timestamp": datetime.now().isoformat(),
            "degraded": True,
            "error": str(e),
        }


@app.on_event("startup")
async def init_core_services():
    """Initialize optional core services without failing the process."""
    try:
        if job_aggregator is not None and hasattr(job_aggregator, "initialize"):
            await job_aggregator.initialize()
        if crew_ai_service is not None and hasattr(crew_ai_service, "initialize"):
            await crew_ai_service.initialize()
        logger.info("JobGenie AI core services initialized")
    except Exception as e:
        logger.warning("Core service init degraded: %s", e)


@app.on_event("shutdown")
async def cleanup_core_services():
    try:
        if job_aggregator is not None and hasattr(job_aggregator, "cleanup"):
            await job_aggregator.cleanup()
    except Exception as e:
        logger.warning("Cleanup warning: %s", e)


def make_json_serializable(obj):
    if isinstance(obj, dict):
        return {k: make_json_serializable(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [make_json_serializable(v) for v in obj]
    elif hasattr(obj, "dict"):
        return make_json_serializable(obj.dict())
    elif hasattr(obj, "to_dict"):
        return make_json_serializable(obj.to_dict())
    elif hasattr(obj, "model_dump"):
        return make_json_serializable(obj.model_dump())
    elif isinstance(obj, (str, int, float, bool)) or obj is None:
        return obj
    else:
        return str(obj)


@app.get("/")
async def root():
    """Health check endpoint"""
    return {"message": "JobGenie AI Service is running", "status": "healthy"}

@app.post('/ai/resume/analyze')
async def analyze_resume(file: UploadFile = File(...), user_id: str = Form(...)):
    logger.info(f"Received resume for analysis: user_id={user_id}, filename={file.filename}")
    try:
        if not file.filename:
            raise HTTPException(status_code=400, detail="No file provided")
        
        # Read file content as binary
        content = await file.read()
        resume_text = None
        
        if file.filename.lower().endswith('.pdf'):
            from io import BytesIO
            import PyPDF2
            reader = PyPDF2.PdfReader(BytesIO(content))
            resume_text = ""
            for page in reader.pages:
                resume_text += page.extract_text() or ""
        elif file.filename.lower().endswith('.docx'):
            from io import BytesIO
            import docx
            doc = docx.Document(BytesIO(content))
            resume_text = "\n".join([p.text for p in doc.paragraphs])
        else:
            # fallback for plain text
            resume_text = content.decode("utf-8", errors="ignore")
        
        # Parse resume using CrewAIService
        result = await _require(crew_ai_service, "crew_ai_service").analyze_resume(resume_text, detailed=False)
        serializable_result = make_json_serializable(result)
        logger.info(f"Successfully parsed resume for user_id={user_id}")
        return JSONResponse(content=serializable_result)
        
    except Exception as e:
        logger.error(f"Error parsing resume for user_id={user_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/resume-insights")
async def get_resume_insights(request: ResumeInsightsRequest):
    """Get detailed resume insights and analysis"""
    try:
        result = await crew_ai_service.analyze_resume(
            request.resume_text, 
            detailed=request.detailed, 
            job_description=request.job_description
        )
        
        return JSONResponse(content=result)
        
    except Exception as e:
        logger.error(f"Error getting resume insights: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/analyze-resume")
async def analyze_resume_alias(request: ResumeInsightsRequest):
    """Backward-compatible alias for resume analysis."""
    return await get_resume_insights(request)

@app.post("/api/ats-resume")
async def generate_ats_resume(request: ATSResumeRequest):
    """Generate ATS-optimized resume for a specific job"""
    try:
        result = await crew_ai_service.optimize_resume_for_ats(
            request.resume_content,
            request.job_description,
            request.target_score
        )
        
        return JSONResponse(content=result)
        
    except Exception as e:
        logger.error(f"Error generating ATS resume: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/ats-optimize")
async def optimize_ats_alias(request: ATSResumeRequest):
    """Backward-compatible alias for ATS optimization."""
    return await generate_ats_resume(request)

@app.post("/api/chat")
async def chat_with_mentor(request: ChatRequest):
    """Get personalized career advice and answer questions"""
    try:
        result = await crew_ai_service.get_career_advice(
            request.question,
            request.user_context
        )
        serializable_result = make_json_serializable(result)
        return JSONResponse(content={"response": serializable_result})
    except Exception as e:
        logger.error(f"Error in chat: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/scheduler/setup")
async def setup_scheduler(request: SchedulerSetupRequest):
    """Setup automated job search scheduler"""
    try:
        scheduler_id = await _require(scheduler_agent, "scheduler").setup_scheduler(
            request.user_id,
            request.schedule_type,
            request.search_criteria
        )
        
        return JSONResponse(content={
            "scheduler_id": scheduler_id,
            "status": "setup_complete"
        })
        
    except Exception as e:
        logger.error(f"Error setting up scheduler: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/scheduler/{scheduler_id}/status")
async def get_scheduler_status(scheduler_id: str):
    """Get scheduler status"""
    try:
        status = await _require(scheduler_agent, "scheduler").get_scheduler_status(scheduler_id)
        return JSONResponse(content=status)
        
    except Exception as e:
        logger.error(f"Error getting scheduler status: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/scheduler/{scheduler_id}/run")
async def run_scheduler(scheduler_id: str):
    """Run a specific scheduler"""
    try:
        result = await _require(scheduler_agent, "scheduler").run_scheduler(scheduler_id)
        return JSONResponse(content=result)
        
    except Exception as e:
        logger.error(f"Error running scheduler: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/scheduler/{scheduler_id}")
async def delete_scheduler(scheduler_id: str):
    """Delete a scheduler"""
    try:
        success = await _require(scheduler_agent, "scheduler").delete_scheduler(scheduler_id)
        return JSONResponse(content={"deleted": success})
        
    except Exception as e:
        logger.error(f"Error deleting scheduler: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/search-jobs")
async def search_jobs(request: JobSearchRequest):
    """Search for jobs across multiple platforms"""
    try:
        aggregator = _require(job_aggregator, "job_aggregator")
        jobs = await aggregator.search_jobs(
            keywords=request.keywords,
            location=request.location,
            platforms=request.platforms,
            max_jobs=request.max_jobs
        )
        
        return {
            "status": "success",
            "total_jobs": len(jobs),
            "jobs": jobs,
            "search_criteria": {
                "keywords": request.keywords,
                "location": request.location,
                "platforms": request.platforms or ['linkedin', 'indeed', 'naukri', 'glassdoor', 'monster']
            }
        }
        
    except Exception as e:
        logger.error(f"Error searching jobs: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/ai/job/search")
async def search_jobs_legacy(request: JobSearchRequest):
    """Backward-compatible alias used by older backend integrations."""
    return await search_jobs(request)

@app.post("/api/job-matches")
async def get_job_matches(request: JobSearchRequest):
    """Get job matches with AI analysis"""
    try:
        # Search for jobs
        jobs = await job_aggregator.search_jobs(
            keywords=request.keywords,
            location=request.location,
            platforms=request.platforms,
            max_jobs=request.max_jobs
        )
        
        # Analyze matches using AI
        matches = []
        for job in jobs:
            # Extract skills from job description
            job_skills = extract_skills_from_description(job.get('description', ''))
            
            # Calculate match score (simplified for demo)
            match_score = calculate_match_score(request.keywords, job_skills)
            
            job['match_score'] = match_score
            job['skills_required'] = job_skills
            matches.append(job)
        
        # Sort by match score
        matches.sort(key=lambda x: x.get('match_score', 0), reverse=True)
        
        return {
            "status": "success",
            "total_matches": len(matches),
            "matches": matches
        }
        
    except Exception as e:
        logger.error(f"Error getting job matches: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/enhanced-job-matches")
async def get_enhanced_job_matches(request: dict):
    """Get enhanced AI-powered job matches with multiple algorithms"""
    try:
        # Extract user profile data
        user_profile_data = request.get('userProfile', {})
        available_jobs = request.get('availableJobs', [])
        match_types = request.get('matchTypes', ['SKILLS_BASED', 'SEMANTIC_BASED', 'CAREER_GROWTH'])
        limit = request.get('limit', 50)
        
        # Convert to UserProfile object (simplified)
        from app.services.enhanced_job_matcher import UserProfile, MatchType
        
        user_profile = UserProfile(
            user_id=user_profile_data.get('userId', ''),
            skills=user_profile_data.get('skills', []),
            experience_years=user_profile_data.get('experienceYears', 0),
            education_level=user_profile_data.get('educationLevel', ''),
            preferred_locations=user_profile_data.get('preferredLocations', []),
            preferred_salary_range=tuple(user_profile_data.get('preferredSalaryRange', [0, 200000])),
            career_goals=user_profile_data.get('careerGoals', []),
            work_preferences=user_profile_data.get('workPreferences', {}),
            resume_text=user_profile_data.get('resumeText', ''),
            job_history=user_profile_data.get('jobHistory', []),
            certifications=user_profile_data.get('certifications', []),
            languages=user_profile_data.get('languages', []),
            current_role=user_profile_data.get('currentRole')
        )
        
        # Convert match types
        match_type_enums = []
        for match_type in match_types:
            try:
                match_type_enums.append(MatchType(match_type.lower()))
            except ValueError:
                continue
        
        # Get enhanced matches
        matches = await _require(enhanced_job_matcher, "enhanced_job_matcher").find_matches(
            user_profile=user_profile,
            available_jobs=available_jobs,
            match_types=match_type_enums,
            limit=limit
        )
        
        # Convert matches to serializable format
        serializable_matches = []
        for match in matches:
            match_dict = {
                'jobId': match.job_id,
                'jobTitle': match.job_title,
                'company': match.company,
                'location': match.location,
                'matchScore': match.match_score,
                'confidence': match.confidence,
                'matchReasons': match.match_reasons,
                'missingSkills': match.missing_skills,
                'growthPotential': match.growth_potential,
                'salaryRange': match.salary_range,
                'matchType': match.match_type.value if match.match_type else 'unknown',
                'applicationDifficulty': match.application_difficulty,
                'successProbability': match.success_probability,
                'careerAdvancementScore': match.career_advancement_score,
                'metadata': match.metadata
            }
            serializable_matches.append(match_dict)
        
        return {
            "status": "success",
            "totalMatches": len(serializable_matches),
            "matches": serializable_matches,
            "algorithmUsed": "enhanced_multi_algorithm",
            "processingTime": "fast",
            "confidence": "high"
        }
        
    except Exception as e:
        logger.error(f"Error in enhanced job matching: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/job-aggregator/search")
async def job_aggregator_search(request: dict):
    """Enhanced job aggregator search with filters"""
    try:
        # Extract search parameters
        keywords = request.get('keywords', '')
        location = request.get('location', '')
        platform = request.get('platform', 'all')
        job_type = request.get('jobType', 'all')
        experience_level = request.get('experienceLevel', 'all')
        remote = request.get('remote', False)
        sort_by = request.get('sortBy', 'relevance')
        
        # Convert platform filter
        platforms = None
        if platform != 'all':
            platforms = [platform]
        else:
            platforms = ['linkedin', 'indeed', 'naukri', 'glassdoor', 'monster']
        
        # Search jobs
        jobs = await job_aggregator.search_jobs(
            keywords=[keywords] if keywords else ['software engineer'],
            location=location or 'Remote',
            platforms=platforms,
            max_jobs=50
        )
        
        # Apply additional filters
        filtered_jobs = []
        for job in jobs:
            # Filter by job type
            if job_type != 'all' and job_type not in job.get('title', '').lower():
                continue
                
            # Filter by remote preference
            if remote and not job.get('is_remote', False):
                continue
                
            # Filter by experience level
            if experience_level != 'all':
                job_desc = job.get('description', '').lower()
                if experience_level == 'entry' and any(term in job_desc for term in ['senior', 'lead', 'manager']):
                    continue
                elif experience_level == 'senior' and not any(term in job_desc for term in ['senior', 'lead', 'experienced']):
                    continue
            
            filtered_jobs.append(job)
        
        # Sort results
        if sort_by == 'date':
            filtered_jobs.sort(key=lambda x: x.get('posted_date', ''), reverse=True)
        elif sort_by == 'salary':
            filtered_jobs.sort(key=lambda x: extract_salary_number(x.get('salary_range', '')), reverse=True)
        elif sort_by == 'match_score':
            filtered_jobs.sort(key=lambda x: x.get('match_score', 0), reverse=True)
        
        return {
            "status": "success",
            "total_jobs": len(filtered_jobs),
            "jobs": filtered_jobs[:20],  # Limit to 20 for performance
            "filters_applied": {
                "platform": platform,
                "job_type": job_type,
                "experience_level": experience_level,
                "remote": remote,
                "sort_by": sort_by
            }
        }
        
    except Exception as e:
        logger.error(f"Error in job aggregator search: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/job-aggregator/stats")
async def job_aggregator_stats(keywords: str = None, location: str = None):
    """Get job aggregator statistics"""
    try:
        # Get sample data for stats (in production, this would be cached)
        platforms_stats = {
            "linkedin": 42,
            "indeed": 38,
            "naukri": 25,
            "glassdoor": 15,
            "monster": 12
        }
        
        return {
            "status": "success",
            "total_jobs": sum(platforms_stats.values()),
            "platforms": platforms_stats,
            "top_locations": ["Bangalore", "Mumbai", "Delhi", "Remote"],
            "top_companies": ["Google", "Microsoft", "Amazon", "Flipkart", "Zomato"],
            "salary_ranges": {
                "entry": "₹3-8 LPA",
                "mid": "₹8-15 LPA", 
                "senior": "₹15-30 LPA"
            },
            "trending_skills": ["React", "Node.js", "Python", "AWS", "Docker"]
        }
        
    except Exception as e:
        logger.error(f"Error getting job aggregator stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/market-intelligence/insights")
async def market_intelligence_insights(request: dict):
    """Get market intelligence insights"""
    job_title = request.get('jobTitle', '')
    location = request.get('location', '')
    industry = request.get('industry', '')

    try:
        # Use market intelligence service (heuristic-safe: see CrewAIService.get_market_intelligence)
        raw_intel = await _require(market_intelligence, "market_intelligence").get_intelligence(job_title, location)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting market insights: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    # No live LLM/market-data provider is configured in this deployment, so these
    # figures are heuristics derived from the request itself, not a live feed —
    # label honestly rather than presenting them as measured market data.
    is_sample_data = not isinstance(raw_intel, dict) or bool(raw_intel.get("heuristic", True))

    title_lower = job_title.lower()
    hot_role_terms = ['software', 'engineer', 'developer', 'data', 'ai', 'ml', 'cloud', 'security', 'devops']
    is_hot_role = any(term in title_lower for term in hot_role_terms)
    is_senior = any(term in title_lower for term in ['senior', 'lead', 'staff', 'principal', 'manager', 'head'])
    matched_skills = extract_skills_from_description(f"{job_title} {industry}") if (job_title or industry) else []

    now_iso = datetime.now().isoformat()
    insights = [
        {
            "category": "demand",
            "title": "Hiring Demand Signal",
            "value": "High" if is_hot_role else ("Moderate" if job_title else "Unknown"),
            "change": "+8%" if is_hot_role else None,
            "trend": "up" if is_hot_role else "stable",
            "confidence": 0.55 if is_hot_role else 0.35,
            "source": "Heuristic estimate — no live LLM/market data provider configured",
            "lastUpdated": now_iso,
        },
        {
            "category": "skills",
            "title": "Skills Referenced in Role",
            "value": ", ".join(matched_skills) if matched_skills else "Not enough data",
            "change": None,
            "trend": "stable",
            "confidence": 0.5 if matched_skills else 0.2,
            "source": "Keyword match against job title/industry",
            "lastUpdated": now_iso,
        },
        {
            "category": "seniority",
            "title": "Seniority Signal",
            "value": "Senior-track" if is_senior else "Open to multiple levels",
            "change": None,
            "trend": "stable",
            "confidence": 0.3,
            "source": "Heuristic estimate based on job title wording",
            "lastUpdated": now_iso,
        },
        {
            "category": "location",
            "title": "Location Focus",
            "value": location or "Not specified",
            "change": None,
            "trend": "stable",
            "confidence": 0.3,
            "source": "Based on your search filters",
            "lastUpdated": now_iso,
        },
    ]

    return {
        "status": "success",
        "insights": insights,
        "job_title": job_title,
        "location": location,
        "industry": industry,
        "isSampleData": is_sample_data,
    }

@app.post("/api/market-intelligence/salary")
async def market_intelligence_salary(request: dict):
    """Get salary analysis.

    No live salary-data provider is wired up in this deployment, so figures below
    are heuristic USD estimates derived from experience level / role / location —
    not a live feed. Response is marked isSampleData=True and shaped to match the
    market-intelligence.tsx frontend (salaryRange/marketDemand/growthProjection/
    topSkills/competitorSalaries), not the previous ad-hoc snake_case/INR shape
    which didn't match what the UI reads and was rendered with a hardcoded "$".
    """
    try:
        job_title = request.get('jobTitle', '')
        location = request.get('location', '')
        experience_level = (request.get('experienceLevel', '') or 'mid').lower()

        base_ranges = {
            'entry': (60000, 85000),
            'mid': (85000, 130000),
            'senior': (130000, 190000),
            'executive': (190000, 280000),
        }
        low, high = base_ranges.get(experience_level, base_ranges['mid'])

        title_lower = job_title.lower()
        if any(term in title_lower for term in ['senior', 'lead', 'staff', 'principal', 'head']):
            low, high = int(low * 1.15), int(high * 1.2)

        loc_lower = location.lower()
        high_cost_hubs = ['san francisco', 'new york', 'seattle', 'boston', 'los angeles', 'zurich', 'london']
        if any(hub in loc_lower for hub in high_cost_hubs):
            low, high = int(low * 1.25), int(high * 1.3)
        elif 'remote' in loc_lower:
            low, high = int(low * 0.95), int(high * 1.0)

        median = int((low + high) / 2)

        hot_role_terms = ['software', 'engineer', 'developer', 'data', 'ai', 'ml', 'cloud', 'security', 'devops']
        is_hot_role = any(term in title_lower for term in hot_role_terms)
        market_demand = 'high' if is_hot_role else ('medium' if job_title else 'low')
        growth_projection = "+8% YoY projected demand growth" if is_hot_role else "+3% YoY projected demand growth"

        top_skills = extract_skills_from_description(f"{job_title}") if job_title else []
        if len(top_skills) < 3:
            top_skills = list(dict.fromkeys(top_skills + ["Communication", "Problem Solving", "Domain Expertise"]))[:5]

        benchmark_companies = ["Google", "Microsoft", "Amazon"]
        competitor_salaries = []
        for idx, company in enumerate(benchmark_companies):
            mult_low = 1.05 + idx * 0.1
            mult_high = 1.2 + idx * 0.1
            competitor_salaries.append({
                "company": company,
                "range": f"${int(low * mult_low):,} - ${int(high * mult_high):,}",
                "benefits": ["Health insurance", "Equity/RSUs", "Remote flexibility"][:2],
            })

        return {
            "status": "success",
            "jobTitle": job_title,
            "location": location,
            "experienceLevel": experience_level,
            "salaryRange": {
                "min": low,
                "max": high,
                "median": median,
                "currency": "USD",
            },
            "marketDemand": market_demand,
            "growthProjection": growth_projection,
            "topSkills": top_skills,
            "competitorSalaries": competitor_salaries,
            "isSampleData": True,
            "note": "Heuristic estimate — no live salary data provider configured.",
        }

    except Exception as e:
        logger.error(f"Error getting salary analysis: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/market-intelligence/skills")
async def market_intelligence_skills(request: dict):
    """Get skills gap analysis.

    Shaped to match market-intelligence.tsx (currentSkills/inDemandSkills/skillGaps
    with skill/importance/learningPath/timeToAcquire/resources, plus an optional
    careerProgression block) — the previous snake_case shape (current_skills/
    required_skills/skill_gaps with skill/demand/learning_resources) didn't match
    any of the fields the page actually reads. No live skills-demand feed is wired
    up, so the in-demand list is derived from keyword matching against the job
    title, not measured data — marked isSampleData.
    """
    try:
        job_title = request.get('jobTitle', '')
        current_skills = request.get('currentSkills', []) or []
        current_lower = {s.lower() for s in current_skills}

        in_demand_pool = ["React", "Node.js", "JavaScript", "TypeScript", "AWS", "Python", "Docker", "Kubernetes"]
        matched = [s for s in in_demand_pool if s.lower() in job_title.lower()]
        in_demand_skills = list(dict.fromkeys(matched + in_demand_pool))[:6]

        missing_skills = [s for s in in_demand_skills if s.lower() not in current_lower]

        importance_cycle = ["High", "High", "Medium", "Medium", "Low"]
        skill_gaps = []
        for i, skill in enumerate(missing_skills[:5]):
            skill_gaps.append({
                "skill": skill,
                "importance": importance_cycle[i % len(importance_cycle)],
                "learningPath": f"Learn {skill} fundamentals, then apply it in a small project",
                "timeToAcquire": "4-8 weeks",
                "resources": [f"{skill} official documentation", "Structured online course"],
            })

        career_progression = None
        if job_title:
            is_senior = any(t in job_title.lower() for t in ['senior', 'lead', 'staff', 'principal'])
            career_progression = {
                "currentLevel": job_title if not is_senior else f"Senior {job_title}",
                "nextLevel": f"Senior {job_title}" if not is_senior else f"Lead {job_title}",
                "timeframe": "12-18 months",
                "salaryIncrease": "+15-25%",
            }

        return {
            "status": "success",
            "jobTitle": job_title,
            "currentSkills": current_skills,
            "inDemandSkills": in_demand_skills,
            "missingSkills": missing_skills,
            "skillGaps": skill_gaps,
            "careerProgression": career_progression,
            "recommendations": [
                "Focus on the highest-importance skill gaps first",
                "Pair new skills with a portfolio project to demonstrate them",
                "Revisit this analysis after updating your resume",
            ],
            "isSampleData": True,
            "note": "Heuristic estimate derived from your input — no live skills-demand data provider configured.",
        }

    except Exception as e:
        logger.error(f"Error getting skills analysis: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/market-intelligence/companies")
async def market_intelligence_companies(request: dict):
    """Get company insights.

    Shaped to match market-intelligence.tsx (companyName/industry/size/
    culture.{workLifeBalance,careerGrowth,compensation}/responseRate/
    interviewDifficulty/hiringTrends/openPositions) — the previous shape used
    `company`/snake_case fields and a plain culture *string*, none of which the
    page reads, and every company got byte-identical stats. No live company-data
    provider is wired up, so figures are a deterministic per-company heuristic
    (not measured), and every company is no longer identical — marked isSampleData.
    """
    try:
        companies = request.get('companies', []) or []

        difficulty_levels = ["easy", "medium", "hard"]
        hiring_states = ["growing", "stable", "growing", "stable", "declining"]
        industries = ["Technology", "E-commerce", "FinTech", "HealthTech", "Consulting"]
        sizes = ["1,000-5,000 employees", "5,000-10,000 employees", "10,000+ employees", "500-1,000 employees"]

        company_insights = []
        for company in companies:
            # Deterministic per-company variation so different companies don't
            # all render identical placeholder numbers.
            seed = sum(ord(c) for c in company) if company else 0
            company_insights.append({
                "companyName": company,
                "industry": industries[seed % len(industries)],
                "size": sizes[seed % len(sizes)],
                "culture": {
                    "workLifeBalance": round(3.0 + (seed % 20) / 10, 1),
                    "careerGrowth": round(3.0 + ((seed // 3) % 20) / 10, 1),
                    "compensation": round(3.0 + ((seed // 7) % 20) / 10, 1),
                },
                "responseRate": f"{40 + (seed % 40)}%",
                "interviewDifficulty": difficulty_levels[seed % len(difficulty_levels)],
                "hiringTrends": hiring_states[seed % len(hiring_states)],
                "openPositions": 5 + (seed % 50),
            })

        return {
            "status": "success",
            "companies": company_insights,
            "isSampleData": True,
            "note": "Heuristic estimate — no live company-data provider (e.g. Glassdoor API) configured.",
        }

    except Exception as e:
        logger.error(f"Error getting company insights: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/market-intelligence/trends")
async def market_intelligence_trends(request: dict):
    """Get market trends analysis.

    Shaped to match market-intelligence.tsx (industryTrends[]/remoteWorkTrends/
    futureOutlook) — the previous shape (market_trends/industry_insights, all
    snake_case) matched none of the fields the page reads, so the Trends tab
    rendered nothing. No live trends feed is wired up, so figures are a fixed
    heuristic — marked isSampleData.
    """
    try:
        job_title = request.get('jobTitle', '')
        location = request.get('location', '')

        title_lower = job_title.lower()
        is_tech_role = any(t in title_lower for t in ['software', 'engineer', 'developer', 'devops', 'cloud'])
        is_data_role = any(t in title_lower for t in ['data', 'ml', 'ai', 'analyst', 'scientist'])

        if is_data_role:
            industry_trends = [
                {"trend": "Rising demand for AI/ML specialists", "impact": "high", "timeframe": "Next 12-24 months",
                 "affectedRoles": ["Data Scientist", "ML Engineer", "AI Engineer"]},
                {"trend": "Growth in data governance and MLOps", "impact": "medium", "timeframe": "Next 12 months",
                 "affectedRoles": ["Data Engineer", "MLOps Engineer"]},
            ]
        elif is_tech_role:
            industry_trends = [
                {"trend": "Continued adoption of cloud-native architectures", "impact": "high", "timeframe": "Next 12-24 months",
                 "affectedRoles": ["Software Engineer", "DevOps Engineer", "SRE"]},
                {"trend": "AI-assisted development tooling becoming standard", "impact": "medium", "timeframe": "Next 12 months",
                 "affectedRoles": ["Software Engineer", "Full Stack Developer"]},
            ]
        else:
            industry_trends = [
                {"trend": "Hybrid and remote work remains standard for knowledge roles", "impact": "medium", "timeframe": "Ongoing",
                 "affectedRoles": [job_title] if job_title else ["Most knowledge-work roles"]},
            ]

        return {
            "status": "success",
            "jobTitle": job_title,
            "location": location,
            "industryTrends": industry_trends,
            "remoteWorkTrends": {
                "remotePercentage": 35,
                "hybridPercentage": 40,
                "onsitePercentage": 25,
                "salaryImpact": "Remote roles trend roughly on par with hybrid; fully onsite can command a modest premium in some markets",
                "locationFlexibility": "Increasingly common for this type of role" if (is_tech_role or is_data_role) else "Varies by employer",
            },
            "futureOutlook": {
                "jobGrowth": "Above-average projected growth" if (is_tech_role or is_data_role) else "Stable projected growth",
                "automationRisk": "low" if (is_tech_role or is_data_role) else "medium",
                "newRoleEmergence": ["AI/ML Engineer", "Platform Engineer", "Data Governance Lead"] if is_data_role else
                                    ["Platform Engineer", "AI-assisted Developer", "Site Reliability Engineer"] if is_tech_role else
                                    ["AI-augmented roles in this field"],
            },
            "isSampleData": True,
            "note": "Heuristic estimate — no live labor-market trends provider configured.",
        }

    except Exception as e:
        logger.error(f"Error getting trends analysis: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/career-mentor/chat")
async def career_mentor_chat(request: dict):
    """Career mentor chat endpoint.

    `resources` must be an array of {type,title,description} objects — the
    frontend renders `resource.type` / `resource.title` / `resource.description`
    on each entry (career-mentor.tsx). The previous response sent plain strings
    there, so every resource line silently rendered as three blank fields.
    """
    try:
        message = request.get('message', '')

        # Use career mentor service (already has an honest heuristic fallback —
        # see CrewAIService.get_career_advice — when no LLM is configured).
        response = await career_mentor.get_advice(message, {})

        return {
            "status": "success",
            "response": response,
            "mentorPersonality": "supportive",
            "actionItems": [
                "Update your resume with quantified, specific achievements",
                "Set up alerts for roles matching your target skills",
            ],
            "resources": [
                {
                    "type": "Article",
                    "title": "Career development fundamentals",
                    "description": "General guidance on planning and advancing your career",
                },
                {
                    "type": "Course",
                    "title": "Online skill-building courses",
                    "description": "Structured learning to help close skill gaps for your target role",
                },
            ],
            "followUpQuestions": ["What specific skills do you want to develop?"],
        }

    except Exception as e:
        logger.error(f"Error in career mentor chat: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/career-mentor/career-plan")
async def career_mentor_plan(request: dict):
    """Generate career development plan.

    Shaped to match career-mentor.tsx's CareerGoal interface (title/description/
    targetDate/status/progress/milestones[{title,description,priority,completed}]).
    The previous shape (goal/timeline/milestones-as-plain-strings, no status field)
    crashed the Career Plan tab: the frontend unconditionally calls
    `goal.status.replace('_', ' ')`, which throws on `undefined`.
    """
    try:
        goals = request.get('goals', [])

        priority_cycle = ["high", "medium", "low"]
        career_plan = []
        for i, goal in enumerate(goals):
            plan_item = {
                "id": i + 1,
                "title": goal,
                "description": f"Plan to achieve: {goal}",
                "targetDate": (datetime.now() + timedelta(days=120)).isoformat(),
                "status": "not_started",
                "progress": 0,
                "milestones": [
                    {
                        "title": f"Research {goal} requirements",
                        "description": "Understand what's needed and set a concrete plan",
                        "priority": priority_cycle[0],
                        "completed": False,
                    },
                    {
                        "title": f"Build skills toward {goal}",
                        "description": "Complete relevant training or hands-on practice",
                        "priority": priority_cycle[1],
                        "completed": False,
                    },
                    {
                        "title": f"Apply progress toward {goal}",
                        "description": "Put new skills into practice in a real project or application",
                        "priority": priority_cycle[2],
                        "completed": False,
                    },
                ],
            }
            career_plan.append(plan_item)

        return career_plan

    except Exception as e:
        logger.error(f"Error generating career plan: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/career-mentor/gap-analysis")
async def career_mentor_gap_analysis():
    """Get skills gap analysis.

    Shaped to match career-mentor.tsx, which reads `gapAnalysis.skillGaps`,
    `.experienceGaps`, and `.recommendations` as plain string arrays with NO
    optional chaining (`gapAnalysis.skillGaps.length`) — the previous response
    had none of those keys (skill_gaps was snake_case AND an array of objects,
    not strings; experienceGaps didn't exist at all), so `.length` on `undefined`
    threw and crashed the Gap Analysis tab.

    This endpoint takes no user/profile input, so it can only return a generic
    placeholder — marked isSampleData rather than presented as a personalized
    analysis of the viewer's actual resume/applications.
    """
    try:
        return {
            "currentLevel": "Mid-level Developer",
            "targetLevel": "Senior Developer",
            "skillGaps": ["System Design", "Leadership", "Advanced Cloud Architecture"],
            "experienceGaps": ["Leading cross-functional projects", "Mentoring junior engineers"],
            "recommendations": [
                "Study system design patterns",
                "Lead a small project team",
                "Take on mentoring responsibilities",
            ],
            "isSampleData": True,
            "note": "Generic placeholder — connect your resume and job history for a personalized gap analysis.",
        }

    except Exception as e:
        logger.error(f"Error getting gap analysis: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/career-mentor/interview-prep")
async def career_mentor_interview_prep(request: dict):
    """Generate interview preparation materials.

    Shaped to match career-mentor.tsx (commonQuestions/companySpecificQuestions/
    situationalQuestions/preparationTips/optional mockAnswerExamples) — the
    previous response used common_questions/technical_questions/company_insights
    (none of which the page reads), so every rendered card was empty. It also
    invented specific "facts" about whatever real company name was passed in
    (e.g. a hardcoded "IPO announcement" for any company, including "Google") and
    presented them as insight — dropped in favor of generic, honestly-generic
    prep content plus questions that are genuinely derived from the user's input
    (job title / company name) rather than fabricated facts about that company.
    """
    try:
        job_title = request.get('jobTitle', '') or 'this role'
        company = request.get('company', '') or 'this company'

        common_questions = [
            "Tell me about yourself.",
            f"Why do you want to work as a {job_title}?",
            "What's your biggest weakness, and how are you working on it?",
            "Where do you see yourself in five years?",
        ]

        company_specific_questions = [
            f"Why do you want to work at {company}?",
            f"What do you know about {company}'s products or mission?",
            f"How would you contribute to {company}'s team as a {job_title}?",
        ]

        situational_questions = [
            "Tell me about a time you disagreed with a teammate or manager. How did you handle it?",
            "Describe a project that didn't go as planned. What did you learn?",
            "Tell me about a time you had to learn something new quickly under pressure.",
        ]

        preparation_tips = [
            f"Research {company}'s recent public news, products, and engineering blog before the interview.",
            f"Prepare 2-3 concrete examples that demonstrate skills relevant to a {job_title} role.",
            "Practice answers using the STAR method (Situation, Task, Action, Result).",
            "Prepare a few thoughtful questions to ask the interviewer.",
        ]

        return {
            "jobTitle": job_title,
            "company": company,
            "commonQuestions": common_questions,
            "companySpecificQuestions": company_specific_questions,
            "situationalQuestions": situational_questions,
            "preparationTips": preparation_tips,
            "isSampleData": True,
            "note": "Generic, role-aware prep content — not sourced from live company data.",
        }

    except Exception as e:
        logger.error(f"Error generating interview prep: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/generate-cover-letter")
async def generate_cover_letter(request: CoverLetterRequest):
    """Generate personalized cover letter"""
    try:
        # Extract skills from resume content (simplified)
        skills = extract_skills_from_description(request.resume_content)
        
        # Generate cover letter using CrewAIService
        cover_letter = await crew_ai_service.generate_cover_letter(
            job_title=request.job_title,
            company=request.company_name,
            user_skills=skills,
            resume_summary=request.resume_content,
            tone="professional"
        )
        
        return JSONResponse(content={
            "cover_letter": cover_letter,
            "job_title": request.job_title,
            "company": request.company_name,
            "generated_at": datetime.now().isoformat()
        })
        
    except Exception as e:
        logger.error(f"Error generating cover letter: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/optimize-resume")
async def optimize_resume(request: ATSOptimizationRequest):
    """Optimize resume for ATS systems"""
    try:
        # Use CrewAIService for ATS optimization
        result = await crew_ai_service.optimize_resume_for_ats(
            resume_content=request.resume_content,
            job_description=request.job_description,
            target_score=80
        )
        
        return JSONResponse(content=result)
        
    except Exception as e:
        logger.error(f"Error optimizing resume: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/career-advice")
async def get_career_advice(request: CareerAdviceRequest):
    """Get personalized career advice"""
    try:
        # Create a comprehensive question for career advice
        question = f"""
        I am a {request.current_role} with {request.experience_years} years of experience.
        My skills include: {', '.join(request.skills)}
        My career goals are: {request.career_goals}
        
        Please provide personalized career advice and recommendations.
        """
        
        # Get advice using CrewAIService
        advice = await crew_ai_service.get_career_advice(question)
        
        return JSONResponse(content={
            "advice": advice,
            "current_role": request.current_role,
            "experience_years": request.experience_years,
            "skills": request.skills,
            "career_goals": request.career_goals,
            "generated_at": datetime.now().isoformat()
        })
        
    except Exception as e:
        logger.error(f"Error getting career advice: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/auto-apply")
async def auto_apply_job(request: AutoApplyRequest):
    """Automatically apply to a job"""
    try:
        result = await _require(auto_apply_agent, "auto_apply").apply_to_job(
            job_id=request.job_id,
            resume_content=request.resume_content,
            cover_letter=request.cover_letter,
            platform=request.platform
        )
        
        return JSONResponse(content=result)
        
    except Exception as e:
        logger.error(f"Error auto-applying to job: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/schedule-interview")
async def schedule_interview(request: SchedulingRequest):
    """Schedule interview using AI agent"""
    try:
        result = await _require(scheduler_agent, "scheduler").schedule_interview(
            user_id=request.user_id,
            interview_type=request.interview_type,
            preferred_dates=request.preferred_dates,
            timezone=request.timezone
        )

        return JSONResponse(content=result)

    except HTTPException:
        # Preserve _require()'s 503 (dependency unavailable) instead of masking it
        # as a 500 — the bare `except Exception` below was swallowing it.
        raise
    except Exception as e:
        logger.error(f"Error scheduling interview: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/market-intelligence")
async def get_market_intelligence(request: MarketIntelligenceRequest):
    """Get market intelligence for job role.

    NOTE: this older, more generic endpoint is not called by the frontend (which
    uses the more specific /api/market-intelligence/insights,/salary,/skills,
    /companies,/trends endpoints above) and isn't referenced by any Java backend
    caller either — kept for backward compatibility with any external consumer,
    left functionally as-is beyond the same 503-vs-500 fix applied elsewhere.
    """
    try:
        # get_intelligence() only accepts (job_title, location) — request.industry
        # has no effect here; this mirrors the pre-existing behavior of this
        # catch-all endpoint (see market_intelligence.py) and is out of scope to
        # change further since nothing currently calls this endpoint.
        result = await _require(market_intelligence, "market_intelligence").get_intelligence(
            job_title=request.job_title,
            location=request.location,
        )

        return JSONResponse(content=result)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting market intelligence: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/platforms")
async def get_available_platforms():
    """Get list of available job platforms"""
    return {
        "platforms": [
            {
                "name": "LinkedIn",
                "id": "linkedin",
                "description": "Professional networking and job platform",
                "features": ["Professional networking", "Company insights", "Salary information"]
            },
            {
                "name": "Indeed",
                "id": "indeed",
                "description": "World's largest job site",
                "features": ["Global job listings", "Salary data", "Company reviews"]
            },
            {
                "name": "Naukri",
                "id": "naukri",
                "description": "Leading Indian job portal",
                "features": ["Indian job market", "Regional focus", "Local companies"]
            },
            {
                "name": "Glassdoor",
                "id": "glassdoor",
                "description": "Job search and company reviews",
                "features": ["Company reviews", "Salary insights", "Interview experiences"]
            },
            {
                "name": "Monster",
                "id": "monster",
                "description": "Global job search platform",
                "features": ["Global reach", "Career resources", "Job alerts"]
            }
        ]
    }

@app.post("/api/advanced-auto-apply")
async def advanced_auto_apply_job(request: AdvancedAutoApplyRequest):
    """Apply to a job using advanced browser automation"""
    try:
        result = await _require(advanced_auto_apply_agent, "advanced_auto_apply").apply_to_job(
            job_url=request.job_url,
            platform=request.platform,
            user_credentials=request.user_credentials,
            resume_path=request.resume_path,
            cover_letter=request.cover_letter
        )
        
        return JSONResponse(content=result)
        
    except Exception as e:
        logger.error(f"Error in advanced auto-apply: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/schedule/job-search")
async def create_job_search_schedule(request: ScheduleConfigRequest):
    """Create a new job search schedule"""
    try:
        schedule_result = await _require(scheduler_agent, "scheduler").create_job_search_schedule(
            user_id=request.user_id,
            schedule_config=request.dict()
        )
        
        return JSONResponse(content=schedule_result)
        
    except Exception as e:
        logger.error(f"Error creating job search schedule: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/schedule/auto-apply")
async def create_auto_apply_schedule(request: AutoApplyScheduleRequest):
    """Create a new auto-apply schedule"""
    try:
        schedule_result = await _require(scheduler_agent, "scheduler").create_auto_apply_schedule(
            user_id=request.user_id,
            schedule_config=request.dict()
        )
        
        return JSONResponse(content=schedule_result)
        
    except Exception as e:
        logger.error(f"Error creating auto-apply schedule: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/schedule/user/{user_id}")
async def get_user_schedules(user_id: str):
    """Get all schedules for a user"""
    try:
        schedules = await _require(scheduler_agent, "scheduler").get_user_schedules(user_id)
        return JSONResponse(content={"schedules": schedules})
        
    except Exception as e:
        logger.error(f"Error getting user schedules: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/schedule/{schedule_id}/status")
async def get_schedule_status(schedule_id: str):
    """Backward-compatible schedule status endpoint."""
    try:
        status = await _require(scheduler_agent, "scheduler").get_scheduler_status(schedule_id)
        return JSONResponse(content=status)
    except Exception as e:
        logger.error(f"Error getting schedule status: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/schedule/{schedule_id}/pause")
async def pause_schedule(schedule_id: str):
    """Pause a specific schedule"""
    try:
        result = await _require(scheduler_agent, "scheduler").pause_schedule(schedule_id)
        return JSONResponse(content={"success": result})
        
    except Exception as e:
        logger.error(f"Error pausing schedule: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/schedule/{schedule_id}/resume")
async def resume_schedule(schedule_id: str):
    """Resume a paused schedule"""
    try:
        result = await _require(scheduler_agent, "scheduler").resume_schedule(schedule_id)
        return JSONResponse(content={"success": result})
        
    except Exception as e:
        logger.error(f"Error resuming schedule: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/schedule/{schedule_id}")
async def delete_schedule(schedule_id: str):
    """Delete a schedule permanently"""
    try:
        result = await _require(scheduler_agent, "scheduler").delete_schedule(schedule_id)
        return JSONResponse(content={"success": result})
        
    except Exception as e:
        logger.error(f"Error deleting schedule: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/schedule/stats")
async def get_schedule_statistics(user_id: Optional[str] = None):
    """Get schedule statistics"""
    try:
        stats = await _require(scheduler_agent, "scheduler").get_schedule_statistics(user_id)
        return JSONResponse(content=stats)
        
    except Exception as e:
        logger.error(f"Error getting schedule statistics: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Notification Endpoints
@app.post("/api/notifications/send")
async def send_notification(request: NotificationRequest):
    """Send a custom notification"""
    try:
        if request.notification_type == "job_search_results":
            result = await _require(notification_service, "notification").send_job_search_notification(
                user_id=request.user_id,
                jobs_found=request.data.get('jobs_found', 0),
                new_jobs=request.data.get('new_jobs', []),
                search_summary=request.data.get('search_summary', {})
            )
        elif request.notification_type == "application_success":
            result = await _require(notification_service, "notification").send_application_success_notification(
                user_id=request.user_id,
                application_data=request.data
            )
        elif request.notification_type == "error":
            result = await _require(notification_service, "notification").send_error_notification(
                user_id=request.user_id,
                error_type=request.data.get('error_type', 'Unknown Error'),
                error_message=request.data.get('error_message', '')
            )
        else:
            raise HTTPException(status_code=400, detail="Invalid notification type")
        
        return JSONResponse(content={"success": result})

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error sending notification: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/notifications/history/{user_id}")
async def get_notification_history(user_id: str, limit: int = 50):
    """Get notification history for a user"""
    try:
        history = await _require(notification_service, "notification").get_notification_history(user_id, limit)
        return JSONResponse(content={"notifications": history})

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting notification history: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/notifications/{notification_id}/read")
async def mark_notification_read(notification_id: str, user_id: str):
    """Mark a notification as read"""
    try:
        result = await _require(notification_service, "notification").mark_notification_as_read(user_id, notification_id)
        return JSONResponse(content={"success": result})

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error marking notification as read: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/notifications/stats/{user_id}")
async def get_notification_stats(user_id: str):
    """Get notification statistics for a user"""
    try:
        stats = await _require(notification_service, "notification").get_notification_stats(user_id)
        return JSONResponse(content=stats)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting notification stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/notifications/webhook")
async def notification_webhook(request: Dict[str, Any]):
    """Webhook endpoint for receiving notifications from external sources"""
    try:
        user_id = request.get('user_id')
        notification = request.get('notification')
        
        # Process webhook notification
        logger.info(f"Received webhook notification for user {user_id}")
        
        return JSONResponse(content={"status": "received"})
        
    except Exception as e:
        logger.error(f"Error processing webhook notification: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# WebSocket endpoint for real-time notifications
@app.websocket("/ws/notifications/{user_id}")
async def websocket_notifications(websocket: WebSocket, user_id: str):
    """WebSocket endpoint for real-time notifications"""
    await websocket.accept()
    
    try:
        # Register WebSocket connection
        await _require(notification_service, "notification").register_websocket_connection(user_id, websocket)
        
        while True:
            # Keep connection alive and handle incoming messages
            data = await websocket.receive_text()
            message = json.loads(data)
            
            if message.get('type') == 'ping':
                await websocket.send_text(json.dumps({'type': 'pong'}))
            
    except Exception as e:
        logger.error(f"WebSocket error for user {user_id}: {e}")
    finally:
        # Unregister WebSocket connection
        await _require(notification_service, "notification").unregister_websocket_connection(user_id)

# Enhanced Job Search with Auto-Apply
@app.post("/api/jobs/search-and-apply")
async def search_and_apply_jobs(request: JobSearchRequest):
    """Search for jobs and automatically apply to matching ones"""
    try:
        # Search for jobs
        jobs = await job_aggregator.search_jobs(
            keywords=request.keywords,
            location=request.location,
            platforms=request.platforms or ['linkedin', 'indeed', 'naukri'],
            max_jobs=request.max_jobs
        )
        
        # Filter jobs for auto-apply (high match score)
        auto_apply_jobs = [job for job in jobs if job.get('match_score', 0) >= 80]
        
        # Apply to top matching jobs (limit to 5 per request)
        applications_submitted = []
        for job in auto_apply_jobs[:5]:
            try:
                # This would use user's stored credentials and resume
                application_result = await _require(advanced_auto_apply_agent, "advanced_auto_apply").apply_to_job(
                    job_url=job.get('url'),
                    platform=job.get('platform'),
                    user_credentials={},  # Would fetch from user profile
                    resume_path="",  # Would fetch user's active resume
                    cover_letter=""  # Would generate based on job
                )
                
                if application_result.get('success'):
                    applications_submitted.append({
                        'job': job,
                        'application_result': application_result
                    })
                    
            except Exception as e:
                logger.error(f"Error auto-applying to job {job.get('id')}: {e}")
                continue
        
        return JSONResponse(content={
            "jobs_found": len(jobs),
            "auto_apply_candidates": len(auto_apply_jobs),
            "applications_submitted": len(applications_submitted),
            "jobs": jobs,
            "applications": applications_submitted
        })
        
    except Exception as e:
        logger.error(f"Error in search and apply: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Platform-specific Auto-Apply Endpoints
@app.post("/api/auto-apply/linkedin")
async def auto_apply_linkedin(request: AdvancedAutoApplyRequest):
    """Auto-apply specifically for LinkedIn jobs with optimized flow"""
    try:
        # Use LinkedIn-specific optimizations
        request.platform = "linkedin"
        
        result = await _require(advanced_auto_apply_agent, "advanced_auto_apply").apply_to_job(
            job_url=request.job_url,
            platform=request.platform,
            user_credentials=request.user_credentials,
            resume_path=request.resume_path,
            cover_letter=request.cover_letter
        )
        
        return JSONResponse(content=result)
        
    except Exception as e:
        logger.error(f"Error in LinkedIn auto-apply: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/auto-apply/indeed")
async def auto_apply_indeed(request: AdvancedAutoApplyRequest):
    """Auto-apply specifically for Indeed jobs with optimized flow"""
    try:
        request.platform = "indeed"
        
        result = await _require(advanced_auto_apply_agent, "advanced_auto_apply").apply_to_job(
            job_url=request.job_url,
            platform=request.platform,
            user_credentials=request.user_credentials,
            resume_path=request.resume_path,
            cover_letter=request.cover_letter
        )
        
        return JSONResponse(content=result)
        
    except Exception as e:
        logger.error(f"Error in Indeed auto-apply: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/auto-apply/naukri")
async def auto_apply_naukri(request: AdvancedAutoApplyRequest):
    """Auto-apply specifically for Naukri jobs with optimized flow"""
    try:
        request.platform = "naukri"
        
        result = await _require(advanced_auto_apply_agent, "advanced_auto_apply").apply_to_job(
            job_url=request.job_url,
            platform=request.platform,
            user_credentials=request.user_credentials,
            resume_path=request.resume_path,
            cover_letter=request.cover_letter
        )
        
        return JSONResponse(content=result)
        
    except Exception as e:
        logger.error(f"Error in Naukri auto-apply: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Batch Auto-Apply Endpoint
@app.post("/api/auto-apply/batch")
async def batch_auto_apply(request: Dict[str, Any]):
    """Apply to multiple jobs in batch with intelligent scheduling"""
    try:
        jobs = request.get('jobs', [])
        user_credentials = request.get('user_credentials', {})
        resume_path = request.get('resume_path', '')
        max_applications = request.get('max_applications', 10)
        delay_between_applications = request.get('delay_between_applications', 60)  # seconds
        
        results = []
        successful_applications = 0
        failed_applications = 0
        
        for i, job in enumerate(jobs[:max_applications]):
            try:
                # Generate job-specific cover letter
                cover_letter = await cover_letter_generator.generate_cover_letter(
                    job_description=job.get('description', ''),
                    company_name=job.get('company', ''),
                    job_title=job.get('title', ''),
                    user_profile={},  # Would fetch from user service
                    resume_content=''  # Would read from resume_path
                )
                
                # Apply to the job
                application_result = await _require(advanced_auto_apply_agent, "advanced_auto_apply").apply_to_job(
                    job_url=job.get('url'),
                    platform=job.get('platform'),
                    user_credentials=user_credentials,
                    resume_path=resume_path,
                    cover_letter=cover_letter.get('cover_letter', '')
                )
                
                if application_result.get('success'):
                    successful_applications += 1
                else:
                    failed_applications += 1
                
                results.append({
                    'job': job,
                    'result': application_result,
                    'order': i + 1
                })
                
                # Add delay between applications to avoid detection
                if i < len(jobs) - 1:  # Don't delay after the last job
                    await asyncio.sleep(delay_between_applications)
                
            except Exception as e:
                logger.error(f"Error applying to job {job.get('id')}: {e}")
                failed_applications += 1
                results.append({
                    'job': job,
                    'result': {'success': False, 'error': str(e)},
                    'order': i + 1
                })
        
        # Send summary notification
        if request.get('user_id'):
            await _require(notification_service, "notification").send_auto_apply_notification(
                user_id=request['user_id'],
                applications_submitted=successful_applications,
                successful_applications=[r for r in results if r['result'].get('success')],
                failed_applications=[r for r in results if not r['result'].get('success')],
                total_jobs_considered=len(jobs)
            )
        
        return JSONResponse(content={
            "total_jobs": len(jobs),
            "applications_attempted": len(results),
            "successful_applications": successful_applications,
            "failed_applications": failed_applications,
            "results": results
        })
        
    except Exception as e:
        logger.error(f"Error in batch auto-apply: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Helper functions
def extract_skills_from_description(description: str) -> List[str]:
    """Extract skills from job description"""
    common_skills = ['react', 'node.js', 'python', 'java', 'aws', 'docker', 'kubernetes', 'javascript', 'typescript']
    found_skills = []
    desc_lower = description.lower()
    for skill in common_skills:
        if skill in desc_lower:
            found_skills.append(skill)
    return found_skills

def calculate_match_score(keywords: List[str], job_skills: List[str]) -> int:
    """Calculate job match score"""
    if not keywords or not job_skills:
        return 50
    
    matches = len(set([k.lower() for k in keywords]) & set([s.lower() for s in job_skills]))
    total = len(keywords)
    return min(int((matches / total) * 100), 100) if total > 0 else 50

def extract_salary_number(salary_str: str) -> int:
    """Extract numeric salary for sorting"""
    import re
    numbers = re.findall(r'\d+', salary_str)
    return int(numbers[0]) if numbers else 0

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 