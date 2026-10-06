import logging
from typing import Dict, Any, Optional
from .crew_ai_service import CrewAIService

logger = logging.getLogger(__name__)

class ResumeParser:
    def __init__(self):
        self.crew_ai_service = CrewAIService()
    
    async def analyze_resume(self, resume_text: str, detailed: bool = False, job_description: str = None) -> Dict[str, Any]:
        """Analyze resume content and extract insights"""
        await self.crew_ai_service.initialize()
        return await self.crew_ai_service.analyze_resume(resume_text, detailed, job_description) 