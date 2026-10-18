import asyncio
import json
import logging
import os
import re
from crewai import Agent, Task, Crew, Process
try:
    from crewai import LLM as CrewLLM
except ImportError:
    CrewLLM = None  # type: ignore
try:
    from langchain_core.tools import Tool
except ImportError:
    try:
        from langchain.tools import Tool
    except ImportError:
        Tool = None  # type: ignore
from typing import Dict, List, Any, Optional

from app.agents.lexicon import SKILL_KEYWORDS

logger = logging.getLogger(__name__)

def select_llm():
    """Select and initialize the LLM based on environment/config, with fallback.

    Returns a crewai.LLM instance (built on litellm) — NOT a raw langchain client.
    crewai's Agent.llm field only accepts a string or a BaseLLM/crewai.LLM instance;
    passing a langchain ChatOpenAI/Ollama object directly fails Pydantic validation
    at Agent-construction time with "Input should be a valid string" regardless of
    whether the underlying API key is valid, which is why every CrewAI-backed
    feature in this file silently fell back to heuristic mode all session even
    with an OPENAI_API_KEY present (see CLAUDE.md "Own-research additions").

    Auto priority (cost-ascending): GROQ (free tier, fast, good open-weight
    models) > GEMINI (Google's generous free tier) > OPENAI (paid from the
    first token) > OLLAMA (self-hosted, fully free, needs local resources) >
    heuristic fallback (raises, caught by the caller). Force a specific one
    with LLM_PROVIDER=groq|gemini|openai|ollama regardless of what else is
    configured.
    """
    if CrewLLM is None:
        raise RuntimeError("crewai.LLM is unavailable in the installed crewai version.")

    llm_provider = os.getenv("LLM_PROVIDER", "auto").lower()
    llm_temperature = float(os.getenv("LLM_TEMPERATURE", "0.7"))

    groq_key = os.getenv("GROQ_API_KEY")
    groq_model = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
    gemini_key = os.getenv("GEMINI_API_KEY")
    gemini_model = os.getenv("GEMINI_MODEL", "gemini-3.6-flash")
    openai_key = os.getenv("OPENAI_API_KEY")
    openai_model = os.getenv("LLM_MODEL", "gpt-4o-mini")
    ollama_url = os.getenv("OLLAMA_URL", "http://localhost:11434")
    ollama_model = os.getenv("OLLAMA_MODEL", "llama3.1")

    # Try Groq first — free tier, no cost, good enough for structured tasks like
    # resume parsing, ATS optimization, and cover-letter drafting. The installed
    # crewai version has no native "groq" provider and litellm isn't installed
    # (see requirements-docker.txt), so route through crewai's native "openai"
    # provider dispatch pointed at Groq's OpenAI-compatible endpoint instead —
    # confirmed working live against this project's actual Groq account/models.
    if groq_key and (llm_provider in ("groq", "auto")):
        try:
            logger.info("Using Groq LLM (free tier, via OpenAI-compatible endpoint): %s", groq_model)
            return _construct_and_validate(
                model=f"openai/{groq_model}",
                api_key=groq_key,
                base_url="https://api.groq.com/openai/v1",
                temperature=llm_temperature,
            )
        except Exception as e:
            logger.warning(f"Groq initialization failed: {e}")
            if llm_provider == "groq":
                raise

    # Try Gemini next — generous free tier, strong quality. crewai's native
    # "google"/"gemini" provider needs the crewai[google-genai] extra (not
    # installed), so route through Gemini's own OpenAI-compatible endpoint
    # instead — confirmed working live. Note the model name: Google retired
    # gemini-2.5-flash for new users mid-2026; gemini-3.6-flash is current as
    # of this fix — check https://ai.google.dev/gemini-api/docs/models if this
    # 404s again later, Google's model names change over time.
    if gemini_key and (llm_provider in ("gemini", "auto")):
        try:
            logger.info("Using Gemini LLM (via OpenAI-compatible endpoint): %s", gemini_model)
            return _construct_and_validate(
                model=f"openai/{gemini_model}",
                api_key=gemini_key,
                base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
                temperature=llm_temperature,
            )
        except Exception as e:
            logger.warning(f"Gemini initialization failed: {e}")
            if llm_provider == "gemini":
                raise

    # Try OpenAI when explicitly requested, or as the auto fallback once the
    # free-tier options are exhausted.
    if openai_key and (llm_provider == "openai" or (llm_provider == "auto" and not groq_key and not gemini_key)):
        try:
            logger.info("Using OpenAI LLM: %s", openai_model)
            return _construct_and_validate(
                model=f"openai/{openai_model}", api_key=openai_key, temperature=llm_temperature
            )
        except Exception as e:
            logger.warning(f"OpenAI initialization failed: {e}")
            if llm_provider == "openai":
                raise

    # Try Ollama (self-hosted, fully free) last.
    if llm_provider in ("ollama", "auto"):
        try:
            logger.info("Using Ollama LLM (self-hosted) at %s", ollama_url)
            return _construct_and_validate(
                model=f"ollama/{ollama_model}", base_url=ollama_url, temperature=llm_temperature
            )
        except Exception as e:
            logger.warning(f"Ollama initialization failed: {e}")
            if llm_provider == "ollama":
                raise

    raise RuntimeError("No available LLM provider could be initialized. Please check your configuration.")


