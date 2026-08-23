# JobGenie AI - Advanced Auto-Apply & Automation System

## 🚀 Overview

JobGenie AI now includes **advanced autonomous job application capabilities** with sophisticated browser automation, multi-platform support, OAuth handling, and intelligent scheduling. This system can automatically search for jobs, apply to them across various platforms, handle complex application flows, and provide real-time notifications.

## ✨ Advanced Features

### 🤖 **Intelligent Auto-Apply System**
- **Browser Automation**: Playwright-powered automation that mimics human behavior
- **Multi-platform Support**: LinkedIn, Indeed, Naukri, Glassdoor, Monster, and more
- **OAuth Integration**: Handles company portal redirects and social login flows
- **Multi-step Forms**: Navigates complex application processes automatically
- **Captcha Solving**: Integrates with anti-captcha services for automated solving
- **Rate Limiting**: Intelligent delays to avoid detection and platform blocks

### 📅 **Advanced Scheduling System**
- **Automated Job Searches**: Schedule periodic job searches with custom criteria
- **Automated Applications**: Schedule bulk applications with intelligent timing
- **Smart Batching**: Optimizes application timing for maximum success rates
- **Configurable Schedules**: Daily, weekly, hourly, or custom intervals
- **Performance Tracking**: Monitor success rates and optimize strategies

### 🔔 **Real-time Notification System**
- **Email Notifications**: Beautiful HTML emails for all job activities
- **WebSocket Updates**: Real-time notifications in the web interface
- **SMS Integration**: Optional SMS notifications for critical updates
- **Notification History**: Track all notifications and their status
- **Custom Templates**: Personalized notification templates

### 🌐 **Enhanced Job Aggregation**
- **Advanced Scraping**: Dynamic content extraction with browser automation
- **Multiple Sources**: Aggregate from 10+ job platforms simultaneously
- **Smart Filtering**: AI-powered job matching and relevance scoring
- **Real-time Updates**: Continuous monitoring for new job postings
- **Duplicate Detection**: Intelligent deduplication across platforms

## 🛠️ Installation & Setup

### Prerequisites
- Python 3.8+
- Node.js 16+ (for Playwright)
- PostgreSQL (for the backend)
- Redis (optional, for caching)

### Quick Setup

1. **Run the automated setup script:**
```bash
cd JobGenie-AI
python setup_advanced_features.py
```

2. **Configure environment variables:**
```bash
# Edit the .env file with your API keys and settings
nano .env
```

3. **Test the installation:**
```bash
python test_advanced_features.py
```

4. **Start the enhanced service:**
```bash
./start_advanced.sh  # Linux/macOS
# or
start_advanced.bat   # Windows
```

### Manual Installation

1. **Install Python dependencies:**
```bash
pip install -r requirements.txt
```

2. **Install Playwright browsers:**
```bash
playwright install
playwright install-deps
```

3. **Configure environment variables:**
```bash
cp .env.template .env
# Edit .env with your configuration
```

## ⚙️ Configuration

### Environment Variables

```bash
# Core Configuration
OPENAI_API_KEY=your_openai_api_key_here
BACKEND_URL=http://localhost:8080
FRONTEND_URL=http://localhost:3000

# Email Configuration (Choose one)
SENDGRID_API_KEY=your_sendgrid_api_key_here
# OR
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your_email@gmail.com
SMTP_PASSWORD=your_app_password_here

# Captcha Solving (Optional but recommended)
ANTICAPTCHA_API_KEY=your_anticaptcha_api_key_here
CAPTCHA_API_KEY=your_2captcha_api_key_here

# Proxy Configuration (Optional)
PROXY_SERVER_1=your_proxy_server:port
PROXY_USERNAME_1=proxy_username
PROXY_PASSWORD_1=proxy_password

# Auto-Apply Settings
AUTO_APPLY_ENABLED=true
MAX_AUTO_APPLY_PER_DAY=20
AUTO_APPLY_DELAY_SECONDS=60
MIN_MATCH_SCORE=75
REQUIRE_COVER_LETTER=true

# Browser Settings
HEADLESS_BROWSER=true
BROWSER_TIMEOUT=30000
MAX_CONCURRENT_APPLICATIONS=3

# Rate Limiting
MAX_EMAILS_PER_HOUR=100
MAX_APPLICATIONS_PER_DAY=50
SEARCH_DELAY_MINUTES=5
```

### Platform-Specific Settings

```python
# Customize platform configurations in app/config/platform_config.py
PLATFORM_CONFIGS = {
    'linkedin': {
        'max_applications_per_session': 10,
        'rate_limit_delay': (2, 5),
        'requires_login': True
    },
    'indeed': {
        'max_applications_per_session': 15,
        'rate_limit_delay': (1, 3),
        'requires_login': False
    }
}
```

