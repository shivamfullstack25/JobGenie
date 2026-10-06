import logging
from typing import Dict, Any, Optional
from .crew_ai_service import CrewAIService

logger = logging.getLogger(__name__)

class MarketIntelligence:
    def __init__(self):
        self.crew_ai_service = CrewAIService()
    
    async def get_intelligence(self, job_title: str, location: str) -> Dict[str, Any]:
        """Get market intelligence for job search"""
        await self.crew_ai_service.initialize()
        return await self.crew_ai_service.get_market_intelligence(job_title, location) 