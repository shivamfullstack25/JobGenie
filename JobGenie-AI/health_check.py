#!/usr/bin/env python3
"""
Health check script for JobGenie AI Service
Validates all optimization features and services are running properly
"""

import asyncio
import json
import logging
import os
import sys
from typing import Dict, Any

import httpx
import redis
from sqlalchemy import create_engine, text

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class HealthChecker:
    """Comprehensive health checker for JobGenie AI service"""
    
    def __init__(self):
        self.checks = {
            'api_server': self.check_api_server,
            'database': self.check_database,
            'redis': self.check_redis,
            'openai_api': self.check_openai_api,
            'vector_storage': self.check_vector_storage,
            'memory_system': self.check_memory_system,
            'file_permissions': self.check_file_permissions,
            'environment_config': self.check_environment_config
        }
        
    async def run_all_checks(self) -> Dict[str, Any]:
        """Run all health checks and return results"""
        results = {
            'healthy': True,
            'timestamp': asyncio.get_event_loop().time(),
            'checks': {}
        }
        
        for check_name, check_func in self.checks.items():
            try:
                logger.info(f"Running check: {check_name}")
                result = await check_func()
                results['checks'][check_name] = {
                    'status': 'pass' if result['healthy'] else 'fail',
                    'details': result
                }
                
                if not result['healthy']:
                    results['healthy'] = False
                    logger.error(f"Check failed: {check_name} - {result.get('error', 'Unknown error')}")
                else:
                    logger.info(f"Check passed: {check_name}")
                    
            except Exception as e:
                logger.error(f"Check error: {check_name} - {str(e)}")
                results['checks'][check_name] = {
                    'status': 'fail',
                    'details': {'healthy': False, 'error': str(e)}
                }
                results['healthy'] = False
        
        return results
    
    async def check_api_server(self) -> Dict[str, Any]:
        """Check if FastAPI server is responding"""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get('http://localhost:8000/health', timeout=5.0)
                
                if response.status_code == 200:
                    return {
                        'healthy': True,
                        'response_time': response.elapsed.total_seconds(),
                        'status_code': response.status_code
                    }
                else:
                    return {
                        'healthy': False,
                        'error': f"HTTP {response.status_code}",
                        'status_code': response.status_code
                    }
                    
        except Exception as e:
            return {
                'healthy': False,
                'error': f"Connection failed: {str(e)}"
            }
    
    async def check_database(self) -> Dict[str, Any]:
        """Check PostgreSQL database connection"""
        try:
            postgres_url = os.getenv('POSTGRES_URL')
            if not postgres_url:
                return {
                    'healthy': False,
                    'error': 'POSTGRES_URL not configured'
                }
            
            engine = create_engine(postgres_url, pool_pre_ping=True)
            with engine.connect() as conn:
                result = conn.execute(text('SELECT 1'))
                row = result.fetchone()
                
                if row and row[0] == 1:
                    return {
                        'healthy': True,
                        'connection': 'active',
                        'database': postgres_url.split('/')[-1]
                    }
                else:
                    return {
                        'healthy': False,
                        'error': 'Database query failed'
                    }
                    
        except Exception as e:
            return {
                'healthy': False,
                'error': f"Database connection failed: {str(e)}"
            }
    
    async def check_redis(self) -> Dict[str, Any]:
        """Check Redis connection"""
        try:
            redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379')
            redis_password = os.getenv('REDIS_PASSWORD')
            
            if redis_password:
                r = redis.from_url(redis_url, password=redis_password)
            else:
                r = redis.from_url(redis_url)
            
            # Test connection
            r.ping()
            
            # Test basic operations
            r.set('health_check', 'ok', ex=10)
            value = r.get('health_check')
            
            if value and value.decode() == 'ok':
                return {
                    'healthy': True,
                    'connection': 'active',
                    'memory_usage': r.info('memory')['used_memory_human']
                }
            else:
                return {
                    'healthy': False,
                    'error': 'Redis operations failed'
                }
                
        except Exception as e:
            return {
                'healthy': False,
                'error': f"Redis connection failed: {str(e)}"
            }
    
    async def check_openai_api(self) -> Dict[str, Any]:
        """Check OpenAI API connection"""
        try:
            openai_key = os.getenv('OPENAI_API_KEY')
            if not openai_key:
                return {
                    'healthy': True,  # Optional service
                    'warning': 'OpenAI API key not configured',
                    'fallback': 'Local LLM will be used'
                }
            
            async with httpx.AsyncClient() as client:
                headers = {
                    'Authorization': f'Bearer {openai_key}',
                    'Content-Type': 'application/json'
                }
                
                response = await client.get(
                    'https://api.openai.com/v1/models',
                    headers=headers,
                    timeout=10.0
                )
                
                if response.status_code == 200:
                    return {
                        'healthy': True,
                        'api_status': 'active',
                        'models_available': True
                    }
                else:
                    return {
                        'healthy': False,
                        'error': f"OpenAI API returned {response.status_code}",
                        'fallback': 'Local LLM will be used'
                    }
                    
        except Exception as e:
            return {
                'healthy': True,  # Non-critical for operation
                'warning': f"OpenAI API check failed: {str(e)}",
                'fallback': 'Local LLM will be used'
            }
    
    async def check_vector_storage(self) -> Dict[str, Any]:
        """Check vector storage system"""
        try:
            vector_enabled = os.getenv('ENABLE_VECTOR_STORAGE', 'false').lower() == 'true'
            
            if not vector_enabled:
                return {
                    'healthy': True,
                    'status': 'disabled',
                    'note': 'Vector storage is disabled in configuration'
                }
            
            vector_dir = os.getenv('VECTOR_STORE_PERSIST_DIR', './vector_db')
            
            # Check if directory exists and is writable
            if not os.path.exists(vector_dir):
                os.makedirs(vector_dir, exist_ok=True)
            
            if not os.access(vector_dir, os.W_OK):
                return {
                    'healthy': False,
                    'error': f"Vector storage directory not writable: {vector_dir}"
                }
            
            # Try to import and initialize vector storage
            try:
                import chromadb
                client = chromadb.PersistentClient(path=vector_dir)
                collections = client.list_collections()
                
                return {
                    'healthy': True,
                    'status': 'active',
                    'storage_path': vector_dir,
                    'collections_count': len(collections)
                }
                
            except ImportError:
                return {
                    'healthy': False,
                    'error': 'ChromaDB not installed or not available'
                }
                
        except Exception as e:
            return {
                'healthy': False,
                'error': f"Vector storage check failed: {str(e)}"
            }
    
    async def check_memory_system(self) -> Dict[str, Any]:
        """Check memory management system"""
        try:
            memory_enabled = os.getenv('ENABLE_MEMORY', 'false').lower() == 'true'
            
            if not memory_enabled:
                return {
                    'healthy': True,
                    'status': 'disabled',
                    'note': 'Memory system is disabled in configuration'
                }
            
            # Check memory configuration
            memory_type = os.getenv('MEMORY_TYPE', 'buffer_window')
            memory_k = int(os.getenv('MEMORY_K', '10'))
            max_context = int(os.getenv('MAX_CONTEXT_LENGTH', '4000'))
            
            # Validate configuration
            if memory_k <= 0 or max_context <= 0:
                return {
                    'healthy': False,
                    'error': 'Invalid memory configuration values'
                }
            
            return {
                'healthy': True,
                'status': 'configured',
                'memory_type': memory_type,
                'memory_k': memory_k,
                'max_context_length': max_context
            }
            
        except Exception as e:
            return {
                'healthy': False,
                'error': f"Memory system check failed: {str(e)}"
            }
    
    async def check_file_permissions(self) -> Dict[str, Any]:
        """Check file and directory permissions"""
        try:
            directories = [
                ('/app/vector_db', 'Vector storage'),
                ('/app/data', 'User data'),
                ('/app/logs', 'Application logs'),
                ('/app/cache', 'Cache storage')
            ]
            
            permission_issues = []
            
            for dir_path, description in directories:
                if os.path.exists(dir_path):
                    if not os.access(dir_path, os.R_OK | os.W_OK):
                        permission_issues.append(f"{description}: {dir_path}")
                else:
                    try:
                        os.makedirs(dir_path, exist_ok=True)
                    except PermissionError:
                        permission_issues.append(f"Cannot create {description}: {dir_path}")
            
            if permission_issues:
                return {
                    'healthy': False,
                    'error': 'Permission issues found',
                    'issues': permission_issues
                }
            else:
                return {
                    'healthy': True,
                    'status': 'All directories accessible',
                    'checked_directories': len(directories)
                }
                
        except Exception as e:
            return {
                'healthy': False,
                'error': f"File permission check failed: {str(e)}"
            }
    
    async def check_environment_config(self) -> Dict[str, Any]:
        """Check critical environment configuration"""
        try:
            required_vars = ['PYTHONPATH']
            optional_vars = [
                'OPENAI_API_KEY', 'LLM_PROVIDER', 'LLM_MODEL',
                'ENABLE_VECTOR_STORAGE', 'ENABLE_MEMORY', 'ENABLE_STREAMING'
            ]
            
            missing_required = []
            configured_optional = []
            
            for var in required_vars:
                if not os.getenv(var):
                    missing_required.append(var)
            
            for var in optional_vars:
                if os.getenv(var):
                    configured_optional.append(var)
            
            if missing_required:
                return {
                    'healthy': False,
                    'error': 'Missing required environment variables',
                    'missing': missing_required
                }
            
            return {
                'healthy': True,
                'status': 'Environment configured',
                'optional_features': len(configured_optional),
                'configured_features': configured_optional
            }
            
        except Exception as e:
            return {
                'healthy': False,
                'error': f"Environment check failed: {str(e)}"
            }

async def main():
    """Main health check function"""
    checker = HealthChecker()
    results = await checker.run_all_checks()
    
    # Print results
    print(json.dumps(results, indent=2))
    
    # Exit with appropriate code
    if results['healthy']:
        logger.info("All health checks passed ✅")
        sys.exit(0)
    else:
        logger.error("Health checks failed ❌")
        sys.exit(1)

if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Health check interrupted")
        sys.exit(1)
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        sys.exit(1) 