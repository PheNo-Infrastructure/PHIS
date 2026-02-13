# OpenSILEX 1.4.9-rdg with Critical Patches
# This Dockerfile builds OpenSILEX from source and applies fixes for:
# - GroupDAO NullPointerException (authentication bug)
# - AccountDAO auto-group assignment (Feide user credentials)

FROM maven:3.9-eclipse-temurin-17 AS builder

# Install git and patch utility
RUN apt-get update && apt-get install -y git patch && rm -rf /var/lib/apt/lists/*

# Clone OpenSILEX source
WORKDIR /build
RUN git clone --depth 1 --branch 1.4.9-rdg https://github.com/OpenSILEX/opensilex.git .

# Copy and apply patches
COPY patches/ /patches/
RUN for patch in /patches/*.patch; do \
        echo "Applying patch: $(basename $patch)"; \
        patch -p1 < "$patch" || exit 1; \
    done

# Modify default MongoDB configuration for Docker deployment
RUN find . -name "opensilex.yml" -path "*/config/prod/*" -exec sed -i 's/host: localhost/host: mongodb/g' {} \; && \
    find . -name "opensilex.yml" -path "*/config/prod/*" -exec grep -A 3 "mongodb:" {} \;

# Build OpenSILEX (skip tests to speed up build)
RUN mvn clean install -DskipTests -DskipFrontBuild || \
    (echo "Build failed, attempting without Swagger validation..." && \
     mvn clean install -DskipTests -DskipFrontBuild -Dmaven.javadoc.skip=true)

# Find the built release directory
RUN RELEASE_DIR=$(find opensilex-release/target -maxdepth 1 -type d -name "opensilex-release-*" | head -1) && \
    mkdir -p /app && \
    cp -r $RELEASE_DIR/* /app/

# Production image
FROM eclipse-temurin:17-jre

# Install required packages and create user
RUN apt-get update && \
    apt-get install -y curl && \
    rm -rf /var/lib/apt/lists/* && \
    useradd -m opensilex

# Set up application directory
WORKDIR /app
COPY --from=builder --chown=opensilex:opensilex /app /app

# Create directories and copy default config
RUN mkdir -p /app/config/prod /app/data /app/logs

# Create default configuration file for Docker deployment
RUN echo '# MongoDB Configuration\n\
mongodb:\n\
  host: mongodb\n\
  port: 27017\n\
  database: opensilex\n\
  replicaSet: opensilex\n\
\n\
# GraphDB Configuration\n\
rdf4j:\n\
  host: graphdb\n\
  port: 7200\n\
  repository: opensilex' > /app/config/prod/opensilex.yml

# Set ownership for opensilex user
RUN chown -R opensilex:opensilex /app

USER opensilex

# Expose ports
EXPOSE 8666 8667

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8666/rest/core/ping || exit 1

# Default command
ENTRYPOINT ["java", "-jar", "/app/opensilex.jar"]
CMD ["server", "start", "--CONFIG_FILE=/app/config/opensilex.yml", "--host=0.0.0.0", "--port=8666", "--adminPort=8667"]
