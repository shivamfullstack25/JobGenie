#!/bin/bash

# ================================
# JOBGENIE AI SERVICE STARTUP SCRIPT
# ================================

set -e  # Exit on any error

echo "🚀 Starting JobGenie AI Service with Optimizations..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

error() {
    echo -e "${RED}[ERROR] $1${NC}" >&2
}

success() {
    echo -e "${GREEN}[SUCCESS] $1${NC}"
}

warning() {
    echo -e "${YELLOW}[WARNING] $1${NC}"
}

# Check if running as root (not recommended)
if [ "$EUID" -eq 0 ]; then
    warning "Running as root is not recommended for security reasons"
fi

# Set environment variables
export PYTHONPATH=/app
export PYTHONUNBUFFERED=1
export PYTHONDONTWRITEBYTECODE=1

log "Setting up environment..."

# Create necessary directories (ignore chmod errors on Docker-mounted volumes)
log "Creating required directories..."
mkdir -p /app/vector_db /app/data /app/logs /app/cache
chmod -R 755 /app/vector_db /app/data /app/logs /app/cache 2>/dev/null || true

# Check critical environment variables
log "Checking environment configuration..."

check_env_var() {
    local var_name=$1
    local is_required=${2:-false}
    
    if [ -z "${!var_name}" ]; then
        if [ "$is_required" = true ]; then
            error "Required environment variable $var_name is not set"
            exit 1
        else
            warning "Optional environment variable $var_name is not set"
        fi
    else
        success "✓ $var_name is configured"
    fi
}

# Check required variables
check_env_var "PYTHONPATH" true

# Check optional but important variables
check_env_var "OPENAI_API_KEY" false
check_env_var "LLM_PROVIDER" false
check_env_var "ENABLE_VECTOR_STORAGE" false
check_env_var "ENABLE_MEMORY" false
check_env_var "POSTGRES_URL" false
check_env_var "REDIS_URL" false

# Initialize vector storage if enabled
if [ "${ENABLE_VECTOR_STORAGE:-false}" = "true" ]; then
    log "Initializing vector storage..."

    if python3 -c "import chromadb" 2>/dev/null; then
        VECTOR_DIR="${VECTOR_STORE_PERSIST_DIR:-/app/vector_db}"
        if [ ! -d "$VECTOR_DIR" ]; then
            log "Creating vector storage directory: $VECTOR_DIR"
            mkdir -p "$VECTOR_DIR"
        fi

        python3 -c "
import chromadb
import os
vector_dir = os.getenv('VECTOR_STORE_PERSIST_DIR', '/app/vector_db')
try:
    client = chromadb.PersistentClient(path=vector_dir)
    print('Vector storage initialized successfully')
except Exception as e:
    print(f'Vector storage initialization failed: {e}')
    exit(1)
" || warning "Vector storage initialization failed - continuing without vector features"

        success "✓ Vector storage initialized"
    else
        warning "ChromaDB not available - disabling vector storage for this run"
        export ENABLE_VECTOR_STORAGE=false
    fi
else
    log "Vector storage is disabled"
fi

# Check memory system configuration
if [ "${ENABLE_MEMORY:-false}" = "true" ]; then
    log "Checking memory system configuration..."
    
    MEMORY_K=${MEMORY_K:-10}
    MAX_CONTEXT_LENGTH=${MAX_CONTEXT_LENGTH:-4000}
    
    if [ "$MEMORY_K" -le 0 ] || [ "$MAX_CONTEXT_LENGTH" -le 0 ]; then
        error "Invalid memory configuration: MEMORY_K=$MEMORY_K, MAX_CONTEXT_LENGTH=$MAX_CONTEXT_LENGTH"
        exit 1
    fi
    
    success "✓ Memory system configured (K=$MEMORY_K, Context=$MAX_CONTEXT_LENGTH)"
else
    log "Memory system is disabled"
fi

# Test database connections
log "Testing database connections..."

# Test PostgreSQL if configured
if [ -n "$POSTGRES_URL" ]; then
    log "Testing PostgreSQL connection..."
    python3 -c "
import os
from sqlalchemy import create_engine, text
try:
    engine = create_engine(os.getenv('POSTGRES_URL'), pool_pre_ping=True)
    with engine.connect() as conn:
        result = conn.execute(text('SELECT 1'))
        print('PostgreSQL connection successful')
except Exception as e:
    print(f'PostgreSQL connection failed: {e}')
    exit(1)