def _construct_and_validate(**llm_kwargs) -> "CrewLLM":
    """Construct a crewai.LLM and make one tiny real call to confirm the key/
    endpoint actually works — crewai.LLM's constructor (like the langchain
    clients before it) doesn't validate anything eagerly, so an invalid key
    would otherwise "succeed" here, populate self.agents, and only fail later
    mid-request as a raw 500 instead of the intended heuristic-fallback path.
    This keeps the existing "if not self.agents: <heuristic>" pattern used
    throughout this file working exactly as it did before crewai.LLM was
    introduced."""
    llm = CrewLLM(**llm_kwargs)
    llm.call("OK")
    return llm


class HeuristicLLM:
    """Stand-in so resume parsing can return structured JSON without a live LLM."""

    def invoke(self, prompt: str):
        return (
            '{"personal_info":{},"skills":[],"experience":[],"education":[],'
            '"summary":"LLM unavailable — heuristic parse only","insights":[]}'
        )

    def __call__(self, prompt: str):
        return self.invoke(prompt)


# Common skills used for rule-based extraction when no LLM is available.
_HEURISTIC_SKILL_KEYWORDS = SKILL_KEYWORDS

_EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
_PHONE_RE = re.compile(r"(\+?\d[\d\-.\s()]{7,}\d)")


def _find_phone(text: str) -> Optional[str]:
    """Find a phone-like number, requiring >=10 digits so short digit runs with
    separators — e.g. a "(2022-2026)" date range, which the old bare regex happily
    matched as a phone number — aren't mistaken for one."""
    for match in _PHONE_RE.finditer(text):
        candidate = match.group(0)
        if sum(c.isdigit() for c in candidate) >= 10:
            return candidate
    return None


def _heuristic_extract_skills(text: str) -> List[str]:
    lower = text.lower()
    # Word-boundary match (via lookaround, since \b doesn't work reliably around
    # symbol-only tokens like "c++" or "c#") instead of naive substring search —
    # the old `skill in lower` check produced false positives such as detecting "Go"
    # inside "Django" (djan-GO) or "R" inside almost any word containing the letter.
    found = [
        skill
        for skill in _HEURISTIC_SKILL_KEYWORDS
        if re.search(r"(?<![a-z0-9])" + re.escape(skill) + r"(?![a-z0-9])", lower)
    ]
    # Preserve title case for readability, de-duplicated, capped for sanity.
    return [s.title() if " " not in s or s in ("ci/cd",) else s for s in found][:30]


def _heuristic_extract_section(text: str, headers: List[str]) -> str:
    lines = text.splitlines()
    lower_lines = [l.lower() for l in lines]
    for i, line in enumerate(lower_lines):
        if any(line.strip().rstrip(":").strip() == h for h in headers):
            return "\n".join(lines[i + 1 : i + 8]).strip()
    return ""


