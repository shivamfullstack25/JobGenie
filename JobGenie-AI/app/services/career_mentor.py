import logging
from typing import Dict, Any, Optional
from .crew_ai_service import CrewAIService

logger = logging.getLogger(__name__)

class CareerMentor:
    def __init__(self):
        self.crew_ai_service = CrewAIService()
    
    async def get_advice(self, question: str, user_context: Dict[str, Any] = None) -> str:
        """Get personalized career advice"""
        await self.crew_ai_service.initialize()
        return await self.crew_ai_service.get_career_advice(question, user_context) 