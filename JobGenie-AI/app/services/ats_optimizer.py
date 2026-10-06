import logging
from typing import Dict, Any, Optional
from .crew_ai_service import CrewAIService

logger = logging.getLogger(__name__)

class ATSOptimizer:
    def __init__(self):
        self.crew_ai_service = CrewAIService()
    
    async def optimize_resume(self, resume_content: str, job_description: str, target_score: int = 80) -> Dict[str, Any]:
        """Optimize resume for ATS systems"""
        await self.crew_ai_service.initialize()
        return await self.crew_ai_service.optimize_resume_for_ats(resume_content, job_description, target_score) 