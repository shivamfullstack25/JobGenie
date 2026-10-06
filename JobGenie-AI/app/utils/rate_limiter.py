import logging
import time
from collections import defaultdict
from typing import Dict, Any

logger = logging.getLogger(__name__)

class RateLimiter:
    def __init__(self, max_requests: int = 100, window_seconds: int = 3600):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.requests = defaultdict(list)
    
    def check_rate_limit(self, user_id: str, task_type: str) -> bool:
        """Check if user has exceeded rate limit for a specific task type"""
        try:
            current_time = time.time()
            key = f"{user_id}:{task_type}"
            
            # Remove old requests outside the window
            self.requests[key] = [
                req_time for req_time in self.requests[key]
                if current_time - req_time < self.window_seconds
            ]
            
            # Check if limit exceeded
            if len(self.requests[key]) >= self.max_requests:
                logger.warning(f"Rate limit exceeded for user {user_id}, task {task_type}")
                return False
            
            # Add current request
            self.requests[key].append(current_time)
            return True
            
        except Exception as e:
            logger.error(f"Error checking rate limit: {str(e)}")
            return True  # Allow request if rate limiter fails
    
    def check_batch_rate_limit(self, user_id: str, batch_size: int) -> bool:
        """Check rate limit for batch operations"""
        try:
            current_time = time.time()
            key = f"{user_id}:batch"
            
            # Remove old requests outside the window
            self.requests[key] = [
                req_time for req_time in self.requests[key]
                if current_time - req_time < self.window_seconds
            ]
            
            # Check if batch would exceed limit
            if len(self.requests[key]) + batch_size > self.max_requests:
                logger.warning(f"Batch rate limit exceeded for user {user_id}")
                return False
            
            # Add batch requests
            for _ in range(batch_size):
                self.requests[key].append(current_time)
            
            return True
            
        except Exception as e:
            logger.error(f"Error checking batch rate limit: {str(e)}")
            return True
    
    def get_user_stats(self, user_id: str) -> Dict[str, Any]:
        """Get rate limit statistics for a user"""
        try:
            current_time = time.time()
            stats = {}
            
            for key in self.requests.keys():
                if key.startswith(f"{user_id}:"):
                    task_type = key.split(":", 1)[1]
                    requests_in_window = [
                        req_time for req_time in self.requests[key]
                        if current_time - req_time < self.window_seconds
                    ]
                    
                    stats[task_type] = {
                        "requests_in_window": len(requests_in_window),
                        "max_requests": self.max_requests,
                        "window_seconds": self.window_seconds,
                        "remaining_requests": max(0, self.max_requests - len(requests_in_window))
                    }
            
            return stats
            
        except Exception as e:
            logger.error(f"Error getting user stats: {str(e)}")
            return {}
    
    def reset_user_limits(self, user_id: str) -> bool:
        """Reset rate limits for a user"""
        try:
            keys_to_remove = [
                key for key in self.requests.keys()
                if key.startswith(f"{user_id}:")
            ]
            
            for key in keys_to_remove:
                del self.requests[key]
            
            logger.info(f"Reset rate limits for user {user_id}")
            return True
            
        except Exception as e:
            logger.error(f"Error resetting user limits: {str(e)}")
            return False 