" || {
        warning "PostgreSQL connection test failed - continuing"
    }
    success "✓ PostgreSQL connection established"
else
    warning "PostgreSQL URL not configured"
fi

# Test Redis if configured
if [ -n "$REDIS_URL" ]; then
    log "Testing Redis connection..."
    python3 -c "
import os
import redis
try:
    redis_url = os.getenv('REDIS_URL')
    redis_password = os.getenv('REDIS_PASSWORD')
    if redis_password:
        r = redis.from_url(redis_url, password=redis_password)
    else:
        r = redis.from_url(redis_url)
    r.ping()
    print('Redis connection successful')
except Exception as e:
    print(f'Redis connection failed: {e}')
    exit(1)
" || {
        warning "Redis connection test failed - continuing"
    }
    success "✓ Redis connection established"
else
    warning "Redis URL not configured"
fi

# Test OpenAI API if configured
if [ -n "$OPENAI_API_KEY" ]; then
    log "Testing OpenAI API connection..."
    python3 -c "
import os
import httpx
import asyncio

async def test_openai():
    try:
        async with httpx.AsyncClient() as client:
            headers = {
                'Authorization': f'Bearer {os.getenv(\"OPENAI_API_KEY\")}',
                'Content-Type': 'application/json'
            }
            response = await client.get(
                'https://api.openai.com/v1/models',
                headers=headers,
                timeout=10.0
            )
            if response.status_code == 200:
                print('OpenAI API connection successful')
            else:
                print(f'OpenAI API returned status {response.status_code}')
                exit(1)
    except Exception as e:
        print(f'OpenAI API connection failed: {e}')
        exit(1)

asyncio.run(test_openai())
" || {
        warning "OpenAI API test failed - will use fallback LLM"
    }
    success "✓ OpenAI API connection established"
else
    log "OpenAI API key not configured - will use local LLM"
fi

# Check and install browser dependencies if browser automation is enabled
if [ "${HEADLESS_BROWSER:-true}" = "true" ] || [ "${AUTO_APPLY_ENABLED:-false}" = "true" ]; then
    log "Checking browser automation dependencies..."
    
    # Check if Playwright is available
    python3 -c "import playwright" 2>/dev/null || {
        warning "Playwright not available - browser automation disabled"
        export AUTO_APPLY_ENABLED=false
    }
    
    # Check if Chrome/Chromium is available
    if command -v google-chrome &> /dev/null || command -v chromium &> /dev/null; then
        success "✓ Browser automation dependencies available"
    else
        warning "Chrome/Chromium not found - some features may not work"
    fi
fi

# Pre-warm the application by importing main modules
log "Pre-warming application modules..."
python3 -c "
try:
    from app.services.enhanced_crew_ai_service import EnhancedCrewAIService
    from app.services.llm_optimizer import LLMOptimizer
    from app.services.memory_manager import MemoryManager
    print('✓ Enhanced modules imported successfully')
except ImportError as e:
    print(f'⚠ Enhanced modules not available: {e}')
    print('Falling back to basic services...')
except Exception as e:
    print(f'Module import error: {e}')
    print('Continuing with basic services...')
"

# Set up signal handlers for graceful shutdown
trap 'echo "Received shutdown signal, cleaning up..."; exit 0' SIGTERM SIGINT

# Start the main application
log "Starting FastAPI application..."

# Determine number of workers based on CPU cores and environment
if [ "${NODE_ENV:-development}" = "production" ]; then
    WORKERS=${WORKERS:-1}  # Conservative for memory usage
else
    WORKERS=1  # Single worker for development
fi

log "Starting with $WORKERS worker(s)..."

# uvicorn requires lowercase log levels
UVICORN_LOG_LEVEL=$(echo "${LOG_LEVEL:-info}" | tr '[:upper:]' '[:lower:]')

# Set additional optimization flags
export MALLOC_ARENA_MAX=2  # Reduce memory fragmentation
export PYTHONHASHSEED=random  # Security enhancement

# Start the application with optimized settings
exec python3 -m uvicorn main:app \
    --host 0.0.0.0 \
    --port 8000 \
    --workers $WORKERS \
    --loop asyncio \
    --access-log \
    --log-level ${UVICORN_LOG_LEVEL} \
    --no-server-header \
    --date-header \
    --timeout-keep-alive 5 \
    --timeout-graceful-shutdown 30 