## 🔌 API Endpoints

### Auto-Apply Endpoints

#### **Advanced Auto-Apply**
```http
POST /api/advanced-auto-apply
Content-Type: application/json

{
  "job_url": "https://linkedin.com/jobs/view/123456",
  "platform": "linkedin",
  "user_credentials": {
    "linkedin_username": "user@email.com",
    "linkedin_password": "password"
  },
  "resume_path": "/path/to/resume.pdf",
  "cover_letter": "Personalized cover letter content"
}
```

#### **Batch Auto-Apply**
```http
POST /api/auto-apply/batch
Content-Type: application/json

{
  "jobs": [
    {
      "url": "https://linkedin.com/jobs/view/123456",
      "platform": "linkedin",
      "title": "Software Engineer",
      "company": "Tech Corp"
    }
  ],
  "user_credentials": {...},
  "resume_path": "/path/to/resume.pdf",
  "max_applications": 10,
  "delay_between_applications": 60
}
```

#### **Search and Apply**
```http
POST /api/jobs/search-and-apply
Content-Type: application/json

{
  "keywords": ["python", "backend", "API"],
  "location": "San Francisco, CA",
  "platforms": ["linkedin", "indeed", "naukri"],
  "max_jobs": 50
}
```

### Scheduling Endpoints

#### **Create Job Search Schedule**
```http
POST /api/schedule/job-search
Content-Type: application/json

{
  "user_id": "user123",
  "frequency": "daily",
  "search_time": "09:00",
  "keywords": ["python", "developer"],
  "location": "San Francisco",
  "platforms": ["linkedin", "indeed"],
  "max_jobs_per_search": 50,
  "filters": {
    "min_salary": 80000,
    "remote_only": true,
    "experience_level": "mid"
  }
}
```

#### **Create Auto-Apply Schedule**
```http
POST /api/schedule/auto-apply
Content-Type: application/json

{
  "user_id": "user123",
  "frequency": "daily",
  "apply_time": "10:00",
  "max_applications_per_run": 5,
  "min_match_score": 80,
  "platforms": ["linkedin", "indeed"],
  "require_cover_letter": true
}
```

### Notification Endpoints

#### **Get Notification History**
```http
GET /api/notifications/history/user123?limit=50
```

#### **WebSocket Connection**
```javascript
// Connect to real-time notifications
const ws = new WebSocket('ws://localhost:8000/ws/notifications/user123');

ws.onmessage = function(event) {
    const notification = JSON.parse(event.data);
    console.log('New notification:', notification);
};
```

## 🎯 Usage Examples

### 1. **Simple Auto-Apply**

```python
import asyncio
from app.services.advanced_auto_apply import AdvancedAutoApplyAgent

async def apply_to_job():
    agent = AdvancedAutoApplyAgent()
    await agent.initialize()
    
    result = await agent.apply_to_job(
        job_url="https://linkedin.com/jobs/view/123456",
        platform="linkedin",
        user_credentials={
            "linkedin_username": "user@email.com",
            "linkedin_password": "password"
        },
        resume_path="./resume.pdf",
        cover_letter="Custom cover letter"
    )
    
    print(f"Application result: {result}")
    await agent.cleanup()

asyncio.run(apply_to_job())
```

### 2. **Schedule Automated Job Search**

```python
import asyncio
from app.services.scheduler_agent import SchedulerAgent

async def setup_automation():
    scheduler = SchedulerAgent()
    await scheduler.initialize()
    
    # Schedule daily job search
    search_schedule = await scheduler.create_job_search_schedule(
        user_id="user123",
        schedule_config={
            "frequency": "daily",
            "search_time": "09:00",
            "keywords": ["python", "backend", "API"],
            "location": "San Francisco, CA",
            "platforms": ["linkedin", "indeed"],
            "max_jobs_per_search": 100
        }
    )
    
    # Schedule daily auto-apply
    apply_schedule = await scheduler.create_auto_apply_schedule(
        user_id="user123",
        schedule_config={
            "frequency": "daily",
            "apply_time": "10:00",
            "max_applications_per_run": 5,
            "min_match_score": 80
        }
    )
    
    print(f"Schedules created: {search_schedule}, {apply_schedule}")

asyncio.run(setup_automation())
```

### 3. **Custom Notification**

