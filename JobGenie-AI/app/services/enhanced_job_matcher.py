"""
Enhanced AI Job Matching Service with Advanced Algorithms
"""
import asyncio
import json
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass
from enum import Enum

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import RandomForestRegressor
from sklearn.cluster import KMeans

from langchain_community.embeddings import OpenAIEmbeddings
from langchain.schema import Document
from langchain_community.vectorstores import FAISS
from langchain_community.llms import OpenAI
from langchain.chains import LLMChain
from langchain.prompts import PromptTemplate

from ..core.config import settings


class MatchType(Enum):
    SKILLS_BASED = "skills_based"
    EXPERIENCE_BASED = "experience_based"
    SEMANTIC_BASED = "semantic_based"
    CAREER_GROWTH = "career_growth"
    SALARY_OPTIMIZED = "salary_optimized"
    CULTURE_FIT = "culture_fit"


@dataclass
class JobMatch:
    job_id: str
    job_title: str
    company: str
    location: str
    match_score: float
    confidence: float
    match_reasons: List[str]
    missing_skills: List[str]
    growth_potential: float
    salary_range: Optional[Tuple[int, int]]
    match_type: MatchType
    application_difficulty: str  # "easy", "medium", "hard"
    success_probability: float
    career_advancement_score: float
    metadata: Dict[str, Any]


@dataclass
class UserProfile:
    user_id: str
    skills: List[str]
    experience_years: int
    education_level: str
    preferred_locations: List[str]
    preferred_salary_range: Tuple[int, int]
    career_goals: List[str]
    work_preferences: Dict[str, Any]
    resume_text: str
    job_history: List[Dict[str, Any]]
    certifications: List[str]
    languages: List[str]
    current_role: Optional[str]


