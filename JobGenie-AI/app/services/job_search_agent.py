import asyncio
import json
import logging
import os
from crewai import Agent, Task, Crew, Process
from crewai.tools import BaseTool
from datetime import datetime
from pydantic import BaseModel, Field
from typing import Dict, List, Any, Optional

# Import the job aggregator
from .job_aggregator import JobAggregator

logger = logging.getLogger(__name__)

class JobSearchTool(BaseTool):
    name: str = "job_search_tool"
    description: str = "Search for jobs across multiple platforms like LinkedIn, Indeed, Naukri, Glassdoor, and Monster"

    def __init__(self):
        super().__init__()
        self.job_aggregator = JobAggregator()

    async def _run(self, keywords: str, location: str, max_jobs: int = 20) -> str:
        """Search for jobs using the job aggregator"""
        try:
            # Parse keywords into a list
            keyword_list = [kw.strip() for kw in keywords.split(',') if kw.strip()]
            
            # Initialize the job aggregator
            await self.job_aggregator.initialize()
            
            # Search jobs across multiple platforms
            jobs = await self.job_aggregator.search_jobs(
                keywords=keyword_list,
                location=location,
                platforms=['linkedin', 'indeed', 'naukri', 'glassdoor', 'monster'],
                max_jobs=max_jobs
            )
            
            # Clean up resources
            await self.job_aggregator.cleanup()
            
            # Format the results
            if jobs:
                results = []
                for job in jobs:
                    job_info = {
                        'id': job.get('id', ''),
                        'title': job.get('title', ''),
                        'company': job.get('company', ''),
                        'location': job.get('location', ''),
                        'platform': job.get('platform', ''),
                        'url': job.get('url', ''),
                        'posted_date': job.get('posted_date', ''),
                        'description': job.get('description', ''),
                        'salary_range': job.get('salary_range', ''),
                        'match_score': job.get('match_score', 0),
                        'skills_required': job.get('skills_required', [])
                    }
                    results.append(job_info)
                
                return json.dumps({
                    'status': 'success',
                    'total_jobs': len(results),
                    'jobs': results
                }, indent=2)
            else:
                return json.dumps({
                    'status': 'no_jobs_found',
                    'message': f'No jobs found for keywords: {keywords} in location: {location}',
                    'jobs': []
                }, indent=2)
                
        except Exception as e:
            logger.error(f"Error in job search tool: {e}")
            return json.dumps({
                'status': 'error',
                'message': f'Error searching jobs: {str(e)}',
                'jobs': []
            }, indent=2)

class JobMatchTool(BaseTool):
    name: str = "job_match_tool"
    description: str = "Analyze job matches based on resume skills and job requirements"

    def __init__(self):
        super().__init__()

    def _run(self, resume_skills: str, job_requirements: str) -> str:
        """Analyze job match based on skills"""
        try:
            # Parse skills
            resume_skill_list = [skill.strip().lower() for skill in resume_skills.split(',') if skill.strip()]
            job_req_list = [req.strip().lower() for req in job_requirements.split(',') if req.strip()]
            
            # Calculate match score
            matched_skills = set(resume_skill_list) & set(job_req_list)
            total_required = len(job_req_list)
            
            if total_required > 0:
                match_percentage = (len(matched_skills) / total_required) * 100
            else:
                match_percentage = 0
            
            # Determine match level
            if match_percentage >= 80:
                match_level = "Excellent"
                recommendation = "Strong match - highly recommended to apply"
            elif match_percentage >= 60:
                match_level = "Good"
                recommendation = "Good match - worth applying"
            elif match_percentage >= 40:
                match_level = "Fair"
                recommendation = "Moderate match - consider applying if interested"
            else:
                match_level = "Poor"
                recommendation = "Low match - consider other opportunities"
            
            return json.dumps({
                'status': 'success',
                'match_percentage': round(match_percentage, 2),
                'match_level': match_level,
                'matched_skills': list(matched_skills),
                'missing_skills': list(set(job_req_list) - set(resume_skill_list)),
                'recommendation': recommendation
            }, indent=2)
            
        except Exception as e:
            logger.error(f"Error in job match tool: {e}")
            return json.dumps({
                'status': 'error',
                'message': f'Error analyzing job match: {str(e)}'
            }, indent=2)