def heuristic_resume_analysis(resume_text: str) -> Dict[str, Any]:
    """Rule-based resume parse used when no LLM is available (missing/invalid API key,
    or optional CrewAI/LLM deps unavailable) so uploads still produce usable structured
    data instead of an opaque failure."""
    text = resume_text or ""
    email_match = _EMAIL_RE.search(text)
    phone = _find_phone(text)
    first_line = next((l.strip() for l in text.splitlines() if l.strip()), "")

    skills = _heuristic_extract_skills(text)
    experience_text = _heuristic_extract_section(text, ["experience", "work experience", "employment history"])
    education_text = _heuristic_extract_section(text, ["education", "academic background"])
    summary_text = _heuristic_extract_section(text, ["summary", "professional summary", "objective"])
    if not summary_text:
        summary_text = " ".join(text.split()[:40])

    return {
        "personal_info": {
            "name": first_line if first_line and len(first_line) < 80 else None,
            "email": email_match.group(0) if email_match else None,
            "phone": phone,
            "location": None,
        },
        "skills": skills,
        # Downstream consumers (resume-service) expect experience/education as lists of
        # objects, not plain strings — matching the shape a real LLM would return.
        "experience": [{"description": experience_text}] if experience_text else [],
        "education": [{"description": education_text}] if education_text else [],
        "summary": summary_text or None,
        "insights": {
            "note": "Generated by rule-based fallback parser (no LLM configured/available).",
        },
    }


