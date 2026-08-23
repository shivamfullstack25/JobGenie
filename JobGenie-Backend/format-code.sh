#!/bin/bash

# JobGenie Backend Code Formatting Script
# This script runs Spotless to format all Java code in the backend services

echo "🔧 JobGenie Backend - Code Formatting with Spotless"
echo "=================================================="

# Function to format a service
format_service() {
    local service_name=$1
    local service_path=$2
    
    echo "📦 Formatting $service_name..."
    cd "$service_path"
    
    # Run Spotless apply to format code
    mvn spotless:apply
    
    if [ $? -eq 0 ]; then
        echo "✅ $service_name formatted successfully"
    else
        echo "❌ Failed to format $service_name"
        return 1
    fi
    
    cd - > /dev/null
}

# Function to check formatting
check_formatting() {
    local service_name=$1
    local service_path=$2
    
    echo "🔍 Checking formatting for $service_name..."
    cd "$service_path"
    
    # Run Spotless check
    mvn spotless:check
    
    if [ $? -eq 0 ]; then
        echo "✅ $service_name formatting is correct"
    else
        echo "❌ $service_name formatting needs to be fixed"
        return 1
    fi
    
    cd - > /dev/null
}

# Main execution
main() {
    local base_dir="$(pwd)"
    
    # List of services to format
    services=(
        "shared:shared"
        "eureka-server:eureka-server"
        "api-gateway:api-gateway"
        "user-service:user-service"
        "job-service:job-service"
        "resume-service:resume-service"
        "notification-service:notification-service"
    )
    
    echo "🚀 Starting code formatting..."
    echo ""
    
    # Format all services
    for service in "${services[@]}"; do
        IFS=':' read -r service_name service_path <<< "$service"
        format_service "$service_name" "$service_path"
        
        if [ $? -ne 0 ]; then
            echo "❌ Failed to format $service_name"
            exit 1
        fi
    done
    
    echo ""
    echo "🔍 Checking formatting for all services..."
    echo ""
    
    # Check formatting for all services
    for service in "${services[@]}"; do
        IFS=':' read -r service_name service_path <<< "$service"
        check_formatting "$service_name" "$service_path"
        
        if [ $? -ne 0 ]; then
            echo "❌ Formatting check failed for $service_name"
            exit 1
        fi
    done
    
    echo ""
    echo "🎉 All services formatted successfully!"
    echo ""
    echo "📋 Summary:"
    echo "  - All Java code has been formatted with Google Java Format"
    echo "  - Unused imports have been removed"
    echo "  - Import order has been standardized"
    echo "  - XML files have been formatted with Eclipse formatter"
    echo ""
    echo "💡 To check formatting without applying changes, run:"
    echo "   mvn spotless:check"
    echo ""
    echo "💡 To apply formatting to a specific service, run:"
    echo "   cd <service-directory> && mvn spotless:apply"
}

# Run main function
main "$@" 