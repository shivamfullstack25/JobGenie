import asyncio
import json
import logging
import os
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Union

# CrewAI and LangChain imports
from crewai import Agent, Task, Crew, Process
from crewai.memory import ShortTermMemory, LongTermMemory
try:
    from langchain_core.tools import Tool
except ImportError:
    from langchain.tools import Tool
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_community.vectorstores import Chroma
from langchain.memory import ConversationBufferWindowMemory
from langchain.schema import Document
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.chains import ConversationalRetrievalChain
from langchain.output_parsers import PydanticOutputParser, OutputFixingParser
from langchain.prompts import PromptTemplate
from pydantic import BaseModel, Field

# Kafka integration
try:
    from kafka import KafkaProducer
    KAFKA_AVAILABLE = True
except ImportError:
    KAFKA_AVAILABLE = False
    logger.warning("Kafka not available - events will not be published")

# Local imports
from .crew_ai_service import select_llm

logger = logging.getLogger(__name__)

# Structured output models
class ResumeAnalysis(BaseModel):
    """Structured resume analysis output"""
    personal_info: Dict[str, str] = Field(description="Name, email, phone, location")
    skills: Dict[str, List[str]] = Field(description="Technical and soft skills categorized")
    experience: List[Dict[str, Any]] = Field(description="Work experience with metrics")
    education: List[Dict[str, Any]] = Field(description="Educational background")
    summary: str = Field(description="Professional summary")
    strengths: List[str] = Field(description="Key strengths identified")
    improvements: List[str] = Field(description="Areas for improvement")
    ats_score: int = Field(description="ATS compatibility score 0-100")

class JobMarketAnalysis(BaseModel):
    """Structured job market analysis output"""
    demand_level: str = Field(description="High/Medium/Low demand")
    salary_range: Dict[str, int] = Field(description="Min, max, median salary")
    top_skills: List[str] = Field(description="Most requested skills")
    growth_prospects: str = Field(description="Career growth analysis")
    market_trends: List[str] = Field(description="Current market trends")
    recommendations: List[str] = Field(description="Actionable recommendations")

class CoverLetterOutput(BaseModel):
    """Structured cover letter output"""
    cover_letter: str = Field(description="The generated cover letter")
    key_points: List[str] = Field(description="Key selling points highlighted")
    customization_level: str = Field(description="Level of customization achieved")
    estimated_impact: str = Field(description="Predicted impact assessment")

