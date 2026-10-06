import os
from pydantic_settings import BaseSettings
from pydantic import field_validator

class Settings(BaseSettings):
    # API Configuration
    api_title: str = "JobGenie AI Service"
    api_version: str = "1.0.0"
    api_description: str = "AI-powered job search and career management service with CrewAI agents"
    
    # Server Configuration
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = False
    
    # OpenAI Configuration
    openai_api_key: str = os.getenv("OPENAI_API_KEY", "")
    openai_model: str = "gpt-4"
    openai_temperature: float = 0.7
    
    # CrewAI Configuration
    crew_ai_verbose: bool = True
    crew_ai_allow_delegation: bool = False
    
    # Rate Limiting
    rate_limit_requests: int = 100
    rate_limit_window: int = 3600  # 1 hour
    
    # File Upload
    max_file_size: int = 10 * 1024 * 1024  # 10MB
    allowed_file_types: list = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"]
    
    # Database (if needed)
    database_url: str = os.getenv("DATABASE_URL", "")
    
    # External Services
    spring_boot_url: str = os.getenv("SPRING_BOOT_URL", "http://localhost:8080")
    
    # Logging
    log_level: str = "INFO"
    
    @field_validator('max_file_size', mode='before')
    @classmethod
    def validate_max_file_size(cls, v):
        if isinstance(v, str):
            # Handle string values like "10MB"
            v = v.strip().upper()
            if v.endswith('MB'):
                return int(float(v[:-2]) * 1024 * 1024)
            elif v.endswith('KB'):
                return int(float(v[:-2]) * 1024)
            elif v.endswith('B'):
                return int(v[:-1])
            else:
                return int(v)
        return v
    
    model_config = {
        "env_file": ".env",
        "case_sensitive": False
    }

settings = Settings() 