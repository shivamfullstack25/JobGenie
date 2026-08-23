#!/bin/bash

# JobGenie Docker Startup Script
# This script sets up and starts the complete JobGenie platform using Docker

set -e

echo "🚀 JobGenie Docker Startup Script"
echo "=================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker is installed and running
check_docker() {
    print_status "Checking Docker installation..."
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker first."
        echo "Visit: https://docs.docker.com/get-docker/"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        print_error "Docker Compose is not installed. Please install Docker Compose first."
        echo "Visit: https://docs.docker.com/compose/install/"
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        print_error "Docker daemon is not running. Please start Docker first."
        exit 1
    fi
    
    print_success "Docker and Docker Compose are ready"
}

# Setup environment file
setup_environment() {
    print_status "Setting up environment configuration..."
    
    if [ ! -f .env ]; then
        if [ -f env.example ]; then
            cp env.example .env
            print_success "Created .env file from env.example"
            print_warning "Please update OPENAI_API_KEY in .env file with your actual API key"
        else
            print_error "No .env file found and no env.example available"
            print_status "Creating basic .env file..."
            cat > .env << EOF
# JobGenie Environment Configuration

# OpenAI API Key (required for AI features)
# Get your API key from: https://platform.openai.com/api-keys
OPENAI_API_KEY=your_openai_api_key_here

# Database Configuration
POSTGRES_DB=jobgenie_db
POSTGRES_USER=jobgenie_user
POSTGRES_PASSWORD=jobgenie_pass
DATABASE_USERNAME=jobgenie_user
DATABASE_PASSWORD=jobgenie_pass

# Service URLs
API_GATEWAY_URL=http://localhost:8080
AI_SERVICE_URL=http://localhost:8000
FRONTEND_URL=http://localhost:3000

# Redis Configuration
REDIS_PASSWORD=

# Logging Level
LOG_LEVEL=INFO

# AI Service Configuration
LLM_PROVIDER=openai
ENABLE_VECTOR_STORAGE=true
ENABLE_MEMORY=true
VECTOR_STORE_PERSIST_DIR=/app/vector_db
MEMORY_K=10
MAX_CONTEXT_LENGTH=4000

# Browser Automation
HEADLESS_BROWSER=true
AUTO_APPLY_ENABLED=false

# Advanced Features
KAFKA_ENABLED=false
WEBSOCKET_ENABLED=true

# Database URLs for AI Service
POSTGRES_URL=postgresql://jobgenie_user:jobgenie_pass@postgres:5432/jobgenie_ai
REDIS_URL=redis://redis:6379/0

# Service Discovery
EUREKA_SERVER_URL=http://eureka-server:8761/eureka/
SERVICE_NAME=ai-service
SERVICE_PORT=8000

# Security
JWT_SECRET=your_jwt_secret_here
ENCRYPTION_KEY=your_encryption_key_here

# Performance
WORKER_PROCESSES=4
MAX_CONNECTIONS=100
REQUEST_TIMEOUT=300

# Monitoring
ENABLE_METRICS=true
METRICS_PORT=9090

# Development
DEBUG=false
RELOAD=false
EOF
            print_success "Created basic .env file"
            print_warning "Please update OPENAI_API_KEY in .env file with your actual API key"
        fi
    else
        print_status ".env file already exists"
    fi
}

# Clean up existing containers and volumes
cleanup_existing() {
    print_status "Cleaning up existing containers and volumes..."
    
    # Stop and remove existing containers
    if docker-compose ps -q | grep -q .; then
        print_status "Stopping existing containers..."
        docker-compose down --remove-orphans
        print_success "Existing containers stopped and removed"
    fi
    
    # Remove unused volumes (optional)
    read -p "Do you want to remove existing volumes? This will delete all data. (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_status "Removing existing volumes..."
        docker-compose down -v
        docker volume prune -f
        print_success "Existing volumes removed"
    fi
}

# Build Docker images
build_images() {
    print_status "Building Docker images..."
    
    # Build all services
    print_status "Building all services (this may take several minutes)..."
    if ! docker-compose build --no-cache; then
        print_error "Failed to build Docker images"
        return 1
    fi
    
    print_success "All Docker images built successfully"
}

# Start services
start_services() {
    print_status "Starting JobGenie services..."
    
    # Start all services in detached mode
    if ! docker-compose up -d; then
        print_error "Failed to start services"
        return 1
    fi
    
    print_success "All services started successfully"
}

