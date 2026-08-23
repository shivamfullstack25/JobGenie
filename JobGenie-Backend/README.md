# JobGenie-Backend

This is the Java Spring Boot backend for JobGenie, organized as microservices.

## Services
- User Service
- Resume Service
- Job Service
- Notification Service
- API Gateway
- Eureka Server

## Setup

1. Install Java 17+ and Maven.
2. Copy `.env.example` to `.env` and fill in your environment variables.
3. Start PostgreSQL and MinIO (or S3).
4. Build all services:
   ```bash
   mvn clean install
   ```
5. Start services (each in its directory):
   ```bash
   mvn spring-boot:run
   ```

## Environment Variables
See `.env.example` for required variables (DB, S3, email, AI service, Firebase, etc).

## Docker
To build and run with Docker Compose:
```bash
docker-compose up --build
``` 