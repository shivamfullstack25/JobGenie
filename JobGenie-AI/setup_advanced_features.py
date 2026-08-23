#!/usr/bin/env python3
"""
JobGenie Advanced Features Setup Script

This script sets up the advanced auto-apply system with:
- Browser automation (Playwright)
- Captcha solving capabilities
- Enhanced job scraping
- Real-time notifications
- Scheduling system
"""

import os
import sys
import subprocess
import asyncio
import logging
from pathlib import Path

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class AdvancedFeaturesSetup:
    def __init__(self):
        self.project_root = Path(__file__).parent
        self.venv_path = self.project_root / "venv"
        self.requirements_installed = False
        
    def run_command(self, command, check=True):
        """Run a shell command and handle errors"""
        try:
            logger.info(f"Running: {command}")
            result = subprocess.run(command, shell=True, check=check, capture_output=True, text=True)
            if result.stdout:
                logger.info(result.stdout)
            return result
        except subprocess.CalledProcessError as e:
            logger.error(f"Command failed: {e}")
            if e.stderr:
                logger.error(e.stderr)
            if check:
                raise
            return e

    def check_python_version(self):
        """Check if Python version is compatible"""
        if sys.version_info < (3, 8):
            logger.error("Python 3.8 or higher is required")
            sys.exit(1)
        logger.info(f"Python version: {sys.version}")

    def setup_virtual_environment(self):
        """Create and activate virtual environment"""
        if not self.venv_path.exists():
            logger.info("Creating virtual environment...")
            self.run_command(f"python -m venv {self.venv_path}")
        
        # Get the path to the Python executable in the virtual environment
        if os.name == 'nt':  # Windows
            python_exe = self.venv_path / "Scripts" / "python.exe"
            pip_exe = self.venv_path / "Scripts" / "pip.exe"
        else:  # Unix/Linux/macOS
            python_exe = self.venv_path / "bin" / "python"
            pip_exe = self.venv_path / "bin" / "pip"
        
        self.python_exe = str(python_exe)
        self.pip_exe = str(pip_exe)
        
        logger.info("Virtual environment ready")

    def install_requirements(self):
        """Install Python requirements"""
        requirements_file = self.project_root / "requirements.txt"
        
        if not requirements_file.exists():
            logger.error("requirements.txt not found")
            sys.exit(1)
        
        logger.info("Installing Python dependencies...")
        self.run_command(f"{self.pip_exe} install --upgrade pip")
        self.run_command(f"{self.pip_exe} install -r {requirements_file}")
        self.requirements_installed = True
        logger.info("Python dependencies installed successfully")

    def install_playwright_browsers(self):
        """Install Playwright browsers"""
        if not self.requirements_installed:
            logger.warning("Install requirements first")
            return
        
        logger.info("Installing Playwright browsers...")
        try:
            self.run_command(f"{self.python_exe} -m playwright install")
            self.run_command(f"{self.python_exe} -m playwright install-deps")
            logger.info("Playwright browsers installed successfully")
        except subprocess.CalledProcessError as e:
            logger.error("Failed to install Playwright browsers. Installing Chromium only...")
            self.run_command(f"{self.python_exe} -m playwright install chromium", check=False)

    def setup_environment_file(self):
        """Create .env file with configuration template"""
        env_file = self.project_root / ".env"
        
        if env_file.exists():
            logger.info(".env file already exists")
            return
        
        env_template = """# JobGenie AI Service Configuration

# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here

# Email Configuration (Choose one)
# Option 1: SendGrid
SENDGRID_API_KEY=your_sendgrid_api_key_here

# Option 2: SMTP
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your_email@gmail.com
SMTP_PASSWORD=your_app_password_here

# Email Settings
FROM_EMAIL=noreply@jobgenie.com

# Captcha Solving Services (Optional)
ANTICAPTCHA_API_KEY=your_anticaptcha_api_key_here
CAPTCHA_API_KEY=your_2captcha_api_key_here

# Proxy Configuration (Optional)
PROXY_SERVER_1=your_proxy_server:port
PROXY_USERNAME_1=proxy_username
PROXY_PASSWORD_1=proxy_password

PROXY_SERVER_2=backup_proxy_server:port
PROXY_USERNAME_2=backup_username
PROXY_PASSWORD_2=backup_password

# Backend Integration
BACKEND_URL=http://localhost:8080
FRONTEND_URL=http://localhost:3000

# Database Configuration (if using direct DB access)
DATABASE_URL=postgresql://username:password@localhost:5432/jobgenie

# Redis Configuration (for caching and rate limiting)
REDIS_URL=redis://localhost:6379

# Logging Level
LOG_LEVEL=INFO

# Browser Automation Settings
HEADLESS_BROWSER=true
BROWSER_TIMEOUT=30000
MAX_CONCURRENT_APPLICATIONS=3

# Rate Limiting
MAX_EMAILS_PER_HOUR=100
MAX_APPLICATIONS_PER_DAY=50
MAX_WEBSOCKET_CONNECTIONS=1000

# Job Search Settings
DEFAULT_SEARCH_PLATFORMS=linkedin,indeed,naukri
MAX_JOBS_PER_SEARCH=100
SEARCH_DELAY_MINUTES=5

# Auto-Apply Settings
AUTO_APPLY_ENABLED=false
MAX_AUTO_APPLY_PER_DAY=10
AUTO_APPLY_DELAY_SECONDS=60
REQUIRE_COVER_LETTER=true
MIN_MATCH_SCORE=75

# Security Settings
ENCRYPT_USER_CREDENTIALS=true
SESSION_TIMEOUT_MINUTES=60
"""
        
        with open(env_file, 'w') as f:
            f.write(env_template)
        
        logger.info(f"Created .env template file at {env_file}")
        logger.warning("Please edit the .env file and add your API keys and configuration")

    def setup_playwright_config(self):
        """Create Playwright configuration"""
        config_content = """# Playwright Configuration for JobGenie

import os
from playwright.async_api import async_playwright

# Browser configuration
BROWSER_CONFIG = {
    'headless': os.getenv('HEADLESS_BROWSER', 'true').lower() == 'true',
    'timeout': int(os.getenv('BROWSER_TIMEOUT', '30000')),
    'args': [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=VizDisplayCompositor',
        '--disable-ipc-flooding-protection'
    ]
}

# User agent rotation
USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
]

# Platform-specific configurations
PLATFORM_CONFIGS = {
    'linkedin': {
        'base_url': 'https://www.linkedin.com',
        'rate_limit_delay': (2, 5),
        'max_applications_per_session': 10
    },
    'indeed': {
        'base_url': 'https://www.indeed.com',
        'rate_limit_delay': (1, 3),
        'max_applications_per_session': 15
    },
    'naukri': {
        'base_url': 'https://www.naukri.com',
        'rate_limit_delay': (2, 4),
        'max_applications_per_session': 12
    }
}
"""
        
        config_file = self.project_root / "app" / "config" / "playwright_config.py"
        config_file.parent.mkdir(parents=True, exist_ok=True)
        
        with open(config_file, 'w') as f:
            f.write(config_content)
        
        logger.info("Created Playwright configuration")

    def setup_logging_config(self):
        """Create logging configuration"""
        logging_config = """import logging
import logging.handlers
import os
from pathlib import Path

def setup_logging():
    # Create logs directory
    log_dir = Path(__file__).parent.parent.parent / "logs"
    log_dir.mkdir(exist_ok=True)
    
    # Configure logging
    log_level = os.getenv('LOG_LEVEL', 'INFO').upper()
    
    # Create formatters
    detailed_formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - [%(filename)s:%(lineno)d] - %(message)s'
    )
    
    simple_formatter = logging.Formatter(
        '%(asctime)s - %(levelname)s - %(message)s'
    )
    
    # Root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)
    
    # Console handler
    console_handler = logging.StreamHandler()
    console_handler.setLevel(log_level)
    console_handler.setFormatter(simple_formatter)
    root_logger.addHandler(console_handler)
    
    # File handler for general logs
    file_handler = logging.handlers.RotatingFileHandler(
        log_dir / "jobgenie_ai.log",
        maxBytes=10*1024*1024,  # 10MB
        backupCount=5
    )
    file_handler.setLevel(logging.INFO)
    file_handler.setFormatter(detailed_formatter)
    root_logger.addHandler(file_handler)
    
    # File handler for auto-apply logs
    auto_apply_handler = logging.handlers.RotatingFileHandler(
        log_dir / "auto_apply.log",
        maxBytes=5*1024*1024,  # 5MB
        backupCount=3
    )
    auto_apply_handler.setLevel(logging.INFO)
    auto_apply_handler.setFormatter(detailed_formatter)
    
    # Create auto-apply logger
    auto_apply_logger = logging.getLogger('auto_apply')
    auto_apply_logger.addHandler(auto_apply_handler)
    
    # Error file handler
    error_handler = logging.handlers.RotatingFileHandler(
        log_dir / "errors.log",
        maxBytes=5*1024*1024,  # 5MB
        backupCount=3
    )
    error_handler.setLevel(logging.ERROR)
    error_handler.setFormatter(detailed_formatter)
    root_logger.addHandler(error_handler)
    
    return root_logger

if __name__ == "__main__":
    setup_logging()
"""
        
        config_file = self.project_root / "app" / "config" / "logging_config.py"
        config_file.parent.mkdir(parents=True, exist_ok=True)
        
        with open(config_file, 'w') as f:
            f.write(logging_config)
        
        logger.info("Created logging configuration")

    def create_startup_script(self):
        """Create startup script for the enhanced AI service"""
        startup_script = """#!/bin/bash

# JobGenie AI Service Startup Script

set -e

echo "Starting JobGenie AI Service with Advanced Features..."

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "Virtual environment not found. Please run setup first."
    exit 1
fi

# Activate virtual environment
source venv/bin/activate

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "Warning: .env file not found. Using default configuration."
fi

# Set environment variables
export PYTHONPATH="${PYTHONPATH}:$(pwd)"

# Start the service
echo "Starting FastAPI server..."
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload

echo "JobGenie AI Service is running on http://localhost:8000"
echo "API Documentation: http://localhost:8000/docs"
echo "Advanced Features:"
echo "  - Auto-Apply with Browser Automation"
echo "  - Intelligent Job Scheduling"
echo "  - Real-time Notifications"
echo "  - Captcha Solving"
echo "  - Multi-platform Support"
"""
        
        script_file = self.project_root / "start_advanced.sh"
        with open(script_file, 'w') as f:
            f.write(startup_script)
        
        # Make script executable
        os.chmod(script_file, 0o755)
        
        # Create Windows batch file
        windows_script = """@echo off
echo Starting JobGenie AI Service with Advanced Features...

if not exist "venv" (
    echo Virtual environment not found. Please run setup first.
    pause
    exit /b 1
)

call venv\\Scripts\\activate.bat

if not exist ".env" (
    echo Warning: .env file not found. Using default configuration.
)

set PYTHONPATH=%PYTHONPATH%;%CD%

echo Starting FastAPI server...
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload

echo JobGenie AI Service is running on http://localhost:8000
echo API Documentation: http://localhost:8000/docs
pause
"""
        
        windows_script_file = self.project_root / "start_advanced.bat"
        with open(windows_script_file, 'w') as f:
            f.write(windows_script)
        
        logger.info("Created startup scripts")

    def create_test_script(self):
        """Create test script for advanced features"""
        test_script = """#!/usr/bin/env python3
import asyncio
import json
import logging
from app.services.advanced_auto_apply import AdvancedAutoApplyAgent
from app.services.scheduler_agent import SchedulerAgent
from app.services.notification_service import NotificationService

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def test_advanced_features():
    \"\"\"Test the advanced features\"\"\"
    logger.info("Testing JobGenie Advanced Features...")
    
    try:
        # Test 1: Initialize Advanced Auto-Apply Agent
        logger.info("1. Testing Advanced Auto-Apply Agent...")
        auto_apply_agent = AdvancedAutoApplyAgent()
        await auto_apply_agent.initialize(headless=True)
        logger.info("✓ Advanced Auto-Apply Agent initialized successfully")
        
        # Test 2: Initialize Scheduler Agent
        logger.info("2. Testing Scheduler Agent...")
        scheduler_agent = SchedulerAgent()
        await scheduler_agent.initialize()
        logger.info("✓ Scheduler Agent initialized successfully")
        
        # Test 3: Initialize Notification Service
        logger.info("3. Testing Notification Service...")
        notification_service = NotificationService()
        await notification_service.initialize()
        logger.info("✓ Notification Service initialized successfully")
        
        # Test 4: Test schedule creation
        logger.info("4. Testing schedule creation...")
        schedule_config = {
            'frequency': 'daily',
            'search_time': '09:00',
            'keywords': ['python', 'developer'],
            'location': 'San Francisco',
            'platforms': ['linkedin', 'indeed'],
            'max_jobs_per_search': 10
        }
        
        schedule_result = await scheduler_agent.create_job_search_schedule(
            user_id='test_user_123',
            schedule_config=schedule_config
        )
        logger.info(f"✓ Schedule created: {schedule_result}")
        
        # Test 5: Test notification
        logger.info("5. Testing notification system...")
        notification_result = await notification_service.send_job_search_notification(
            user_id='test_user_123',
            jobs_found=5,
            new_jobs=[{
                'id': 'test_job_1',
                'title': 'Python Developer',
                'company': 'Test Company',
                'location': 'San Francisco',
                'description': 'Test job description',
                'url': 'https://example.com/job/1'
            }],
            search_summary={
                'search_date': '2024-01-01',
                'keywords': ['python', 'developer'],
                'location': 'San Francisco',
                'platforms_searched': ['linkedin', 'indeed']
            }
        )
        logger.info(f"✓ Notification sent: {notification_result}")
        
        # Cleanup
        await auto_apply_agent.cleanup()
        await scheduler_agent.cleanup()
        
        logger.info("🎉 All advanced features tested successfully!")
        
    except Exception as e:
        logger.error(f"❌ Test failed: {e}")
        raise

if __name__ == "__main__":
    asyncio.run(test_advanced_features())
"""
        
        test_file = self.project_root / "test_advanced_features.py"
        with open(test_file, 'w') as f:
            f.write(test_script)
        
        logger.info("Created test script for advanced features")

    def print_setup_summary(self):
        """Print setup summary and next steps"""
        summary = """
╔══════════════════════════════════════════════════════════════════════════════╗
║                     JobGenie Advanced Features Setup Complete                ║
╚══════════════════════════════════════════════════════════════════════════════╝

🎉 Setup completed successfully! Here's what was installed:

✅ Advanced Browser Automation (Playwright)
✅ Captcha Solving Capabilities  
✅ Enhanced Job Scraping & Auto-Apply
✅ Intelligent Scheduling System
✅ Real-time Notification Service
✅ Multi-platform Support
✅ Configuration Templates

📋 NEXT STEPS:

1. Configure your .env file:
   - Add your OpenAI API key
   - Set up email service (SendGrid or SMTP)
   - Add captcha solving service keys (optional)
   - Configure proxy settings (optional)

2. Test the installation:
   ./venv/bin/python test_advanced_features.py

3. Start the enhanced service:
   ./start_advanced.sh   (Linux/macOS)
   start_advanced.bat    (Windows)

4. Access the API documentation:
   http://localhost:8000/docs

🚀 NEW ADVANCED ENDPOINTS:

• POST /api/advanced-auto-apply        - Smart job applications
• POST /api/schedule/job-search        - Automated job searches  
• POST /api/schedule/auto-apply        - Scheduled applications
• POST /api/auto-apply/batch           - Batch job applications
• GET  /api/notifications/history      - Notification history
• WS   /ws/notifications/{user_id}     - Real-time updates

🔧 ADVANCED FEATURES:

• OAuth handling for company portals
• Multi-step application form handling
• Captcha solving integration
• Intelligent rate limiting
• Proxy rotation support
• Email & WebSocket notifications
• Comprehensive error handling
• Application success tracking

⚠️  IMPORTANT NOTES:

• Review rate limiting settings in .env
• Test with a few applications before bulk automation
• Ensure compliance with platform terms of service
• Monitor application success rates
• Keep browser automation stealthy

📚 Documentation: Check the README.md for detailed usage instructions

Happy job hunting with JobGenie! 🎯
"""
        print(summary)

    async def run_setup(self):
        """Run the complete setup process"""
        logger.info("Starting JobGenie Advanced Features Setup...")
        
        self.check_python_version()
        self.setup_virtual_environment()
        self.install_requirements()
        self.install_playwright_browsers()
        self.setup_environment_file()
        self.setup_playwright_config()
        self.setup_logging_config()
        self.create_startup_script()
        self.create_test_script()
        
        self.print_setup_summary()

if __name__ == "__main__":
    setup = AdvancedFeaturesSetup()
    asyncio.run(setup.run_setup()) 