# Wait for services to be ready
wait_for_services() {
    print_status "Waiting for services to be ready..."
    
    # Wait for PostgreSQL
    print_status "Waiting for PostgreSQL..."
    until docker-compose exec -T postgres pg_isready -U jobgenie_user > /dev/null 2>&1; do
        sleep 5
    done
    print_success "PostgreSQL is ready"
    
    # Wait for Redis
    print_status "Waiting for Redis..."
    until docker-compose exec -T redis redis-cli ping > /dev/null 2>&1; do
        sleep 5
    done
    print_success "Redis is ready"
    
    # Wait for Eureka Server
    print_status "Waiting for Eureka Server..."
    until curl -s http://localhost:8761 > /dev/null 2>&1; do
        sleep 10
    done
    print_success "Eureka Server is ready"
    
    # Wait for AI Service
    print_status "Waiting for AI Service..."
    until curl -s http://localhost:8000/health > /dev/null 2>&1; do
        sleep 10
    done
    print_success "AI Service is ready"
    
    # Wait for API Gateway
    print_status "Waiting for API Gateway..."
    until curl -s http://localhost:8080/actuator/health > /dev/null 2>&1; do
        sleep 10
    done
    print_success "API Gateway is ready"
    
    # Wait for Frontend
    print_status "Waiting for Frontend..."
    until curl -s http://localhost:3000 > /dev/null 2>&1; do
        sleep 10
    done
    print_success "Frontend is ready"
}

# Show service status
show_status() {
    print_status "Service Status:"
    echo "=================="
    
    # Show container status
    docker-compose ps
    
    echo ""
    print_status "Service URLs:"
    echo "==============="
    echo "Frontend: http://localhost:3000"
    echo "API Gateway: http://localhost:8080"
    echo "API Gateway Swagger: http://localhost:8080/api/docs"
    echo "AI Service: http://localhost:8000"
    echo "AI Service Docs: http://localhost:8000/docs"
    echo "Eureka Server: http://localhost:8761"
    echo "PostgreSQL: localhost:5432"
    echo "Redis: localhost:6379"
    
    echo ""
    print_status "Service Health Checks:"
    echo "=========================="
    
    # Check each service health
    services=(
        "postgres:5432"
        "redis:6379"
        "eureka-server:8761"
        "ai-service:8000"
        "api-gateway:8080"
        "frontend:3000"
    )
    
    for service in "${services[@]}"; do
        IFS=':' read -r name port <<< "$service"
        if curl -s "http://localhost:$port" > /dev/null 2>&1 || curl -s "http://localhost:$port/health" > /dev/null 2>&1 || curl -s "http://localhost:$port/actuator/health" > /dev/null 2>&1; then
            print_success "✓ $name is healthy"
        else
            print_warning "⚠ $name health check failed"
        fi
    done
}

# Show logs
show_logs() {
    print_status "Recent logs from all services:"
    echo "===================================="
    docker-compose logs --tail=20
}

# Main execution
main() {
    echo "Starting JobGenie Docker setup..."
    
    # Check prerequisites
    check_docker
    
    # Setup environment
    setup_environment
    
    # Ask user about cleanup
    read -p "Do you want to clean up existing containers? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        cleanup_existing
    fi
    
    # Build images
    build_images
    
    # Start services
    start_services
    
    # Wait for services
    wait_for_services
    
    # Show status
    show_status
    
    echo ""
    print_success "🎉 JobGenie is now running!"
    echo ""
    print_status "You can now access:"
    echo "• Frontend: http://localhost:3000"
    echo "• API Gateway: http://localhost:8080"
    echo "• AI Service: http://localhost:8000"
    echo ""
    print_status "To view logs: ./docker-start.sh --logs"
    print_status "To stop services: docker-compose down"
    print_status "To restart services: docker-compose restart"
}

# Handle command line arguments
case "${1:-}" in
    --logs)
        show_logs
        ;;
    --status)
        show_status
        ;;
    --stop)
        print_status "Stopping JobGenie services..."
        docker-compose down
        print_success "Services stopped"
        ;;
    --restart)
        print_status "Restarting JobGenie services..."
        docker-compose restart
        print_success "Services restarted"
        ;;
    --clean)
        print_status "Cleaning up JobGenie..."
        docker-compose down -v
        docker system prune -f
        print_success "Cleanup completed"
        ;;
    --help)
        echo "JobGenie Docker Startup Script"
        echo ""
        echo "Usage: $0 [OPTION]"
        echo ""
        echo "Options:"
        echo "  --logs     Show recent logs from all services"
        echo "  --status   Show service status and health checks"
        echo "  --stop     Stop all services"
        echo "  --restart  Restart all services"
        echo "  --clean    Stop services and clean up volumes"
        echo "  --help     Show this help message"
        echo ""
        echo "Without options, starts the complete JobGenie platform"
        ;;
    *)
        main
        ;;
esac 