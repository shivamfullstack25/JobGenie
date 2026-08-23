# JobGenie Docker Setup Guide

This guide will help you set up and run the complete JobGenie platform using Docker.

## Prerequisites

- Docker Desktop installed and running
- Docker Compose installed
- At least 8GB RAM available for Docker
- At least 10GB free disk space

## Quick Start

### 1. Clone and Navigate to Project
```bash
cd JobGenie
```

### 2. Run the Docker Startup Script
```bash
./docker-start.sh
```

This script will:
- Check Docker installation
- Create environment configuration
- Build all Docker images
- Start all services
- Wait for services to be ready
- Show service status

### 3. Access the Application

Once the startup is complete, you can access:

- **Frontend**: http://localhost:3000
- **API Gateway**: http://localhost:8080
- **API Gateway Swagger**: http://localhost:8080/api/docs
- **AI Service**: http://localhost:8000
- **AI Service Docs**: http://localhost:8000/docs
- **Eureka Server**: http://localhost:8761

## Manual Setup

If you prefer to set up manually or need to troubleshoot:

### 1. Environment Configuration

Create a `.env` file in the project root:

```bash
cp env.example .env
```

Edit the `.env` file and update:
- `OPENAI_API_KEY`: Your OpenAI API key (required for AI features)
- Other settings as needed

### 2. Build and Start Services

```bash
# Build all images
docker-compose build

# Start all services
docker-compose up -d

# Check service status
docker-compose ps
```

### 3. Monitor Services

```bash
# View logs
docker-compose logs -f

# View logs for specific service
docker-compose logs -f ai-service

# Check service health
docker-compose ps
```

## Service Architecture

The JobGenie platform consists of the following services:

### Core Services
- **PostgreSQL**: Database (port 5432)
- **Redis**: Caching and session storage (port 6379)
- **Eureka Server**: Service discovery (port 8761)

### Backend Services
- **API Gateway**: Spring Cloud Gateway (port 8080)
- **User Service**: User management (port 8081)
- **Job Service**: Job management (port 8082)
- **Resume Service**: Resume processing (port 8083)
- **Notification Service**: Notifications (port 8084)

### AI Services
- **AI Service**: FastAPI-based AI processing (port 8000)

### Frontend
- **Frontend**: React application served by Nginx (port 3000)

## Docker Commands

### Basic Operations
```bash
# Start all services
docker-compose up -d

# Stop all services
docker-compose down

# Restart all services
docker-compose restart

# View service status
docker-compose ps

# View logs
docker-compose logs

# View logs for specific service
docker-compose logs [service-name]
```

### Advanced Operations
```bash
# Rebuild specific service
docker-compose build [service-name]

# Rebuild all services
docker-compose build --no-cache

# Stop and remove volumes (deletes data)
docker-compose down -v

# Clean up unused resources
docker system prune -f
```

### Script Commands
```bash
# Start complete platform
./docker-start.sh

# View logs
./docker-start.sh --logs

# Check status
./docker-start.sh --status

# Stop services
./docker-start.sh --stop

# Restart services
./docker-start.sh --restart

# Clean up everything
./docker-start.sh --clean

# Show help
./docker-start.sh --help
```

## Troubleshooting

### Common Issues

#### 1. Port Already in Use
```bash
# Check what's using the port
netstat -tulpn | grep :8080

# Stop conflicting service or change port in docker-compose.yml
```

#### 2. Docker Build Fails
```bash
# Clean Docker cache
docker system prune -a

# Rebuild without cache
docker-compose build --no-cache
```

#### 3. Services Not Starting
```bash
# Check logs
docker-compose logs [service-name]

# Check resource usage
docker stats

# Restart specific service
docker-compose restart [service-name]
```

#### 4. Database Connection Issues
```bash
# Check PostgreSQL logs
docker-compose logs postgres

# Check if database is ready
docker-compose exec postgres pg_isready -U jobgenie
```

#### 5. AI Service Issues
```bash
# Check AI service logs
docker-compose logs ai-service

# Verify OpenAI API key
docker-compose exec ai-service env | grep OPENAI_API_KEY
```

### Performance Issues

#### 1. Slow Startup
- Increase Docker memory allocation (recommended: 8GB+)
- Use SSD storage for Docker
- Close unnecessary applications

#### 2. High Memory Usage
```bash
# Monitor resource usage
docker stats

# Restart services to free memory
docker-compose restart
```

### Network Issues

#### 1. Services Can't Communicate
```bash
# Check network
docker network ls
docker network inspect jobgenie_jobgenie-network

# Restart network
docker-compose down
docker-compose up -d
```

#### 2. External API Calls Fail
- Check firewall settings
- Verify internet connection
- Check proxy settings if applicable

## Configuration

### Environment Variables

Key environment variables in `.env`:

```bash
# Required
OPENAI_API_KEY=your_openai_api_key_here

# Database
POSTGRES_USER=jobgenie
POSTGRES_PASSWORD=jobgenie123
POSTGRES_DB=jobgenie

# AI Service
LLM_PROVIDER=openai
ENABLE_VECTOR_STORAGE=true
ENABLE_MEMORY=true
HEADLESS_BROWSER=true
AUTO_APPLY_ENABLED=false
```

### Service Configuration

Each service can be configured through:
- Environment variables in `.env`
- Service-specific configuration files
- Docker Compose overrides

## Development

### Local Development
```bash
# Start only infrastructure services
docker-compose up -d postgres redis

# Run services locally
cd JobGenie-Backend && mvn spring-boot:run
cd JobGenie-AI && uvicorn main:app --reload
cd JobGenie-Frontend && npm start
```

### Debugging
```bash
# Attach to running container
docker-compose exec [service-name] bash

# View real-time logs
docker-compose logs -f [service-name]

# Check container resources
docker stats
```

## Monitoring

### Health Checks
All services include health check endpoints:
- API Gateway: http://localhost:8080/actuator/health
- AI Service: http://localhost:8000/health
- Eureka: http://localhost:8761/actuator/health

### Logs
```bash
# View all logs
docker-compose logs

# Follow logs in real-time
docker-compose logs -f

# View logs for specific service
docker-compose logs -f ai-service
```

## Security

### Best Practices
1. Change default passwords in production
2. Use secrets management for sensitive data
3. Enable HTTPS in production
4. Regularly update Docker images
5. Monitor container security

### Production Deployment
1. Use Docker secrets for sensitive data
2. Enable logging aggregation
3. Set up monitoring and alerting
4. Use reverse proxy (Nginx/Traefik)
5. Enable SSL/TLS encryption

## Support

If you encounter issues:

1. Check the troubleshooting section above
2. Review service logs: `docker-compose logs [service-name]`
3. Verify environment configuration
4. Check Docker resource allocation
5. Ensure all prerequisites are met

For additional help, refer to:
- Service-specific documentation
- Docker documentation
- Spring Boot documentation
- FastAPI documentation 