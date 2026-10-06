import logging
from typing import Dict, Any, Optional, List
from .crew_ai_service import CrewAIService

logger = logging.getLogger(__name__)

class CoverLetterGenerator:
    def __init__(self):
        self.crew_ai_service = CrewAIService()
    
    async def generate_cover_letter(self, job_title: str, company: str, user_skills: List[str], 
                                  resume_summary: str = None, tone: str = "professional") -> str:
        """Generate personalized cover letter"""
        await self.crew_ai_service.initialize()
        return await self.crew_ai_service.generate_cover_letter(job_title, company, resume_summary, tone) 