```python
import asyncio
from app.services.notification_service import NotificationService

async def send_custom_notification():
    notifier = NotificationService()
    await notifier.initialize()
    
    result = await notifier.send_job_search_notification(
        user_id="user123",
        jobs_found=15,
        new_jobs=[{
            "title": "Senior Python Developer",
            "company": "Tech Corp",
            "location": "San Francisco",
            "url": "https://example.com/job/123"
        }],
        search_summary={
            "search_date": "2024-01-15",
            "keywords": ["python", "senior"],
            "platforms_searched": ["linkedin", "indeed"]
        }
    )
    
    print(f"Notification sent: {result}")

asyncio.run(send_custom_notification())
```

## 🔒 Security & Best Practices

### **Credential Management**
- Store credentials securely using environment variables
- Use OAuth tokens when possible instead of passwords
- Rotate credentials regularly
- Never log sensitive information

### **Rate Limiting**
- Respect platform rate limits and terms of service
- Use randomized delays between actions
- Monitor for blocking and adjust strategies
- Implement circuit breakers for failed requests

### **Browser Automation**
- Use undetected browser instances
- Rotate user agents and proxies
- Simulate human-like behavior with random delays
- Handle CAPTCHAs appropriately

### **Application Ethics**
- Only apply to relevant positions
- Customize cover letters for each application
- Maintain quality over quantity
- Respect company application processes

## 🚨 Troubleshooting

### **Common Issues**

#### **Playwright Installation Failed**
```bash
# Install system dependencies
sudo apt-get install -y libgconf-2-4 libxss1 libxtst6 libxrandr2 libasound2 libpangocairo-1.0-0 libatk1.0-0 libcairo-gobject2 libgtk-3-0 libxcomposite1 libxcursor1 libxdamage1 libxi6 libxtst6 libnss3 libcups2 libxrandr2 libxss1 libgconf-2-4

# Reinstall Playwright
pip install playwright
playwright install chromium
```

#### **Browser Detection Issues**
```bash
# Use different browser options
export HEADLESS_BROWSER=false
export BROWSER_STEALTH_MODE=true
```

#### **Captcha Solving Failed**
```bash
# Check your captcha service credits
# Add backup captcha service
export BACKUP_CAPTCHA_SERVICE=2captcha
```

#### **Rate Limiting**
```bash
# Increase delays in .env
export AUTO_APPLY_DELAY_SECONDS=120
export SEARCH_DELAY_MINUTES=10
```

### **Debug Mode**

```bash
# Enable verbose logging
export LOG_LEVEL=DEBUG

# Run with debug mode
python -m uvicorn main:app --reload --log-level debug
```

### **Testing Configuration**

```bash
# Test individual components
python -c "from app.services.advanced_auto_apply import AdvancedAutoApplyAgent; import asyncio; asyncio.run(AdvancedAutoApplyAgent().initialize())"

# Test email notifications
python -c "from app.services.notification_service import NotificationService; import asyncio; notifier = NotificationService(); asyncio.run(notifier.initialize())"
```

## 📊 Monitoring & Analytics

### **Application Metrics**
- Success/failure rates per platform
- Average application time
- Captcha solving rates
- Rate limit encounters

### **Job Search Metrics**
- Jobs found per search
- Relevance scores
- Platform coverage
- Search efficiency

### **System Health**
- Browser session health
- Memory usage
- Network performance
- Error rates

## 🔄 Updates & Maintenance

### **Regular Maintenance**
- Update browser versions monthly
- Review and update selectors for platform changes
- Monitor success rates and adjust strategies
- Clean up old logs and data

### **Platform Updates**
- LinkedIn, Indeed, and other platforms frequently change their layouts
- Selectors may need updates
- Check logs for new error patterns
- Test after platform updates

## 📞 Support & Community

### **Getting Help**
- Check the troubleshooting section first
- Review logs for specific error messages
- Test with minimal configuration
- Create detailed issue reports

### **Contributing**
- Report platform-specific issues
- Suggest new features or improvements
- Share configuration optimizations
- Help with documentation

## 📄 License & Legal

### **Important Notes**
- Respect platform terms of service
- Use responsibly and ethically
- Monitor for changes in platform policies
- Ensure compliance with local laws

### **Disclaimers**
- This tool is for educational and personal use
- Users are responsible for compliance with platform ToS
- No guarantees on application success rates
- Use at your own risk

---

## 🎉 Conclusion

JobGenie's advanced auto-apply system represents the cutting edge of job search automation. With intelligent browser automation, sophisticated scheduling, and comprehensive notification systems, you can transform your job search into a fully automated, highly efficient process.

**Happy job hunting!** 🚀

---

*For additional support or questions, please refer to the main JobGenie documentation or contact the development team.* 