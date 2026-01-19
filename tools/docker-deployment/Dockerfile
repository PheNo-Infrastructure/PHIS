# OpenSILEX 1.4.9-rdg with Critical Patches
# This Dockerfile builds OpenSILEX from source and applies fixes for:
# - GroupDAO NullPointerException (authentication bug)
# - AccountDAO auto-group assignment (Feide user credentials)

FROM maven:3.8-eclipse-temurin-11 AS builder

# Install git
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

# Clone OpenSILEX source
WORKDIR /build
RUN git clone --depth 1 --branch 1.4.9-rdg https://github.com/OpenSILEX/opensilex.git .

# Copy and apply patches
COPY patches/ /patches/
RUN for patch in /patches/*.patch; do \
        echo "Applying patch: $(basename $patch)"; \
        patch -p1 < "$patch" || exit 1; \
    done

# Build OpenSILEX (skip tests to speed up build)
RUN mvn clean install -DskipTests -DskipFrontBuild || \
    (echo "Build failed, attempting without Swagger validation..." && \
     mvn clean install -DskipTests -DskipFrontBuild -Dmaven.javadoc.skip=true)

# Find the built release directory
RUN RELEASE_DIR=$(find opensilex-release/target -maxdepth 1 -type d -name "opensilex-release-*" | head -1) && \
    mkdir -p /app && \
    cp -r $RELEASE_DIR/* /app/

# Production image
FROM eclipse-temurin:11-jre

# Install required packages
RUN apt-get update && \
    apt-get install -y curl && \
    rm -rf /var/lib/apt/lists/*

# Create OpenSILEX user (or use existing UID 1000)
RUN id -u opensilex &>/dev/null || useradd -m opensilex

# Set up application directory
WORKDIR /app
COPY --from=builder --chown=opensilex:opensilex /app /app

# Create directories for configuration and data
RUN mkdir -p /app/config /app/data /app/logs && \
    chown -R opensilex:opensilex /app

USER opensilex

# Expose ports
EXPOSE 8666 8667

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8666/rest/core/ping || exit 1

# Default command
ENTRYPOINT ["java", "-jar", "/app/opensilex.jar"]
CMD ["server", "start", "--host=0.0.0.0", "--port=8666", "--adminPort=8667"]
