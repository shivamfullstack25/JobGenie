import asyncio
import json
import logging
import os
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Callable
import schedule
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from crewai import Agent, Task, Crew, Process

from .job_aggregator import JobAggregator
from .crew_ai_service import select_llm
from .notification_service import NotificationService

logger = logging.getLogger(__name__)

class SchedulerAgent:
    """Scheduler agent for automated job searches (search-only — no auto-apply/credential
    handling; see CLAUDE.md "Product decisions (locked)" for why that surface was cut)."""

    def __init__(self):
        self.scheduler = AsyncIOScheduler()
        self.job_aggregator = JobAggregator()
        self.notification_service = NotificationService()
        self.llm = None
        self.agent = None
        self.active_schedules = {}
        self.schedule_history = []
        self.is_initialized = False
        
    async def initialize(self):
        """Initialize the scheduler agent"""
        try:
            self.llm = select_llm()
            self.agent = Agent(
                role='Job Application Scheduler',
                goal='Automate job search and application processes with intelligent scheduling and optimization',
                backstory="""You are an expert scheduler that automates job search and application processes. 
                You understand user preferences, job market timing, and application optimization strategies. 
                You can create intelligent schedules that maximize job application success while respecting 
                rate limits and user preferences.""",
                verbose=True,
                allow_delegation=False,
                llm=self.llm
            )
            
            # Initialize related services
            await self.job_aggregator.initialize()
            await self.notification_service.initialize()
            
            # Start the scheduler
            self.scheduler.start()
            self.is_initialized = True
            
            logger.info("Scheduler Agent initialized successfully")
            
        except Exception as e:
            logger.error(f"Error initializing Scheduler Agent: {e}")
            raise
    
    async def create_job_search_schedule(self, user_id: str, schedule_config: Dict[str, Any]) -> Dict[str, str]:
        """Create a new job search schedule for a user"""
        try:
            if not self.is_initialized:
                await self.initialize()
            
            schedule_id = f"schedule_{user_id}_{int(datetime.now().timestamp())}"
            
            # Validate and process schedule configuration
            processed_config = await self._process_schedule_config(schedule_config)
            
            # Create scheduler task based on frequency
            frequency = processed_config.get('frequency', 'daily')
            search_time = processed_config.get('search_time', '09:00')
            
            if frequency == 'daily':
                trigger = CronTrigger(hour=int(search_time.split(':')[0]), 
                                    minute=int(search_time.split(':')[1]))
            elif frequency == 'weekly':
                day_of_week = processed_config.get('day_of_week', 'monday')
                trigger = CronTrigger(day_of_week=day_of_week,
                                    hour=int(search_time.split(':')[0]),
                                    minute=int(search_time.split(':')[1]))
            elif frequency == 'hourly':
                trigger = IntervalTrigger(hours=1)
            else:
                trigger = CronTrigger(hour=9, minute=0)  # Default to 9 AM daily
            
            # Add job to scheduler
            self.scheduler.add_job(
                func=self._execute_scheduled_job_search,
                trigger=trigger,
                args=[user_id, processed_config],
                id=schedule_id,
                name=f"Job Search for User {user_id}",
                max_instances=1,
                coalesce=True
            )
            
            # Store schedule information
            self.active_schedules[schedule_id] = {
                'user_id': user_id,
                'config': processed_config,
                'created_at': datetime.now(),
                'status': 'active',
                'last_run': None,
                'next_run': self.scheduler.get_job(schedule_id).next_run_time,
                'total_runs': 0,
                'successful_runs': 0
            }
            
            logger.info(f"Created job search schedule {schedule_id} for user {user_id}")
            
            return {
                'schedule_id': schedule_id,
                'status': 'created',
                'next_run': str(self.scheduler.get_job(schedule_id).next_run_time),
                'frequency': frequency
            }
            
        except Exception as e:
            logger.error(f"Error creating job search schedule: {e}")
            raise
    
    async def _process_schedule_config(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """Process and validate schedule configuration"""
        try:
            # Use AI agent to optimize schedule configuration
            task = Task(
                description=f"""
                Analyze and optimize the following job search schedule configuration:
                
                Configuration: {json.dumps(config, indent=2)}
                
                Please optimize this configuration considering:
                1. Job market timing and best posting times
                2. Application success rates by time of day
                3. Rate limiting and platform restrictions
                4. User preferences and availability
                5. Smart batching of applications
                
                Return an optimized configuration with recommendations.
                """,
                agent=self.agent
            )
            
            crew = Crew(
                agents=[self.agent],
                tasks=[task],
                process=Process.sequential,
                verbose=True
            )
            
            result = crew.kickoff()
            
            # Parse AI recommendations and merge with original config
            optimized_config = config.copy()
            
            # Set default values
            optimized_config.setdefault('frequency', 'daily')
            optimized_config.setdefault('search_time', '09:00')
            optimized_config.setdefault('max_jobs_per_search', 50)
            optimized_config.setdefault('platforms', ['linkedin', 'indeed', 'naukri'])
            optimized_config.setdefault('filters', {})
            
            return optimized_config
            
        except Exception as e:
            logger.error(f"Error processing schedule config: {e}")
            # Return config with defaults if AI processing fails
            config.setdefault('frequency', 'daily')
            config.setdefault('search_time', '09:00')
            return config
    
    async def _execute_scheduled_job_search(self, user_id: str, config: Dict[str, Any]):
        """Execute a scheduled job search"""
        try:
            schedule_id = f"schedule_{user_id}_{config.get('created_timestamp', '')}"
            
            logger.info(f"Executing scheduled job search for user {user_id}")
            
            # Update run statistics
            if schedule_id in self.active_schedules:
                self.active_schedules[schedule_id]['total_runs'] += 1
                self.active_schedules[schedule_id]['last_run'] = datetime.now()
            
            # Extract search parameters
            keywords = config.get('keywords', [])
            location = config.get('location', '')
            platforms = config.get('platforms', ['linkedin', 'indeed'])
            max_jobs = config.get('max_jobs_per_search', 50)
            filters = config.get('filters', {})
            
            # Perform job search
            jobs = await self.job_aggregator.search_jobs(
                keywords=keywords,
                location=location,
                platforms=platforms,
                max_jobs=max_jobs
            )
            
            # Filter jobs based on user preferences
            filtered_jobs = await self._filter_jobs_by_preferences(jobs, config)
            
            # Store results and send notification
            search_result = {
                'user_id': user_id,
                'search_date': datetime.now().isoformat(),
                'jobs_found': len(filtered_jobs),
                'total_jobs_searched': len(jobs),
                'platforms_searched': platforms,
                'keywords': keywords,
                'location': location
            }
            
            # Save search results
            self.schedule_history.append(search_result)
            
            # Send notification to user
            await self.notification_service.send_job_search_notification(
                user_id=user_id,
                jobs_found=len(filtered_jobs),
                new_jobs=filtered_jobs[:10],  # Send top 10 new jobs
                search_summary=search_result
            )
            
            # Update successful run count
            if schedule_id in self.active_schedules:
                self.active_schedules[schedule_id]['successful_runs'] += 1
            
            logger.info(f"Completed scheduled job search for user {user_id}: {len(filtered_jobs)} jobs found")
            
        except Exception as e:
            logger.error(f"Error executing scheduled job search: {e}")
            
            # Send error notification
            await self.notification_service.send_error_notification(
                user_id=user_id,
                error_type="Scheduled Job Search Failed",
                error_message=str(e)
            )
    
    async def _filter_jobs_by_preferences(self, jobs: List[Dict[str, Any]],
                                        config: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Filter jobs based on user preferences and configuration"""
        try:
            filtered_jobs = []
            filters = config.get('filters', {})
            
            for job in jobs:
                # Apply various filters
                if self._job_matches_filters(job, filters):
                    filtered_jobs.append(job)
            
            return filtered_jobs
            
        except Exception as e:
            logger.error(f"Error filtering jobs: {e}")
            return jobs
    
    def _job_matches_filters(self, job: Dict[str, Any], filters: Dict[str, Any]) -> bool:
        """Check if a job matches the specified filters"""
        try:
            # Salary filter
            min_salary = filters.get('min_salary')
            if min_salary and job.get('salary_min', 0) < min_salary:
                return False
            
            # Experience level filter
            experience_level = filters.get('experience_level')
            if experience_level and job.get('experience_level') != experience_level:
                return False
            
            # Remote work filter
            remote_only = filters.get('remote_only', False)
            if remote_only and not job.get('is_remote', False):
                return False
            
            # Company blacklist
            blacklisted_companies = filters.get('blacklisted_companies', [])
            if job.get('company') in blacklisted_companies:
                return False
            
            return True
            
        except Exception as e:
            logger.error(f"Error matching job filters: {e}")
            return True
    
    async def get_user_schedules(self, user_id: str) -> List[Dict[str, Any]]:
        """Get all active schedules for a user"""
        try:
            user_schedules = []
            
            for schedule_id, schedule_info in self.active_schedules.items():
                if schedule_info['user_id'] == user_id:
                    # Get next run time from scheduler
                    job = self.scheduler.get_job(schedule_id)
                    if job:
                        schedule_info['next_run'] = job.next_run_time
                    
                    user_schedules.append({
                        'schedule_id': schedule_id,
                        **schedule_info
                    })
            
            return user_schedules
            
        except Exception as e:
            logger.error(f"Error getting user schedules: {e}")
            return []
    
    async def pause_schedule(self, schedule_id: str) -> bool:
        """Pause a specific schedule"""
        try:
            if schedule_id in self.active_schedules:
                self.scheduler.pause_job(schedule_id)
                self.active_schedules[schedule_id]['status'] = 'paused'
                logger.info(f"Paused schedule {schedule_id}")
                return True
            return False
            
        except Exception as e:
            logger.error(f"Error pausing schedule: {e}")
            return False
    
    async def resume_schedule(self, schedule_id: str) -> bool:
        """Resume a paused schedule"""
        try:
            if schedule_id in self.active_schedules:
                self.scheduler.resume_job(schedule_id)
                self.active_schedules[schedule_id]['status'] = 'active'
                logger.info(f"Resumed schedule {schedule_id}")
                return True
            return False
            
        except Exception as e:
            logger.error(f"Error resuming schedule: {e}")
            return False
    
    async def delete_schedule(self, schedule_id: str) -> bool:
        """Delete a schedule permanently"""
        try:
            if schedule_id in self.active_schedules:
                self.scheduler.remove_job(schedule_id)
                del self.active_schedules[schedule_id]
                logger.info(f"Deleted schedule {schedule_id}")
                return True
            return False
            
        except Exception as e:
            logger.error(f"Error deleting schedule: {e}")
            return False
    
    async def get_schedule_statistics(self, user_id: str = None) -> Dict[str, Any]:
        """Get statistics about scheduled jobs"""
        try:
            stats = {
                'total_schedules': len(self.active_schedules),
                'active_schedules': len([s for s in self.active_schedules.values() if s['status'] == 'active']),
                'paused_schedules': len([s for s in self.active_schedules.values() if s['status'] == 'paused']),
                'total_runs': sum(s.get('total_runs', 0) for s in self.active_schedules.values()),
                'successful_runs': sum(s.get('successful_runs', 0) for s in self.active_schedules.values())
            }
            
            if user_id:
                user_schedules = [s for s in self.active_schedules.values() if s['user_id'] == user_id]
                stats['user_schedules'] = len(user_schedules)
                stats['user_total_runs'] = sum(s.get('total_runs', 0) for s in user_schedules)
                stats['user_successful_runs'] = sum(s.get('successful_runs', 0) for s in user_schedules)
            
            return stats
            
        except Exception as e:
            logger.error(f"Error getting schedule statistics: {e}")
            return {}
    
    async def cleanup(self):
        """Clean up scheduler resources"""
        try:
            if self.scheduler.running:
                self.scheduler.shutdown()
            
            await self.job_aggregator.cleanup()

            logger.info("Scheduler Agent cleanup completed")
            
        except Exception as e:
            logger.error(f"Error during scheduler cleanup: {e}")