class CrewAIService:
    def __init__(self):
        self.llm = None
        self.agents = {}
        self.crews = {}
        self.is_initialized = False
        self.llm_provider = None
        self.llm_available = False
        
    async def initialize(self):
        """Initialize the CrewAI service with dynamic LLM selection and fallback."""
        try:
            self.llm = select_llm()
            self.llm_provider = type(self.llm).__name__
            self.llm_available = True
            logger.info(f"CrewAIService using LLM provider: {self.llm_provider}")
            await self._initialize_agents()
            self.is_initialized = True
            logger.info("CrewAI service initialized successfully")
        except Exception as e:
            logger.warning("CrewAI LLM init failed (%s) — using heuristic fallback", e)
            self.llm = HeuristicLLM()
            self.llm_provider = "HeuristicLLM"
            self.llm_available = False
            self.agents = {}
            self.crews = {}
            self.is_initialized = True
    
    async def _initialize_agents(self):
        """Initialize all AI agents"""
        # Resume Analysis Agent
        self.agents['resume_analyzer'] = Agent(
            role='Resume Analysis Expert',
            goal='Analyze resumes and extract key information including skills, experience, education, and provide insights',
            backstory="""You are an expert resume analyst with years of experience in HR and recruitment. 
            You can quickly identify key information from resumes and provide valuable insights for career development.""",
            verbose=True,
            allow_delegation=False,
            llm=self.llm
        )
        
        # Cover Letter Agent
        self.agents['cover_letter_writer'] = Agent(
            role='Cover Letter Specialist',
            goal='Write compelling, personalized cover letters that match job requirements and highlight relevant skills',
            backstory="""You are a professional cover letter writer with expertise in crafting compelling 
            narratives that connect candidate skills with job requirements. You understand what hiring managers look for.""",
            verbose=True,
            allow_delegation=False,
            llm=self.llm
        )
        
        # Job Market Analyst
        self.agents['job_analyst'] = Agent(
            role='Job Market Analyst',
            goal='Analyze job markets, provide insights on job trends, salary ranges, and market intelligence',
            backstory="""You are a job market analyst with deep knowledge of various industries and job markets. 
            You can provide insights on job trends, salary expectations, and market conditions.""",
            verbose=True,
            allow_delegation=False,
            llm=self.llm
        )
        
        # ATS Optimization Agent
        self.agents['ats_optimizer'] = Agent(
            role='ATS Optimization Specialist',
            goal='Optimize resumes for Applicant Tracking Systems to improve match scores and visibility',
            backstory="""You are an ATS optimization expert who understands how Applicant Tracking Systems work. 
            You can optimize resumes to improve their chances of being selected by ATS systems.""",
            verbose=True,
            allow_delegation=False,
            llm=self.llm
        )
        
        # Career Mentor Agent
        self.agents['career_mentor'] = Agent(
            role='Career Development Mentor',
            goal='Provide personalized career advice and guidance based on individual circumstances and goals',
            backstory="""You are an experienced career mentor who has helped hundreds of professionals advance their careers. 
            You provide practical, actionable advice for career development and growth.""",
            verbose=True,
            allow_delegation=False,
            llm=self.llm
        )
        
        # Job Search Agent
        self.agents['job_searcher'] = Agent(
            role='Job Search Specialist',
            goal='Find relevant job opportunities across multiple platforms and match them with candidate profiles',
            backstory="""You are a job search specialist who knows how to find the best opportunities across 
            various job platforms. You understand what makes a good job-candidate match.""",
            verbose=True,
            allow_delegation=False,
            llm=self.llm
        )
        
        # Application Automation Agent
        self.agents['application_automator'] = Agent(
            role='Application Automation Expert',
            goal='Automate job applications across various platforms while maintaining quality and personalization',
            backstory="""You are an expert in automating job applications while ensuring they remain personalized 
            and effective. You understand the technical and human aspects of job applications.""",
            verbose=True,
            allow_delegation=False,
            llm=self.llm
        )
    
    async def analyze_resume(self, resume_text: str, detailed: bool = False, job_description: str = None) -> Dict[str, Any]:
        """Analyze resume using CrewAI agents"""
        if not self.agents:
            # No live LLM/agents (missing/invalid API key or optional deps unavailable) —
            # fall back to rule-based extraction rather than raising KeyError on the
            # never-created 'resume_analyzer' agent.
            logger.info("analyze_resume: no CrewAI agents available, using heuristic fallback")
            result = heuristic_resume_analysis(resume_text)
            result["timestamp"] = asyncio.get_event_loop().time()
            result["parsed"] = True
            return result
        try:
            # Create tasks for resume analysis
            tasks = []
            
            # Basic resume analysis task
            analysis_task = Task(
                description=f"""
                Analyze the following resume and extract key information:
                
                Resume Text:
                {resume_text}
                
                Please provide:
                1. Personal Information (name, email, phone, location)
                2. Skills (technical and soft skills)
                3. Work Experience (company, role, duration, achievements)
                4. Education (degree, institution, year)
                5. Summary of qualifications
                6. Key achievements and metrics
                
                Format the response as a structured JSON with clear sections.
                """,
                agent=self.agents['resume_analyzer'],
                expected_output="A JSON object with extracted resume fields: name, email, phone, location, skills, experience, education, summary, achievements."
            )
            tasks.append(analysis_task)
            
            # Detailed analysis if requested
            if detailed:
                insights_task = Task(
                    description=f"""
                    Based on the resume analysis, provide detailed insights:
                    
                    1. Strengths and unique selling points
                    2. Areas for improvement
                    3. Career trajectory analysis
                    4. Industry fit assessment
                    5. Salary range estimation
                    6. Next career move recommendations
                    
                    Provide actionable insights that can help with career development.
                    """,
                    agent=self.agents['resume_analyzer'],
                    expected_output="A JSON object with detailed resume insights: strengths, improvements, trajectory, industry fit, salary range, recommendations."
                )
                tasks.append(insights_task)
            
            # Job-specific analysis if job description provided
            if job_description:
                job_fit_task = Task(
                    description=f"""
                    Compare the resume with the following job description and provide analysis:
                    
                    Job Description:
                    {job_description}
                    
                    Resume:
                    {resume_text}
                    
                    Please provide:
                    1. Match score (0-100)
                    2. Matching skills and experience
                    3. Missing requirements
                    4. Recommendations for improvement
                    5. Application readiness assessment
                    """,
                    agent=self.agents['resume_analyzer'],
                    expected_output="A JSON object with job fit analysis: match score, matching skills, missing requirements, recommendations, readiness."
                )
                tasks.append(job_fit_task)
            
            # Create and run crew
            crew = Crew(
                agents=[self.agents['resume_analyzer']],
                tasks=tasks,
                process=Process.sequential,
                verbose=True
            )
            
            # .raw extracts the plain text — crew.kickoff_async() returns a CrewOutput
            # object (not directly JSON-serializable), unlike the sync kickoff() this
            # codebase was originally written against.
            result = (await crew.kickoff_async()).raw
            
            # Parse and structure the result
            analysis = self._parse_resume_analysis(result)
            
            return analysis
            
        except Exception as e:
            logger.error(f"Error analyzing resume: {str(e)}")
            raise
    
    async def generate_cover_letter(self, job_title: str, company: str, user_skills: List[str],
                                  resume_summary: str = None, tone: str = "professional") -> str:
        """Generate personalized cover letter using CrewAI"""
        if not self.agents:
            logger.info("generate_cover_letter: no CrewAI agents available, using heuristic fallback")
            skills_str = ", ".join(user_skills[:6]) if user_skills else "a strong technical background"
            return (
                f"Dear Hiring Manager,\n\n"
                f"I am excited to apply for the {job_title} position at {company}. "
                f"With experience in {skills_str}, I am confident I can contribute "
                f"meaningfully to your team.\n\n"
                f"{(resume_summary or '').strip()[:400]}\n\n"
                f"I would welcome the opportunity to discuss how my background aligns "
                f"with your needs. Thank you for your consideration.\n\n"
                f"Sincerely,\nA JobGenie Candidate\n\n"
                f"(Note: generated by rule-based fallback — no LLM configured/available.)"
            )
        try:
            task = Task(
                description=f"""
                Write a compelling cover letter for the following position:
                
                Job Title: {job_title}
                Company: {company}
                Candidate Skills: {', '.join(user_skills)}
                Resume Summary: {resume_summary or 'Not provided'}
                Tone: {tone}
                
                Requirements:
                1. Personalized opening that shows research about the company
                2. Connect candidate skills to job requirements
                3. Include specific examples and achievements
                4. Professional closing with call to action
                5. Keep it concise (250-400 words)
                6. Use {tone} tone throughout
                
                Make it compelling and tailored to the specific role and company.
                """,
                agent=self.agents['cover_letter_writer'],
                expected_output="A complete, ready-to-send cover letter in plain text, 250-400 words."
            )
            
            crew = Crew(
                agents=[self.agents['cover_letter_writer']],
                tasks=[task],
                process=Process.sequential,
                verbose=True
            )
            
            # .raw extracts the plain text — crew.kickoff_async() returns a CrewOutput
            # object (not directly JSON-serializable), unlike the sync kickoff() this
            # codebase was originally written against.
            result = (await crew.kickoff_async()).raw
            return result
            
        except Exception as e:
            logger.error(f"Error generating cover letter: {str(e)}")
            raise
    
    async def analyze_job(self, job_title: str, location: str, job_description: str = None) -> Dict[str, Any]:
        """Analyze job market and provide insights"""
        if not self.agents:
            logger.info("analyze_job: no CrewAI agents available, using heuristic fallback")
            return self._parse_job_analysis(
                f"Market intelligence for {job_title} in {location} is unavailable without a configured LLM "
                f"provider. (Generated by rule-based fallback — no LLM configured/available.)"
            )
        try:
            task = Task(
                description=f"""
                Analyze the job market for the following position:
                
                Job Title: {job_title}
                Location: {location}
                Job Description: {job_description or 'Not provided'}
                
                Please provide:
                1. Market demand analysis
                2. Salary range and trends
                3. Required skills and qualifications
                4. Industry insights
                5. Career growth opportunities
                6. Application tips and strategies
                7. Alternative job titles to consider
                
                Provide comprehensive market intelligence and actionable insights.
                """,
                agent=self.agents['job_analyst'],
                expected_output="A structured report covering market demand, salary range, required skills, and application tips."
            )
            
            crew = Crew(
                agents=[self.agents['job_analyst']],
                tasks=[task],
                process=Process.sequential,
                verbose=True
            )
            
            # .raw extracts the plain text — crew.kickoff_async() returns a CrewOutput
            # object (not directly JSON-serializable), unlike the sync kickoff() this
            # codebase was originally written against.
            result = (await crew.kickoff_async()).raw
            
            # Parse and structure the result
            analysis = self._parse_job_analysis(result)
            
            return analysis
            
        except Exception as e:
            logger.error(f"Error analyzing job: {str(e)}")
            raise
    
    async def optimize_resume_for_ats(self, resume_content: str, job_description: str, target_score: int = 80) -> Dict[str, Any]:
        """Optimize resume for ATS systems"""
        if not self.agents:
            logger.info("optimize_resume_for_ats: no CrewAI agents available, using heuristic fallback")
            resume_skills = set(s.lower() for s in _heuristic_extract_skills(resume_content))
            job_skills = set(s.lower() for s in _heuristic_extract_skills(job_description))
            missing = sorted(job_skills - resume_skills)
            matched = sorted(job_skills & resume_skills)
            estimated_score = int(100 * len(matched) / len(job_skills)) if job_skills else target_score
            lower_resume = (resume_content or "").lower()
            keyword_density = [
                {
                    "keyword": kw,
                    "count": lower_resume.count(kw),
                    "importance": "high" if kw in matched else "medium",
                }
                for kw in sorted(job_skills)
            ]
            improvements = [f"Add missing keyword: {kw}" for kw in missing] or [
                "Resume already covers the detected job-description keywords."
            ]
            annotated_content = resume_content or ""
            if missing:
                annotated_content += (
                    "\n\n--- Suggested additions (rule-based fallback — no LLM available) ---\n"
                    + "\n".join(f"- Consider adding experience with: {kw}" for kw in missing)
                )
            return {
                "content": annotated_content,
                "atsScore": estimated_score,
                "improvements": improvements,
                "keywordDensity": keyword_density,
                "raw_result": (
                    f"Matched keywords: {', '.join(matched) or 'none'}. "
                    f"Missing keywords to consider adding: {', '.join(missing) or 'none'}. "
                    f"Estimated ATS keyword match: {estimated_score}/100. "
                    f"(Generated by rule-based fallback — no LLM configured/available.)"
                ),
                "matched_keywords": matched,
                "missing_keywords": missing,
                "estimated_score": estimated_score,
                "parsed": True,
                "timestamp": asyncio.get_event_loop().time(),
            }
        try:
            task = Task(
                description=f"""
                Optimize the following resume for ATS systems based on the job description:
                
                Resume Content:
                {resume_content}
                
                Job Description:
                {job_description}
                
                Target ATS Score: {target_score}
                
                Please provide:
                1. Optimized resume content with ATS-friendly formatting
                2. Keyword optimization recommendations
                3. Skills section enhancement
                4. Experience section improvements
                5. Education section formatting
                6. Overall ATS score improvement
                7. Specific changes made and rationale
                
                Focus on improving ATS compatibility while maintaining readability and impact.
                """,
                agent=self.agents['ats_optimizer'],
                expected_output="The optimized resume content plus a list of specific changes made and the resulting ATS score."
            )
            
            crew = Crew(
                agents=[self.agents['ats_optimizer']],
                tasks=[task],
                process=Process.sequential,
                verbose=True
            )
            
            # .raw extracts the plain text — crew.kickoff_async() returns a CrewOutput
            # object (not directly JSON-serializable), unlike the sync kickoff() this
            # codebase was originally written against.
            result = (await crew.kickoff_async()).raw
            
            # Parse and structure the result
            optimization = self._parse_ats_optimization(result)
            
            return optimization
            
        except Exception as e:
            logger.error(f"Error optimizing resume for ATS: {str(e)}")
            raise
    
    async def get_career_advice(self, question: str, user_context: Dict[str, Any] = None) -> str:
        """Get personalized career advice"""
        if not self.agents:
            logger.info("get_career_advice: no CrewAI agents available, using heuristic fallback")
            return (
                f"I can't reach an AI model right now, so here's general guidance on \"{question.strip()[:200]}\": "
                "focus on quantifying your achievements with metrics, tailor your resume's keywords to each "
                "job description, and practice explaining your impact in past roles using specific examples. "
                "For a more personalized answer, please try again once an LLM provider is configured. "
                "(Note: generated by rule-based fallback — no LLM configured/available.)"
            )
        try:
            context_str = ""
            if user_context:
                context_str = f"\nUser Context: {user_context}"
            
            task = Task(
                description=f"""
                Provide personalized career advice for the following question:
                
                Question: {question}
                {context_str}
                
                Please provide:
                1. Direct answer to the question
                2. Practical steps and actionable advice
                3. Relevant examples or case studies
                4. Potential challenges and how to overcome them
                5. Long-term career implications
                6. Additional resources or learning opportunities
                
                Make the advice practical, actionable, and tailored to the individual's situation.
                """,
                agent=self.agents['career_mentor'],
                expected_output="A detailed, actionable answer to the user's career question, in plain text."
            )
            
            crew = Crew(
                agents=[self.agents['career_mentor']],
                tasks=[task],
                process=Process.sequential,
                verbose=True
            )
            
            # .raw extracts the plain text — crew.kickoff_async() returns a CrewOutput
            # object (not directly JSON-serializable), unlike the sync kickoff() this
            # codebase was originally written against.
            result = (await crew.kickoff_async()).raw
            return result
            
        except Exception as e:
            logger.error(f"Error getting career advice: {str(e)}")
            raise
    
    async def execute_task(self, task_type: str, task_data: Dict[str, Any]) -> Any:
        """Execute a generic CrewAI task"""
        try:
            if task_type not in self.agents:
                raise ValueError(f"Unknown task type: {task_type}")
            
            agent = self.agents[task_type]
            
            task = Task(
                description=task_data.get('description', ''),
                agent=agent,
                expected_output=task_data.get('expected_output', 'A complete response to the task description.')
            )
            
            crew = Crew(
                agents=[agent],
                tasks=[task],
                process=Process.sequential,
                verbose=True
            )
            
            # .raw extracts the plain text — crew.kickoff_async() returns a CrewOutput
            # object (not directly JSON-serializable), unlike the sync kickoff() this
            # codebase was originally written against.
            result = (await crew.kickoff_async()).raw
            return result
            
        except Exception as e:
            logger.error(f"Error executing task: {str(e)}")
            raise
    
    async def get_status(self) -> Dict[str, Any]:
        """Get CrewAI service status"""
        return {
            "initialized": self.is_initialized,
            "agents_count": len(self.agents),
            "crews_count": len(self.crews),
            "llm_configured": self.llm is not None
        }
    
    async def cleanup(self):
        """Cleanup resources"""
        self.agents.clear()
        self.crews.clear()
        self.is_initialized = False
        logger.info("CrewAI service cleaned up")
    
    def _parse_resume_analysis(self, result) -> Dict[str, Any]:
        """Parse resume analysis result into structured format for backend consumers."""
        try:
            raw_text = str(result)
            structured = self._extract_json_from_text(raw_text)

            personal_info: Dict[str, Any] = {}
            skills: List[Any] = []
            experience: List[Any] = []
            education: List[Any] = []
            summary = None
            insights: Dict[str, Any] = {}

            if isinstance(structured, dict):
                personal_info = (
                    structured.get("personal_info")
                    or structured.get("personal_information")
                    or {}
                )
                if not personal_info and any(
                    key in structured for key in ("name", "email", "phone", "location")
                ):
                    personal_info = {
                        "name": structured.get("name"),
                        "email": structured.get("email"),
                        "phone": structured.get("phone"),
                        "location": structured.get("location"),
                    }

                skills = structured.get("skills", [])
                if isinstance(skills, dict):
                    technical = skills.get("technical", [])
                    soft = skills.get("soft", [])
                    skills = list(technical or []) + list(soft or [])

                experience = structured.get("experience") or structured.get("work_experience") or []
                education = structured.get("education", [])
                summary = structured.get("summary") or structured.get("qualifications_summary")
                insights = structured.get("insights", {}) if isinstance(structured.get("insights"), dict) else {}

            return {
                "personal_info": personal_info,
                "skills": skills,
                "experience": experience,
                "education": education,
                "summary": summary,
                "insights": insights,
                "raw_result": raw_text,
                "parsed": bool(structured),
                "timestamp": asyncio.get_event_loop().time(),
            }
        except Exception as e:
            logger.error(f"Error parsing resume analysis: {str(e)}")
            return {"raw_result": str(result), "parsed": False, "error": str(e)}

    def _extract_json_from_text(self, text: str) -> Optional[Dict[str, Any]]:
        """Best-effort JSON extraction from LLM output."""
        if not text:
            return None

        candidates = [text.strip()]
        fenced_matches = re.findall(r"```(?:json)?\s*([\s\S]*?)```", text, flags=re.IGNORECASE)
        candidates.extend(match.strip() for match in fenced_matches)

        for candidate in candidates:
            try:
                parsed = json.loads(candidate)
                if isinstance(parsed, dict):
                    return parsed
            except json.JSONDecodeError:
                start = candidate.find("{")
                end = candidate.rfind("}")
                if start != -1 and end != -1 and end > start:
                    try:
                        parsed = json.loads(candidate[start : end + 1])
                        if isinstance(parsed, dict):
                            return parsed
                    except json.JSONDecodeError:
                        continue
        return None
    
    def _parse_job_analysis(self, result: str) -> Dict[str, Any]:
        """Parse job analysis result into structured format"""
        try:
            return {
                "raw_result": result,
                "parsed": True,
                "timestamp": asyncio.get_event_loop().time()
            }
        except Exception as e:
            logger.error(f"Error parsing job analysis: {str(e)}")
            return {"raw_result": result, "parsed": False, "error": str(e)}
    
    def _parse_ats_optimization(self, result: str) -> Dict[str, Any]:
        """Parse ATS optimization result into structured format"""
        try:
            return {
                "raw_result": result,
                "parsed": True,
                "timestamp": asyncio.get_event_loop().time()
            }
        except Exception as e:
            logger.error(f"Error parsing ATS optimization: {str(e)}")
            return {"raw_result": result, "parsed": False, "error": str(e)}
    
    async def analyze_job_market(self, job_title: str, location: str, job_description: str = None) -> Dict[str, Any]:
        """Analyze job market and provide insights using the job_analyst agent"""
        try:
            if not self.is_initialized:
                await self.initialize()
            description = f"""
            Analyze the job market for the following role and location:
            Job Title: {job_title}
            Location: {location}
            """
            if job_description:
                description += f"\nJob Description: {job_description}"
            description += "\nProvide insights on job trends, demand, salary ranges, and required skills."
            task = Task(
                description=description,
                agent=self.agents['job_analyst'],
                expected_output="A report on job market trends, demand, salary ranges, and required skills."
            )
            crew = Crew(
                agents=[self.agents['job_analyst']],
                tasks=[task],
                process=Process.sequential,
                verbose=True
            )
            # .raw extracts the plain text — crew.kickoff_async() returns a CrewOutput
            # object (not directly JSON-serializable), unlike the sync kickoff() this
            # codebase was originally written against.
            result = (await crew.kickoff_async()).raw
            return self._parse_job_analysis(result)
        except Exception as e:
            logger.error(f"Error in analyze_job_market: {e}")
            return {"error": str(e)}

    async def get_market_intelligence(self, job_title: str, location: str) -> Dict[str, Any]:
        """Get market intelligence for a job title and location using the job_analyst agent"""
        try:
            if not self.is_initialized:
                await self.initialize()
            if not self.agents:
                # No live LLM/agents (missing/invalid API key or optional deps unavailable) —
                # fall back honestly instead of raising KeyError on the never-created
                # 'job_analyst' agent (matches the pattern used by analyze_resume,
                # generate_cover_letter, and get_career_advice above).
                logger.info("get_market_intelligence: no CrewAI agents available, using heuristic fallback")
                return {
                    "parsed": False,
                    "heuristic": True,
                    "note": "Generated by rule-based fallback (no LLM configured/available).",
                }
            description = f"""
            Provide market intelligence for the following job title and location:
            Job Title: {job_title}
            Location: {location}
            Include salary trends, demand, top companies hiring, and required skills.
            """
            task = Task(
                description=description,
                agent=self.agents['job_analyst'],
                expected_output="A report on salary trends, demand, top hiring companies, and required skills."
            )
            crew = Crew(
                agents=[self.agents['job_analyst']],
                tasks=[task],
                process=Process.sequential,
                verbose=True
            )
            # .raw extracts the plain text — crew.kickoff_async() returns a CrewOutput
            # object (not directly JSON-serializable), unlike the sync kickoff() this
            # codebase was originally written against.
            result = (await crew.kickoff_async()).raw
            return self._parse_job_analysis(result)
        except Exception as e:
            logger.error(f"Error in get_market_intelligence: {e}")
            return {"error": str(e)} 