class JobSearchAgent:
    def __init__(self):
        self.job_search_tool = JobSearchTool()
        self.job_match_tool = JobMatchTool()
        
        # Initialize the CrewAI agent
        self.agent = Agent(
            role='Job Search Specialist',
            goal='Find the best job opportunities across multiple platforms and analyze job matches',
            backstory="""You are an expert job search specialist with deep knowledge of 
            multiple job platforms including LinkedIn, Indeed, Naukri, Glassdoor, and Monster. 
            You excel at finding relevant job opportunities and analyzing job matches based on 
            candidate skills and job requirements.""",
            verbose=True,
            allow_delegation=False,
            tools=[self.job_search_tool, self.job_match_tool]
        )

    async def search_jobs(self, keywords: List[str], location: str, 
                         max_jobs: int = 20) -> Dict[str, Any]:
        """Search for jobs using the job search agent"""
        try:
            # Create a task for job search
            task = Task(
                description=f"""
                Search for jobs with the following criteria:
                - Keywords: {', '.join(keywords)}
                - Location: {location}
                - Maximum jobs: {max_jobs}
                
                Use the job_search_tool to find jobs across multiple platforms.
                Return detailed information about each job including title, company, 
                location, platform, URL, description, and match score.
                """,
                agent=self.agent,
                expected_output="""A JSON response with job search results including:
                - Total number of jobs found
                - List of jobs with detailed information
                - Each job should include: id, title, company, location, platform, 
                  url, posted_date, description, salary_range, match_score, skills_required"""
            )
            
            # Create and run the crew
            crew = Crew(
                agents=[self.agent],
                tasks=[task],
                verbose=True,
                process=Process.sequential
            )
            
            # Execute the task
            result = await crew.kickoff()
            
            # Parse the result
            try:
                if isinstance(result, str):
                    return json.loads(result)
                else:
                    return result
            except json.JSONDecodeError:
                # If result is not JSON, create a structured response
                return {
                    'status': 'success',
                    'result': str(result),
                    'jobs': []
                }
                
        except Exception as e:
            logger.error(f"Error in job search agent: {e}")
            return {
                'status': 'error',
                'message': f'Error searching jobs: {str(e)}',
                'jobs': []
            }

    async def analyze_job_matches(self, resume_skills: List[str], 
                                job_requirements: List[str]) -> Dict[str, Any]:
        """Analyze job matches based on skills"""
        try:
            # Create a task for job matching
            task = Task(
                description=f"""
                Analyze job matches based on the following:
                - Resume Skills: {', '.join(resume_skills)}
                - Job Requirements: {', '.join(job_requirements)}
                
                Use the job_match_tool to analyze the match between skills and requirements.
                Calculate match percentage and provide recommendations.
                """,
                agent=self.agent,
                expected_output="""A JSON response with job match analysis including:
                - Match percentage
                - Match level (Excellent/Good/Fair/Poor)
                - Matched skills
                - Missing skills
                - Recommendation"""
            )
            
            # Create and run the crew
            crew = Crew(
                agents=[self.agent],
                tasks=[task],
                verbose=True,
                process=Process.sequential
            )
            
            # Execute the task
            result = await crew.kickoff()
            
            # Parse the result
            try:
                if isinstance(result, str):
                    return json.loads(result)
                else:
                    return result
            except json.JSONDecodeError:
                return {
                    'status': 'success',
                    'result': str(result)
                }
                
        except Exception as e:
            logger.error(f"Error in job match analysis: {e}")
            return {
                'status': 'error',
                'message': f'Error analyzing job matches: {str(e)}'
            }

# Global instance
job_search_agent = JobSearchAgent() 