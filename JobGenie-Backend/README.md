# JobGenie backend

Spring Boot 2.7 microservices (Java 17, Maven multi-module). See the [root README](../README.md)
to run the whole stack with Docker.

| Module | Responsibility |
|---|---|
| `api-gateway` | Routing, CORS, Firebase token verification, signed identity for downstream services |
| `user-service` | Accounts, sign-in, candidate profile (`/api/candidate-profile`), export and deletion |
| `job-service` | Jobs, saved jobs, applications and their lifecycle, Approval Center (`/api/approvals`), schedules |
| `resume-service` | Resume upload, text extraction, parsing via the AI service, PDF export |
| `notification-service` | Email / SMS / push delivery |
| `eureka-server` | Service discovery |
| `shared` | Entities, DTOs, exceptions, and the auth library every service auto-configures |

```bash
mvn -B test                 # build and test all modules
mvn spotless:apply          # format (Google Java Format)
```

No local Maven? Use Docker: `docker run --rm -v "$PWD":/w -w /w maven:3.9.6-eclipse-temurin-17 mvn -B test`.

Every service needs `INTERNAL_AUTH_SECRET` (the same value everywhere). For isolated local work on
one service, `AUTH_ENFORCEMENT=off` disables the checks.