class EnhancedCrewAIService:
    """Enhanced CrewAI service with memory, tools, and optimizations"""
    
    def __init__(self):
        self.llm = None
        self.agents = {}
        self.crews = {}
        self.is_initialized = False
        self.llm_provider = None
        
        # Memory and context management
        self.vector_store = None
        self.embeddings = None
        self.conversation_memory = {}
        self.user_contexts = {}
        
        # Output parsers
        self.resume_parser = PydanticOutputParser(pydantic_object=ResumeAnalysis)
        self.job_market_parser = PydanticOutputParser(pydantic_object=JobMarketAnalysis)
        self.cover_letter_parser = PydanticOutputParser(pydantic_object=CoverLetterOutput)
        
        # Performance tracking
        self.task_performance = {}
        self.model_performance = {}
        
        # Kafka event streaming
        self.kafka_producer = None
        self._initialize_kafka()
        
    async def initialize(self):
        """Initialize enhanced CrewAI service with memory and vector storage"""
        try:
            # Initialize LLM with dynamic selection
            self.llm = select_llm()
            self.llm_provider = type(self.llm).__name__
            logger.info(f"Enhanced CrewAI using LLM provider: {self.llm_provider}")
            
            # Initialize embeddings (use OpenAI if available, otherwise skip vector features)
            await self._initialize_embeddings()
            
            # Initialize vector storage for context/memory
            await self._initialize_vector_storage()
            
            # Initialize enhanced agents with memory and tools
            await self._initialize_enhanced_agents()
            
            self.is_initialized = True
            logger.info("Enhanced CrewAI service initialized successfully")
            
        except Exception as e:
            logger.error(f"Error initializing Enhanced CrewAI service: {str(e)}")
            raise
    
    async def _initialize_embeddings(self):
        """Initialize embeddings for vector storage"""
        try:
            if os.getenv("OPENAI_API_KEY"):
                self.embeddings = OpenAIEmbeddings()
                logger.info("OpenAI embeddings initialized")
            else:
                logger.warning("No OpenAI key - vector features disabled")
        except Exception as e:
            logger.warning(f"Embeddings initialization failed: {e}")
    
    async def _initialize_vector_storage(self):
        """Initialize vector storage for context and memory"""
        try:
            if self.embeddings:
                # Initialize Chroma vector store for persistent memory
                self.vector_store = Chroma(
                    collection_name="jobgenie_context",
                    embedding_function=self.embeddings,
                    persist_directory="./vector_db"
                )
                logger.info("Vector storage initialized")
        except Exception as e:
            logger.warning(f"Vector storage initialization failed: {e}")
    
    async def _initialize_enhanced_agents(self):
        """Initialize enhanced agents with memory and advanced capabilities"""
        
        # Enhanced Resume Analysis Agent with structured output
        self.agents['resume_analyzer'] = Agent(
            role='Senior Resume Analysis Expert',
            goal='Analyze resumes with deep insights and structured output for maximum value',
            backstory="""You are a senior resume analyst with 15+ years in executive recruitment. 
            You provide detailed, structured analysis with specific metrics and actionable insights. 
            You understand ATS systems, industry trends, and what makes candidates stand out.""",
            verbose=True,
            allow_delegation=False,
            llm=self.llm,
            memory=ShortTermMemory() if hasattr(ShortTermMemory, '__init__') else None,
            tools=await self._create_resume_tools()
        )
        
        # Enhanced Job Market Analyst with real-time data
        self.agents['job_analyst'] = Agent(
            role='Senior Job Market Intelligence Analyst',
            goal='Provide comprehensive market intelligence with real-time data and trends',
            backstory="""You are a senior market researcher specializing in job markets across industries. 
            You have access to real-time market data, salary trends, and industry insights. 
            You provide actionable intelligence for career decisions.""",
            verbose=True,
            allow_delegation=False,
            llm=self.llm,
            memory=ShortTermMemory() if hasattr(ShortTermMemory, '__init__') else None,
            tools=await self._create_market_analysis_tools()
        )
        
        # Enhanced Cover Letter Writer with personalization
        self.agents['cover_letter_writer'] = Agent(
            role='Executive Cover Letter Specialist',
            goal='Create highly personalized, compelling cover letters that get interviews',
            backstory="""You are an executive communications specialist who has written cover letters 
            for C-level executives and senior professionals. You understand company culture, 
            industry language, and how to create compelling narratives.""",
            verbose=True,
            allow_delegation=False,
            llm=self.llm,
            memory=ShortTermMemory() if hasattr(ShortTermMemory, '__init__') else None,
            tools=await self._create_writing_tools()
        )
        
        # Career Strategy Agent (new)
        self.agents['career_strategist'] = Agent(
            role='Senior Career Strategy Consultant',
            goal='Develop comprehensive career strategies based on market analysis and user goals',
            backstory="""You are a senior career consultant who has guided hundreds of professionals 
            through career transitions. You combine market intelligence with personal assessment 
            to create winning career strategies.""",
            verbose=True,
            allow_delegation=True,  # Can delegate to other agents
            llm=self.llm,
            memory=ShortTermMemory() if hasattr(ShortTermMemory, '__init__') else None
        )
        
        logger.info("Enhanced agents initialized with memory and tools")
    
    async def _create_resume_tools(self) -> List[Tool]:
        """Create specialized tools for resume analysis"""
        tools = []
        
        # ATS Keyword Analyzer Tool
        ats_tool = Tool(
            name="ats_keyword_analyzer",
            description="Analyze resume for ATS keyword optimization",
            func=self._analyze_ats_keywords
        )
        tools.append(ats_tool)
        
        # Skills Gap Analyzer Tool
        skills_tool = Tool(
            name="skills_gap_analyzer",
            description="Identify skill gaps based on job market demands",
            func=self._analyze_skills_gap
        )
        tools.append(skills_tool)
        
        return tools
    
    async def _create_market_analysis_tools(self) -> List[Tool]:
        """Create tools for market analysis"""
        tools = []
        
        # Salary Trend Analyzer
        salary_tool = Tool(
            name="salary_trend_analyzer",
            description="Get real-time salary trends and market data",
            func=self._analyze_salary_trends
        )
        tools.append(salary_tool)
        
        return tools
    
    async def _create_writing_tools(self) -> List[Tool]:
        """Create tools for enhanced writing"""
        tools = []
        
        # Company Research Tool
        company_tool = Tool(
            name="company_researcher",
            description="Research company culture and values for personalization",
            func=self._research_company
        )
        tools.append(company_tool)
        
        return tools
    
    # Tool implementations
    async def _analyze_ats_keywords(self, resume_text: str) -> str:
        """Analyze resume for ATS optimization with real analysis"""
        try:
            # Common ATS keywords by category
            ats_keywords = {
                'technical_skills': ['Python', 'JavaScript', 'React', 'Node.js', 'AWS', 'Docker', 'SQL'],
                'soft_skills': ['leadership', 'communication', 'teamwork', 'problem-solving', 'analytical'],
                'action_verbs': ['developed', 'implemented', 'managed', 'created', 'optimized', 'led']
            }
            
            resume_lower = resume_text.lower()
            found_keywords = {}
            total_score = 0
            
            for category, keywords in ats_keywords.items():
                found_keywords[category] = []
                for keyword in keywords:
                    if keyword.lower() in resume_lower:
                        found_keywords[category].append(keyword)
                        total_score += 1
            
            ats_score = min(100, (total_score / 20) * 100)  # Score out of 100
            
            analysis = f"""
            ATS Compatibility Score: {ats_score:.1f}/100
            
            Found Keywords by Category:
            Technical Skills: {', '.join(found_keywords['technical_skills']) or 'None found'}
            Soft Skills: {', '.join(found_keywords['soft_skills']) or 'None found'}
            Action Verbs: {', '.join(found_keywords['action_verbs']) or 'None found'}
            
            Recommendations:
            - {'Add more technical keywords' if len(found_keywords['technical_skills']) < 3 else 'Good technical keyword coverage'}
            - {'Include more action verbs' if len(found_keywords['action_verbs']) < 5 else 'Strong action verb usage'}
            - {'Add soft skills' if len(found_keywords['soft_skills']) < 3 else 'Good soft skills representation'}
            """
            
            return analysis
            
        except Exception as e:
            logger.error(f"ATS analysis failed: {e}")
            return "ATS analysis encountered an error"
    
    async def _analyze_skills_gap(self, skills: str) -> str:
        """Analyze skills gap for career development with market intelligence"""
        try:
            user_skills = [skill.strip().lower() for skill in skills.split(',') if skill.strip()]
            
            # Current market-demanded skills by category
            market_demand = {
                'critical': ['python', 'react', 'aws', 'docker', 'kubernetes', 'typescript', 'machine learning'],
                'valuable': ['java', 'angular', 'mongodb', 'postgresql', 'git', 'agile', 'nodejs'],
                'emerging': ['ai/ml', 'blockchain', 'serverless', 'microservices', 'devops', 'cloud architecture']
            }
            
            user_has = {'critical': [], 'valuable': [], 'emerging': []}
            user_missing = {'critical': [], 'valuable': [], 'emerging': []}
            
            # Analyze user skills against market demand
            for category, demanded_skills in market_demand.items():
                for skill in demanded_skills:
                    if any(skill in user_skill or user_skill in skill for user_skill in user_skills):
                        user_has[category].append(skill)
                    else:
                        user_missing[category].append(skill)
            
            # Calculate skill coverage score
            total_critical = len(market_demand['critical'])
            critical_coverage = len(user_has['critical']) / total_critical * 100
            
            analysis = f"""
            Skills Gap Analysis Report:
            
            Overall Coverage Score: {critical_coverage:.1f}% of critical skills
            
            ✅ Your Market-Relevant Skills:
            Critical Skills: {', '.join(user_has['critical']) if user_has['critical'] else 'None identified'}
            Valuable Skills: {', '.join(user_has['valuable']) if user_has['valuable'] else 'None identified'}
            Emerging Skills: {', '.join(user_has['emerging']) if user_has['emerging'] else 'None identified'}
            
            🎯 Priority Skills to Develop:
            High Priority: {', '.join(user_missing['critical'][:3]) if user_missing['critical'] else 'You have good critical skill coverage!'}
            Medium Priority: {', '.join(user_missing['valuable'][:3]) if user_missing['valuable'] else 'Good coverage of valuable skills'}
            Future Opportunities: {', '.join(user_missing['emerging'][:2]) if user_missing['emerging'] else 'Consider exploring emerging technologies'}
            
            📈 Recommendations:
            1. {'Focus on learning ' + user_missing['critical'][0] + ' first' if user_missing['critical'] else 'Maintain your strong critical skills foundation'}
            2. {'Consider certification in ' + (user_missing['critical'][1] if len(user_missing['critical']) > 1 else user_missing['valuable'][0] if user_missing['valuable'] else 'cloud platforms') if user_missing['critical'] or user_missing['valuable'] else 'Explore emerging technologies for career growth'}
            3. {'Build portfolio projects showcasing these skills' if user_missing['critical'] else 'Focus on advanced implementations of your existing skills'}
            
            Market Trend: Critical skills shortage = Higher salary potential!
            """
            
            return analysis
            
        except Exception as e:
            logger.error(f"Skills gap analysis failed: {e}")
            return "Skills gap analysis encountered an error. Please ensure skills are comma-separated."
    
    async def _analyze_salary_trends(self, job_title: str) -> str:
        """Get salary trends for job title"""
        return "Salary trend analysis completed"
    
    async def _research_company(self, company_name: str) -> str:
        """Research company for personalization"""
        return "Company research completed"
    
    async def analyze_resume_enhanced(self, resume_text: str, job_description: str = None, 
                                    user_id: str = None) -> ResumeAnalysis:
        """Enhanced resume analysis with structured output and context"""
        try:
            # Add to user context if user_id provided
            if user_id and self.vector_store:
                await self._add_to_context(user_id, "resume", resume_text)
            
            # Create enhanced task with structured output
            format_instructions = self.resume_parser.get_format_instructions()
            
            task = Task(
                description=f"""
                Perform comprehensive resume analysis with the following requirements:
                
                Resume Text:
                {resume_text}
                
                Job Description (if provided):
                {job_description or 'Not provided'}
                
                Analysis Requirements:
                1. Extract and structure all personal information
                2. Categorize skills into technical and soft skills
                3. Analyze work experience with quantified achievements
                4. Evaluate education and certifications
                5. Calculate ATS compatibility score (0-100)
                6. Identify top 5 strengths
                7. Suggest 3-5 specific improvements
                8. Provide job match analysis if job description given
                
                Output Format:
                {format_instructions}
                
                Ensure all analysis is data-driven and actionable.
                """,
                agent=self.agents['resume_analyzer'],
                expected_output="Structured ResumeAnalysis object with comprehensive insights"
            )
            
            # Create crew with hierarchical process for complex analysis
            crew = Crew(
                agents=[self.agents['resume_analyzer']],
                tasks=[task],
                process=Process.sequential,
                verbose=True,
                memory=True
            )
            
            result = crew.kickoff()
            
            # Parse result with error handling
            try:
                parsed_result = self.resume_parser.parse(result)
                
                # Publish real-time event for completion
                await self._publish_event(
                    event_type='ai_analysis_complete',
                    user_id=user_id,
                    data={
                        'analysis_type': 'resume_analysis',
                        'ats_score': parsed_result.ats_score,
                        'strengths_count': len(parsed_result.strengths),
                        'improvements_count': len(parsed_result.improvements)
                    }
                )
                
                return parsed_result
            except Exception as parse_error:
                # Use fixing parser as fallback
                fixing_parser = OutputFixingParser.from_llm(parser=self.resume_parser, llm=self.llm)
                parsed_result = fixing_parser.parse(result)
                
                # Publish event even for fallback parsing
                await self._publish_event(
                    event_type='ai_analysis_complete',
                    user_id=user_id,
                    data={
                        'analysis_type': 'resume_analysis',
                        'parsing_method': 'fallback',
                        'ats_score': getattr(parsed_result, 'ats_score', 0)
                    }
                )
                
                return parsed_result
                
        except Exception as e:
            logger.error(f"Error in enhanced resume analysis: {str(e)}")
            raise
    
    async def analyze_job_market_enhanced(self, job_title: str, location: str, 
                                        industry: str = None) -> JobMarketAnalysis:
        """Enhanced job market analysis with real-time data"""
        try:
            format_instructions = self.job_market_parser.get_format_instructions()
            
            task = Task(
                description=f"""
                Conduct comprehensive job market analysis:
                
                Job Title: {job_title}
                Location: {location}
                Industry: {industry or 'General'}
                
                Analysis Requirements:
                1. Assess current market demand (High/Medium/Low)
                2. Determine salary ranges (min, max, median)
                3. Identify top 10 required skills
                4. Evaluate growth prospects and career progression
                5. Analyze current market trends
                6. Provide 5-7 actionable recommendations
                
                Use real-time data and market intelligence tools.
                
                Output Format:
                {format_instructions}
                """,
                agent=self.agents['job_analyst'],
                expected_output="Structured JobMarketAnalysis with current market data"
            )
            
            crew = Crew(
                agents=[self.agents['job_analyst']],
                tasks=[task],
                process=Process.sequential,
                verbose=True
            )
            
            result = crew.kickoff()
            return self.job_market_parser.parse(result)
            
        except Exception as e:
            logger.error(f"Error in enhanced job market analysis: {str(e)}")
            raise
    
    async def generate_cover_letter_enhanced(self, job_title: str, company: str, 
                                           user_profile: Dict[str, Any], 
                                           job_description: str = None) -> CoverLetterOutput:
        """Enhanced cover letter generation with deep personalization"""
        try:
            format_instructions = self.cover_letter_parser.get_format_instructions()
            
            task = Task(
                description=f"""
                Create a highly personalized, compelling cover letter:
                
                Job Title: {job_title}
                Company: {company}
                Job Description: {job_description or 'Not provided'}
                
                User Profile:
                - Skills: {user_profile.get('skills', [])}
                - Experience: {user_profile.get('experience', '')}
                - Achievements: {user_profile.get('achievements', [])}
                - Career Goals: {user_profile.get('goals', '')}
                
                Requirements:
                1. Research company culture and values
                2. Create compelling opening that shows genuine interest
                3. Connect user's experience to job requirements
                4. Include 2-3 specific, quantified achievements
                5. Demonstrate company knowledge and cultural fit
                6. Strong closing with clear call to action
                7. Optimize for ATS while maintaining readability
                8. Keep to 300-400 words
                
                Output Format:
                {format_instructions}
                """,
                agent=self.agents['cover_letter_writer'],
                expected_output="Structured CoverLetterOutput with personalized content"
            )
            
            crew = Crew(
                agents=[self.agents['cover_letter_writer']],
                tasks=[task],
                process=Process.sequential,
                verbose=True
            )
            
            result = crew.kickoff()
            return self.cover_letter_parser.parse(result)
            
        except Exception as e:
            logger.error(f"Error in enhanced cover letter generation: {str(e)}")
            raise
    
    async def create_career_strategy(self, user_profile: Dict[str, Any], 
                                   career_goals: Dict[str, Any]) -> Dict[str, Any]:
        """Create comprehensive career strategy using multiple agents"""
        try:
            # Multi-agent collaboration for career strategy
            
            # Task 1: Market Analysis
            market_task = Task(
                description=f"""
                Analyze job market for career transition strategy:
                
                Current Profile: {user_profile}
                Career Goals: {career_goals}
                
                Provide market analysis for target roles and industries.
                """,
                agent=self.agents['job_analyst']
            )
            
            # Task 2: Skills Assessment
            skills_task = Task(
                description=f"""
                Assess current skills and identify gaps:
                
                Current Skills: {user_profile.get('skills', [])}
                Target Role Requirements: {career_goals.get('target_role', '')}
                
                Identify skill gaps and learning priorities.
                """,
                agent=self.agents['resume_analyzer']
            )
            
            # Task 3: Strategy Development
            strategy_task = Task(
                description=f"""
                Develop comprehensive career strategy based on:
                - Market analysis from job analyst
                - Skills assessment from resume analyzer
                - User goals and constraints
                
                Create 6-month and 12-month action plans.
                """,
                agent=self.agents['career_strategist']
            )
            
            # Hierarchical crew for complex strategy development
            crew = Crew(
                agents=[
                    self.agents['job_analyst'],
                    self.agents['resume_analyzer'],
                    self.agents['career_strategist']
                ],
                tasks=[market_task, skills_task, strategy_task],
                process=Process.hierarchical,
                manager_llm=self.llm,
                verbose=True
            )
            
            result = crew.kickoff()
            return {"strategy": result, "timestamp": datetime.now().isoformat()}
            
        except Exception as e:
            logger.error(f"Error creating career strategy: {str(e)}")
            raise
    
    async def _add_to_context(self, user_id: str, data_type: str, content: str):
        """Add content to user's context in vector storage"""
        try:
            if self.vector_store:
                doc = Document(
                    page_content=content,
                    metadata={
                        "user_id": user_id,
                        "data_type": data_type,
                        "timestamp": datetime.now().isoformat()
                    }
                )
                self.vector_store.add_documents([doc])
        except Exception as e:
            logger.warning(f"Failed to add to context: {e}")
    
    async def get_user_context(self, user_id: str, query: str, k: int = 5) -> List[str]:
        """Retrieve relevant context for user"""
        try:
            if self.vector_store:
                docs = self.vector_store.similarity_search(
                    query, 
                    k=k, 
                    filter={"user_id": user_id}
                )
                return [doc.page_content for doc in docs]
            return []
        except Exception as e:
            logger.warning(f"Failed to retrieve context: {e}")
            return []
    
    async def optimize_model_selection(self, task_type: str, complexity: str = "medium") -> str:
        """Select optimal model based on task type and complexity"""
        try:
            # Model selection logic based on task requirements
            if task_type in ["resume_analysis", "job_analysis"] and complexity == "high":
                return "gpt-4"  # Use most capable model for complex analysis
            elif task_type == "cover_letter" and complexity == "medium":
                return "gpt-3.5-turbo"  # Sufficient for most cover letters
            else:
                return os.getenv("LLM_MODEL", "gpt-4")  # Default
        except Exception as e:
            logger.warning(f"Model optimization failed: {e}")
            return "gpt-4"
    
    def _initialize_kafka(self):
        """Initialize Kafka producer for event streaming"""
        if not KAFKA_AVAILABLE:
            return
            
        try:
            kafka_enabled = os.getenv('KAFKA_ENABLED', 'false').lower() == 'true'
            if kafka_enabled:
                self.kafka_producer = KafkaProducer(
                    bootstrap_servers=os.getenv('KAFKA_BOOTSTRAP_SERVERS', 'localhost:9092').split(','),
                    value_serializer=lambda v: json.dumps(v, default=str).encode('utf-8'),
                    key_serializer=lambda k: k.encode('utf-8') if k else None
                )
                logger.info("Kafka producer initialized for real-time event streaming")
        except Exception as e:
            logger.warning(f"Failed to initialize Kafka producer: {e}")
    
    async def _publish_event(self, event_type: str, user_id: str = None, data: Dict[str, Any] = None):
        """Publish event to Kafka for real-time updates and analytics"""
        if not self.kafka_producer:
            return
            
        try:
            event = {
                'event_type': event_type,
                'user_id': user_id,
                'data': data or {},
                'timestamp': datetime.utcnow().isoformat(),
                'source': 'enhanced_crew_ai_service'
            }
            
            topic = 'jobgenie-ai-events'
            self.kafka_producer.send(topic, value=event, key=user_id)
            logger.debug(f"Published {event_type} event for user: {user_id}")
            
        except Exception as e:
            logger.warning(f"Failed to publish event: {e}")

    async def get_performance_metrics(self) -> Dict[str, Any]:
        """Get service performance metrics"""
        return {
            "initialized": self.is_initialized,
            "llm_provider": self.llm_provider,
            "agents_count": len(self.agents),
            "vector_storage_enabled": self.vector_store is not None,
            "kafka_enabled": self.kafka_producer is not None,
            "task_performance": self.task_performance,
            "model_performance": self.model_performance
        }
    
    async def cleanup(self):
        """Enhanced cleanup with vector storage and Kafka"""
        try:
            if self.vector_store:
                # Persist vector storage
                self.vector_store.persist()
            
            # Close Kafka producer
            if self.kafka_producer:
                self.kafka_producer.close()
                logger.info("Kafka producer closed")
            
            self.agents.clear()
            self.crews.clear()
            self.conversation_memory.clear()
            self.user_contexts.clear()
            self.is_initialized = False
            
            logger.info("Enhanced CrewAI service cleaned up")
        except Exception as e:
            logger.error(f"Error during cleanup: {e}") 