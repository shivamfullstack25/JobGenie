# Use an official Maven image
FROM maven:3.9.6-eclipse-temurin-17 as build

WORKDIR /app
COPY . /app
RUN mvn clean install -pl user-service -am -DskipTests -Dspotless.check.skip=true

FROM eclipse-temurin:17-jre
WORKDIR /app

# Create secrets directory for Firebase service account
RUN mkdir -p /app/secrets

# Copy the built JAR
COPY --from=build /app/user-service/target/user-service*.jar app.jar

# Firebase service account will be mounted via volume in docker-compose

ENTRYPOINT ["java", "-jar", "app.jar"] 