import logging
from typing import Dict, Any, Optional
from .crew_ai_service import CrewAIService

logger = logging.getLogger(__name__)

class JobAnalyzer:
    def __init__(self):
        self.crew_ai_service = CrewAIService()
    
    async def analyze_job(self, job_title: str, location: str, job_description: str = None) -> Dict[str, Any]:
        """Analyze job market and provide insights"""
        await self.crew_ai_service.initialize()
        return await self.crew_ai_service.analyze_job_market(job_title, location, job_description) 