#!/bin/bash
# ZW-Connector Deployment Script
# Simple build and deploy script for Guacamole client
#
# Usage:
#   ./deploy-guacamole.sh        # Incremental build (faster)
#   ./deploy-guacamole.sh clean  # Clean build (slower, but thorough)

set -e

# Fixed paths
TOMCAT_DIR="/opt/apache-guacamole/tomcat9"
WEBAPPS_DIR="$TOMCAT_DIR/webapps"
CLIENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
    exit 1
}

# Main deployment process
log "Starting ZW-Connector deployment..."

# Check prerequisites
log "Checking prerequisites..."
if ! command -v mvn &> /dev/null; then
    error "Maven is not installed. Please install Maven first."
fi

if ! command -v java &> /dev/null; then
    error "Java is not installed. Please install Java first."
fi

if [ ! -d "$CLIENT_DIR" ]; then
    error "Client directory not found: $CLIENT_DIR"
fi

if [ ! -d "$WEBAPPS_DIR" ]; then
    error "Tomcat webapps directory not found: $WEBAPPS_DIR"
fi

# Build the client
log "Building ZW-Connector client..."
cd "$CLIENT_DIR"

# Check if we need a clean build
if [ "$1" == "clean" ]; then
    log "Performing clean build..."
    mvn clean package -DskipTests -Dmaven.javadoc.skip=true
else
    log "Performing incremental build..."
    mvn package -DskipTests -Dmaven.javadoc.skip=true
fi

# Check if WAR file was created
WAR_FILE="$CLIENT_DIR/guacamole/target/guacamole-1.6.0.war"
if [ ! -f "$WAR_FILE" ]; then
    error "Build failed - WAR file not found at: $WAR_FILE"
fi
log "✅ Build successful! WAR file created: $WAR_FILE"

# Create backup
log "Creating backup..."
cd "$WEBAPPS_DIR"
if [ -f "guacamole.war" ]; then
    cp guacamole.war "guacamole.war.backup.$TIMESTAMP"
    log "Backup created: guacamole.war.backup.$TIMESTAMP"
fi

# Stop Tomcat
log "Stopping Tomcat..."
if systemctl is-active --quiet tomcat; then
    systemctl stop tomcat
    log "Tomcat stopped"
else
    warn "Tomcat was not running"
fi

# Clean old deployment
log "Cleaning old deployment..."
if [ -d "$WEBAPPS_DIR/guacamole" ]; then
    rm -rf "$WEBAPPS_DIR/guacamole"
    log "Removed old deployment directory"
fi

if [ -f "$WEBAPPS_DIR/guacamole.war" ]; then
    rm -f "$WEBAPPS_DIR/guacamole.war"
    log "Removed old WAR file"
fi

# Deploy new WAR
log "Deploying new WAR file..."
cp "$WAR_FILE" "$WEBAPPS_DIR/guacamole.war"
chown tomcat:tomcat "$WEBAPPS_DIR/guacamole.war"
chmod 644 "$WEBAPPS_DIR/guacamole.war"
log "WAR file deployed to: $WEBAPPS_DIR/guacamole.war"

# Start Tomcat
log "Starting Tomcat..."
systemctl start tomcat

# Wait for Tomcat to start
log "Waiting for Tomcat to start..."
for i in {1..30}; do
    if systemctl is-active --quiet tomcat; then
        log "Tomcat started successfully"
        break
    fi
    sleep 1
    if [ $i -eq 30 ]; then
        error "Failed to start Tomcat within 30 seconds"
    fi
done

# Wait for deployment
log "Waiting for application deployment..."
for i in {1..60}; do
    if [ -d "$WEBAPPS_DIR/guacamole" ] && [ -f "$WEBAPPS_DIR/guacamole/WEB-INF/web.xml" ]; then
        log "Application deployed successfully!"
        break
    fi
    sleep 1
    if [ $i -eq 60 ]; then
        error "Deployment timeout - application did not deploy within 60 seconds"
    fi
done

# Test deployment
log "Testing deployment..."
sleep 5
for i in {1..10}; do
    if curl -f -s http://localhost:8080/guacamole/ > /dev/null 2>&1; then
        log "✅ ZW-Connector deployment completed successfully!"
        log "Application is available at: http://localhost:8080/guacamole/"
        exit 0
    fi
    sleep 2
done

warn "⚠️  Deployment may not be fully ready - please check manually at: http://localhost:8080/guacamole/"
log "✅ Deployment process completed"