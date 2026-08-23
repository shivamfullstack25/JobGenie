# Use an official Maven image
FROM maven:3.9.6-eclipse-temurin-17 as build

WORKDIR /app
COPY . /app
RUN mvn clean install -pl resume-service -am -DskipTests -Dspotless.check.skip=true

FROM eclipse-temurin:17-jre
WORKDIR /app
COPY --from=build /app/resume-service/target/resume-service*.jar app.jar
ENTRYPOINT ["java", "-jar", "app.jar"] 