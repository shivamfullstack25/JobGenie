#!/bin/bash

# Script to prepare Maven repository for Docker builds
echo "Preparing Maven repository for Docker builds..."

# Create maven-repo directory in each service
SERVICES=("eureka-server" "api-gateway" "user-service" "job-service" "resume-service" "notification-service")

for service in "${SERVICES[@]}"; do
    echo "Preparing $service..."
    
    # Create maven-repo directory
    mkdir -p "$service/maven-repo"
    
    # Copy local Maven repository
    cp -r ~/.m2/repository/* "$service/maven-repo/" 2>/dev/null || echo "Warning: Could not copy Maven repository for $service"
done

echo "Maven repository preparation complete!" 