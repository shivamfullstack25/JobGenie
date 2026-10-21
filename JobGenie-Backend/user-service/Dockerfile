# Build from the JobGenie-Backend directory (multi-module Maven project).
FROM maven:3.9.6-eclipse-temurin-17 AS build
WORKDIR /app
COPY . /app
# The cache mount keeps downloaded dependencies between builds instead of fetching them every time.
RUN --mount=type=cache,target=/root/.m2     mvn -B -q package -pl user-service -am -DskipTests -Dspotless.check.skip=true

FROM eclipse-temurin:17-jre
WORKDIR /app
RUN useradd --system --no-create-home jobgenie
COPY --from=build /app/user-service/target/user-service*.jar app.jar
USER jobgenie
EXPOSE 8081
ENTRYPOINT ["java", "-jar", "app.jar"]
