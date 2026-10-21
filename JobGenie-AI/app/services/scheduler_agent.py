import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from .job_aggregator import JobAggregator
from .notification_service import NotificationService

logger = logging.getLogger(__name__)


class SchedulerAgent:
    """Recurring job searches (search only — no auto-apply, no credentials).

    Schedules live in this process's memory, so they are lost on restart; moving them into
    job-service's database is part of Phase 2 in MIGRATION_PLAN.md.

    Previously this class also built a CrewAI agent and asked an LLM to "optimise" each schedule's
    configuration. That call could never succeed (it used the pre-1.x CrewAI API) and its answer was
    discarded anyway, but it made schedule creation fail outright whenever no LLM key was set. It
    has been removed; schedules are plain, deterministic configuration.
    """

    def __init__(self):
        self.scheduler = AsyncIOScheduler()
        self.job_aggregator = JobAggregator()
        self.notification_service = NotificationService()
        self.active_schedules: Dict[str, Dict[str, Any]] = {}
        self.schedule_history: List[Dict[str, Any]] = []
        self.is_initialized = False

    async def initialize(self):
        await self.job_aggregator.initialize()
        await self.notification_service.initialize()
        self.scheduler.start()
        self.is_initialized = True
        logger.info("Scheduler Agent initialized")

    @staticmethod
    def _with_defaults(config: Dict[str, Any]) -> Dict[str, Any]:
        merged = dict(config)
        merged.setdefault("frequency", "daily")
        merged.setdefault("search_time", "09:00")
        merged.setdefault("max_jobs_per_search", 50)
        merged.setdefault("platforms", ["linkedin", "indeed", "naukri"])
        merged.setdefault("filters", {})
        return merged

    @staticmethod
    def _trigger(config: Dict[str, Any]):
        hour, minute = (int(x) for x in str(config.get("search_time", "09:00")).split(":")[:2])
        frequency = config.get("frequency", "daily")
        if frequency == "hourly":
            return IntervalTrigger(hours=1)
        if frequency == "weekly":
            return CronTrigger(day_of_week=config.get("day_of_week", "mon"), hour=hour, minute=minute)
        return CronTrigger(hour=hour, minute=minute)

    async def create_job_search_schedule(self, user_id: str, schedule_config: Dict[str, Any]) -> Dict[str, str]:
        if not self.is_initialized:
            await self.initialize()
        schedule_id = f"schedule_{user_id}_{int(datetime.now().timestamp())}"
        config = self._with_defaults(schedule_config)
        self.scheduler.add_job(
            func=self._execute_scheduled_job_search,
            trigger=self._trigger(config),
            args=[schedule_id, user_id, config],
            id=schedule_id,
            name=f"Job Search for User {user_id}",
            max_instances=1,
            coalesce=True,
        )
        next_run = self.scheduler.get_job(schedule_id).next_run_time
        self.active_schedules[schedule_id] = {
            "user_id": user_id,
            "config": config,
            "created_at": datetime.now(),
            "status": "active",
            "last_run": None,
            "next_run": next_run,
            "total_runs": 0,
            "successful_runs": 0,
        }
        logger.info("Created job search schedule %s for user %s", schedule_id, user_id)
        return {"schedule_id": schedule_id, "status": "created", "next_run": str(next_run), "frequency": config["frequency"]}

    async def _execute_scheduled_job_search(self, schedule_id: str, user_id: str, config: Dict[str, Any]) -> Dict[str, Any]:
        info = self.active_schedules.get(schedule_id)
        if info is not None:
            info["total_runs"] += 1
            info["last_run"] = datetime.now()
        try:
            jobs = await self.job_aggregator.search_jobs(
                keywords=config.get("keywords", []),
                location=config.get("location", ""),
                platforms=config.get("platforms"),
                max_jobs=config.get("max_jobs_per_search", 50),
            )
            filtered = [job for job in jobs if self._job_matches_filters(job, config.get("filters", {}))]
            result = {
                "schedule_id": schedule_id,
                "user_id": user_id,
                "search_date": datetime.now().isoformat(),
                "jobs_found": len(filtered),
                "total_jobs_searched": len(jobs),
                "keywords": config.get("keywords", []),
                "location": config.get("location", ""),
            }
            self.schedule_history.append(result)
            await self.notification_service.send_job_search_notification(
                user_id=user_id, jobs_found=len(filtered), new_jobs=filtered[:10], search_summary=result
            )
            if info is not None:
                info["successful_runs"] += 1
            return result
        except Exception as e:
            logger.error("Scheduled job search %s failed: %s", schedule_id, e)
            await self.notification_service.send_error_notification(
                user_id=user_id, error_type="Scheduled Job Search Failed", error_message=str(e)
            )
            return {"schedule_id": schedule_id, "jobs_found": 0, "error": str(e)}

    async def run_now(self, schedule_id: str) -> Optional[Dict[str, Any]]:
        """Run a schedule immediately; None if it does not exist."""
        info = self.active_schedules.get(schedule_id)
        if info is None:
            return None
        return await self._execute_scheduled_job_search(schedule_id, info["user_id"], info["config"])

    @staticmethod
    def _job_matches_filters(job: Dict[str, Any], filters: Dict[str, Any]) -> bool:
        min_salary = filters.get("min_salary")
        if min_salary and job.get("salary_min", 0) < min_salary:
            return False
        experience_level = filters.get("experience_level")
        if experience_level and job.get("experience_level") and job.get("experience_level") != experience_level:
            return False
        if filters.get("remote_only") and not job.get("is_remote", False):
            return False
        if job.get("company") in filters.get("blacklisted_companies", []):
            return False
        return True

    async def get_user_schedules(self, user_id: str) -> List[Dict[str, Any]]:
        schedules = []
        for schedule_id, info in self.active_schedules.items():
            if info["user_id"] == user_id:
                job = self.scheduler.get_job(schedule_id)
                if job:
                    info["next_run"] = job.next_run_time
                schedules.append({"schedule_id": schedule_id, **info})
        return schedules

    async def pause_schedule(self, schedule_id: str) -> bool:
        if schedule_id not in self.active_schedules:
            return False
        self.scheduler.pause_job(schedule_id)
        self.active_schedules[schedule_id]["status"] = "paused"
        return True

    async def resume_schedule(self, schedule_id: str) -> bool:
        if schedule_id not in self.active_schedules:
            return False
        self.scheduler.resume_job(schedule_id)
        self.active_schedules[schedule_id]["status"] = "active"
        return True

    async def delete_schedule(self, schedule_id: str) -> bool:
        if schedule_id not in self.active_schedules:
            return False
        self.scheduler.remove_job(schedule_id)
        del self.active_schedules[schedule_id]
        return True

    async def get_schedule_statistics(self, user_id: str = None) -> Dict[str, Any]:
        schedules = list(self.active_schedules.values())
        stats = {
            "total_schedules": len(schedules),
            "active_schedules": sum(1 for s in schedules if s["status"] == "active"),
            "paused_schedules": sum(1 for s in schedules if s["status"] == "paused"),
            "total_runs": sum(s.get("total_runs", 0) for s in schedules),
            "successful_runs": sum(s.get("successful_runs", 0) for s in schedules),
        }
        if user_id:
            mine = [s for s in schedules if s["user_id"] == user_id]
            stats["user_schedules"] = len(mine)
            stats["user_total_runs"] = sum(s.get("total_runs", 0) for s in mine)
            stats["user_successful_runs"] = sum(s.get("successful_runs", 0) for s in mine)
        return stats

    async def cleanup(self):
        if self.scheduler.running:
            self.scheduler.shutdown()
        await self.job_aggregator.cleanup()