class EnhancedJobMatcher:
    def __init__(self):
        self.logger = logging.getLogger(__name__)
        self.embeddings = OpenAIEmbeddings(openai_api_key=settings.openai_api_key)
        self.llm = OpenAI(openai_api_key=settings.openai_api_key, temperature=0.3)
        
        # Initialize ML models
        self.skill_vectorizer = TfidfVectorizer(max_features=1000, stop_words='english')
        self.salary_predictor = RandomForestRegressor(n_estimators=100)
        self.career_clusterer = KMeans(n_clusters=10)
        self.scaler = StandardScaler()
        
        # Precomputed embeddings cache
        self.job_embeddings_cache = {}
        self.user_embeddings_cache = {}
        
        # Initialize scoring weights
        self.scoring_weights = {
            'skills_match': 0.25,
            'experience_match': 0.20,
            'semantic_similarity': 0.20,
            'salary_alignment': 0.15,
            'location_preference': 0.10,
            'career_growth': 0.10
        }

    async def find_matches(
        self, 
        user_profile: UserProfile, 
        available_jobs: List[Dict[str, Any]],
        match_types: List[MatchType] = None,
        limit: int = 50
    ) -> List[JobMatch]:
        """
        Find job matches using multiple AI algorithms
        """
        if match_types is None:
            match_types = [MatchType.SKILLS_BASED, MatchType.SEMANTIC_BASED, MatchType.CAREER_GROWTH]

        all_matches = []
        
        for match_type in match_types:
            matches = await self._get_matches_by_type(user_profile, available_jobs, match_type, limit)
            all_matches.extend(matches)

        # Combine and deduplicate matches
        combined_matches = self._combine_matches(all_matches)
        
        # Apply advanced scoring
        enhanced_matches = await self._enhance_match_scores(user_profile, combined_matches)
        
        # Sort by overall score and return top matches
        enhanced_matches.sort(key=lambda x: x.match_score, reverse=True)
        
        return enhanced_matches[:limit]

    async def _get_matches_by_type(
        self, 
        user_profile: UserProfile, 
        jobs: List[Dict[str, Any]], 
        match_type: MatchType,
        limit: int
    ) -> List[JobMatch]:
        """Get matches based on specific matching algorithm"""
        
        if match_type == MatchType.SKILLS_BASED:
            return await self._skills_based_matching(user_profile, jobs, limit)
        elif match_type == MatchType.SEMANTIC_BASED:
            return await self._semantic_matching(user_profile, jobs, limit)
        elif match_type == MatchType.CAREER_GROWTH:
            return await self._career_growth_matching(user_profile, jobs, limit)
        elif match_type == MatchType.SALARY_OPTIMIZED:
            return await self._salary_optimized_matching(user_profile, jobs, limit)
        elif match_type == MatchType.CULTURE_FIT:
            return await self._culture_fit_matching(user_profile, jobs, limit)
        else:
            return await self._experience_based_matching(user_profile, jobs, limit)

    async def _skills_based_matching(
        self, 
        user_profile: UserProfile, 
        jobs: List[Dict[str, Any]], 
        limit: int
    ) -> List[JobMatch]:
        """Advanced skills-based matching with skill importance weighting"""
        
        user_skills = set(skill.lower() for skill in user_profile.skills)
        matches = []

        for job in jobs:
            required_skills = set(skill.lower() for skill in job.get('required_skills', []))
            preferred_skills = set(skill.lower() for skill in job.get('preferred_skills', []))
            
            # Calculate weighted skill match
            required_matches = user_skills.intersection(required_skills)
            preferred_matches = user_skills.intersection(preferred_skills)
            
            # Weight required skills more heavily
            required_score = len(required_matches) / max(len(required_skills), 1) * 0.8
            preferred_score = len(preferred_matches) / max(len(preferred_skills), 1) * 0.2
            
            skills_score = required_score + preferred_score
            
            # Calculate missing critical skills
            missing_skills = list(required_skills - user_skills)
            
            # Adjust score based on experience level and missing skills
            experience_factor = min(user_profile.experience_years / job.get('min_experience', 1), 2.0)
            missing_penalty = len(missing_skills) * 0.1
            
            final_score = (skills_score * experience_factor) - missing_penalty
            final_score = max(0, min(1, final_score))

            if final_score > 0.3:  # Minimum threshold
                match_reasons = [
                    f"Matched {len(required_matches)} of {len(required_skills)} required skills",
                    f"Matched {len(preferred_matches)} preferred skills"
                ]

                matches.append(JobMatch(
                    job_id=job['id'],
                    job_title=job['title'],
                    company=job['company'],
                    location=job['location'],
                    match_score=final_score,
                    confidence=0.85,
                    match_reasons=match_reasons,
                    missing_skills=missing_skills,
                    growth_potential=self._calculate_growth_potential(user_profile, job),
                    salary_range=job.get('salary_range'),
                    match_type=MatchType.SKILLS_BASED,
                    application_difficulty=self._assess_application_difficulty(user_profile, job),
                    success_probability=self._calculate_success_probability(user_profile, job),
                    career_advancement_score=self._calculate_career_advancement(user_profile, job),
                    metadata={'algorithm': 'skills_weighted', 'experience_factor': experience_factor}
                ))

        return sorted(matches, key=lambda x: x.match_score, reverse=True)[:limit]

    async def _semantic_matching(
        self, 
        user_profile: UserProfile, 
        jobs: List[Dict[str, Any]], 
        limit: int
    ) -> List[JobMatch]:
        """Semantic matching using embeddings and AI understanding"""
        
        # Create user embedding
        user_text = f"""
        Resume: {user_profile.resume_text}
        Skills: {', '.join(user_profile.skills)}
        Experience: {user_profile.experience_years} years
        Career Goals: {', '.join(user_profile.career_goals)}
        Current Role: {user_profile.current_role or 'Not specified'}
        """
        
        user_embedding = await self._get_embedding(user_text, f"user_{user_profile.user_id}")
        
        matches = []
        
        for job in jobs:
            # Create job embedding
            job_text = f"""
            Job Title: {job['title']}
            Company: {job['company']}
            Description: {job.get('description', '')}
            Requirements: {job.get('requirements', '')}
            Skills: {', '.join(job.get('required_skills', []))}
            """
            
            job_embedding = await self._get_embedding(job_text, f"job_{job['id']}")
            
            # Calculate semantic similarity
            similarity = cosine_similarity([user_embedding], [job_embedding])[0][0]
            
            # Enhance with contextual understanding
            context_score = await self._get_contextual_match_score(user_profile, job)
            
            # Combine scores
            final_score = (similarity * 0.7) + (context_score * 0.3)
            
            if final_score > 0.4:
                match_reasons = [
                    f"High semantic similarity ({similarity:.2f})",
                    f"Strong contextual alignment ({context_score:.2f})"
                ]

                matches.append(JobMatch(
                    job_id=job['id'],
                    job_title=job['title'],
                    company=job['company'],
                    location=job['location'],
                    match_score=final_score,
                    confidence=0.9,
                    match_reasons=match_reasons,
                    missing_skills=await self._identify_missing_skills_ai(user_profile, job),
                    growth_potential=self._calculate_growth_potential(user_profile, job),
                    salary_range=job.get('salary_range'),
                    match_type=MatchType.SEMANTIC_BASED,
                    application_difficulty=self._assess_application_difficulty(user_profile, job),
                    success_probability=self._calculate_success_probability(user_profile, job),
                    career_advancement_score=self._calculate_career_advancement(user_profile, job),
                    metadata={'semantic_similarity': similarity, 'context_score': context_score}
                ))

        return sorted(matches, key=lambda x: x.match_score, reverse=True)[:limit]

    async def _career_growth_matching(
        self, 
        user_profile: UserProfile, 
        jobs: List[Dict[str, Any]], 
        limit: int
    ) -> List[JobMatch]:
        """Match jobs based on career advancement potential"""
        
        matches = []
        
        for job in jobs:
            # Calculate career trajectory score
            trajectory_score = await self._calculate_career_trajectory(user_profile, job)
            
            # Assess learning opportunities
            learning_score = self._assess_learning_opportunities(job)
            
            # Check for promotion potential
            promotion_score = self._assess_promotion_potential(user_profile, job)
            
            # Industry growth factor
            industry_growth = self._get_industry_growth_factor(job.get('industry', ''))
            
            # Combine factors
            growth_score = (
                trajectory_score * 0.4 +
                learning_score * 0.3 +
                promotion_score * 0.2 +
                industry_growth * 0.1
            )

            if growth_score > 0.5:
                match_reasons = [
                    f"Strong career trajectory alignment ({trajectory_score:.2f})",
                    f"Excellent learning opportunities ({learning_score:.2f})",
                    f"Good promotion potential ({promotion_score:.2f})"
                ]

                matches.append(JobMatch(
                    job_id=job['id'],
                    job_title=job['title'],
                    company=job['company'],
                    location=job['location'],
                    match_score=growth_score,
                    confidence=0.75,
                    match_reasons=match_reasons,
                    missing_skills=self._identify_growth_skills(user_profile, job),
                    growth_potential=growth_score,
                    salary_range=job.get('salary_range'),
                    match_type=MatchType.CAREER_GROWTH,
                    application_difficulty=self._assess_application_difficulty(user_profile, job),
                    success_probability=self._calculate_success_probability(user_profile, job),
                    career_advancement_score=growth_score,
                    metadata={
                        'trajectory_score': trajectory_score,
                        'learning_score': learning_score,
                        'promotion_score': promotion_score,
                        'industry_growth': industry_growth
                    }
                ))

        return sorted(matches, key=lambda x: x.career_advancement_score, reverse=True)[:limit]

    async def _get_embedding(self, text: str, cache_key: str) -> np.ndarray:
        """Get text embedding with caching"""
        if cache_key in self.job_embeddings_cache:
            return self.job_embeddings_cache[cache_key]
        
        embedding = await self.embeddings.aembed_query(text)
        self.job_embeddings_cache[cache_key] = np.array(embedding)
        return np.array(embedding)

    async def _get_contextual_match_score(self, user_profile: UserProfile, job: Dict[str, Any]) -> float:
        """Use AI to assess contextual fit between user and job"""
        
        prompt = PromptTemplate(
            input_variables=["user_profile", "job_description"],
            template="""
            Analyze how well this user profile matches the job requirements on a scale of 0-1:

            User Profile:
            - Experience: {user_experience} years
            - Skills: {user_skills}
            - Career Goals: {career_goals}
            - Current Role: {current_role}

            Job:
            - Title: {job_title}
            - Company: {company}
            - Requirements: {requirements}
            - Description: {description}

            Consider:
            1. Skill alignment and transferability
            2. Experience level appropriateness
            3. Career progression logic
            4. Cultural and role fit
            5. Growth opportunity alignment

            Return only a score between 0 and 1:
            """
        )

        chain = LLMChain(llm=self.llm, prompt=prompt)
        
        try:
            result = await chain.arun(
                user_experience=user_profile.experience_years,
                user_skills=", ".join(user_profile.skills),
                career_goals=", ".join(user_profile.career_goals),
                current_role=user_profile.current_role or "Not specified",
                job_title=job['title'],
                company=job['company'],
                requirements=job.get('requirements', ''),
                description=job.get('description', '')
            )
            
            # Extract numeric score
            score = float(result.strip())
            return max(0, min(1, score))
        except:
            return 0.5  # Default score if AI fails

    def _calculate_growth_potential(self, user_profile: UserProfile, job: Dict[str, Any]) -> float:
        """Calculate career growth potential for this job"""
        
        # Base factors
        seniority_match = self._assess_seniority_alignment(user_profile, job)
        skill_stretch = self._assess_skill_stretch_opportunity(user_profile, job)
        company_reputation = job.get('company_rating', 3) / 5.0
        role_advancement = self._assess_role_advancement_potential(job)
        
        growth_score = (
            seniority_match * 0.3 +
            skill_stretch * 0.3 +
            company_reputation * 0.2 +
            role_advancement * 0.2
        )
        
        return max(0, min(1, growth_score))

    def _assess_application_difficulty(self, user_profile: UserProfile, job: Dict[str, Any]) -> str:
        """Assess how difficult it would be to successfully apply for this job"""
        
        # Calculate difficulty factors
        experience_gap = max(0, job.get('min_experience', 0) - user_profile.experience_years)
        skill_gap = len(set(job.get('required_skills', [])) - set(user_profile.skills))
        education_gap = self._calculate_education_gap(user_profile, job)
        competition_level = job.get('competition_level', 'medium')
        
        # Calculate difficulty score
        difficulty_score = (
            experience_gap * 0.4 +
            skill_gap * 0.3 +
            education_gap * 0.2 +
            (0.5 if competition_level == 'high' else 0.25 if competition_level == 'medium' else 0) * 0.1
        )
        
        if difficulty_score <= 0.3:
            return "easy"
        elif difficulty_score <= 0.6:
            return "medium"
        else:
            return "hard"

    def _calculate_success_probability(self, user_profile: UserProfile, job: Dict[str, Any]) -> float:
        """Calculate probability of application success"""
        
        skill_alignment = len(set(user_profile.skills) & set(job.get('required_skills', []))) / max(len(job.get('required_skills', [])), 1)
        experience_fit = min(user_profile.experience_years / max(job.get('min_experience', 1), 1), 2.0) / 2.0
        location_match = 1.0 if job['location'] in user_profile.preferred_locations else 0.5
        education_match = self._calculate_education_match(user_profile, job)
        
        success_probability = (
            skill_alignment * 0.4 +
            experience_fit * 0.3 +
            education_match * 0.2 +
            location_match * 0.1
        )
        
        return max(0, min(1, success_probability))

    # Additional helper methods would be implemented here...
    def _combine_matches(self, all_matches: List[JobMatch]) -> List[JobMatch]:
        """Combine matches from different algorithms and deduplicate"""
        job_matches = {}
        
        for match in all_matches:
            if match.job_id in job_matches:
                # Combine scores using weighted average
                existing = job_matches[match.job_id]
                combined_score = (existing.match_score + match.match_score) / 2
                combined_confidence = max(existing.confidence, match.confidence)
                combined_reasons = list(set(existing.match_reasons + match.match_reasons))
                
                # Update with best attributes
                job_matches[match.job_id] = JobMatch(
                    job_id=match.job_id,
                    job_title=match.job_title,
                    company=match.company,
                    location=match.location,
                    match_score=combined_score,
                    confidence=combined_confidence,
                    match_reasons=combined_reasons,
                    missing_skills=match.missing_skills,
                    growth_potential=max(existing.growth_potential, match.growth_potential),
                    salary_range=match.salary_range,
                    match_type=match.match_type,
                    application_difficulty=match.application_difficulty,
                    success_probability=max(existing.success_probability, match.success_probability),
                    career_advancement_score=max(existing.career_advancement_score, match.career_advancement_score),
                    metadata={**existing.metadata, **match.metadata}
                )
            else:
                job_matches[match.job_id] = match
        
        return list(job_matches.values())

    async def _enhance_match_scores(self, user_profile: UserProfile, matches: List[JobMatch]) -> List[JobMatch]:
        """Apply final enhancements to match scores"""
        enhanced_matches = []
        
        for match in matches:
            # Apply user preference adjustments
            preference_bonus = self._calculate_preference_bonus(user_profile, match)
            
            # Apply market condition adjustments
            market_adjustment = self._get_market_adjustment(match)
            
            # Calculate final enhanced score
            enhanced_score = (
                match.match_score * 0.8 +
                preference_bonus * 0.15 +
                market_adjustment * 0.05
            )
            
            match.match_score = max(0, min(1, enhanced_score))
            enhanced_matches.append(match)
        
        return enhanced_matches

    # Implement remaining helper methods...
    def _calculate_preference_bonus(self, user_profile: UserProfile, match: JobMatch) -> float:
        """Calculate bonus based on user preferences"""
        # Implementation details...
        return 0.1
    
    def _get_market_adjustment(self, match: JobMatch) -> float:
        """Get market condition adjustment"""
        # Implementation details...
        return 0.05
        
    # ... (implement all other helper methods) 