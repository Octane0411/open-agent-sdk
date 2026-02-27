FROM ubuntu:24.04

# Install basic utilities
RUN apt-get update && apt-get install -y \
    curl \
    bash \
    git \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /workspace
