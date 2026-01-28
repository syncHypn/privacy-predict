#!/bin/bash
# Sconify script for building SCONE-protected TEE image
#
# This script builds a SCONE-protected Docker image for deployment
# to iExec TEE workerpools.
#
# Prerequisites:
# - Docker installed and running
# - Access to SCONE registry (registry.scontain.com)
# - iExec CLI installed (npm install -g iexec)

set -e

# Configuration
SCONE_IMAGE="registry.scontain.com:5050/scone-production/iexec-sconify-image:5.7.5-v12"
INPUT_IMAGE="${INPUT_IMAGE:-ipred/tee-matching-engine:latest}"
OUTPUT_IMAGE="${OUTPUT_IMAGE:-ipred/tee-matching-engine:sconified}"

echo "============================================"
echo "iPred TEE Sconification Script"
echo "============================================"
echo "Input image:  $INPUT_IMAGE"
echo "Output image: $OUTPUT_IMAGE"
echo "============================================"

# Check Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "Error: Docker is not running"
    exit 1
fi

# Check if input image exists
if ! docker image inspect "$INPUT_IMAGE" > /dev/null 2>&1; then
    echo "Error: Input image $INPUT_IMAGE not found"
    echo "Build it first with: docker build -t $INPUT_IMAGE -f Dockerfile .."
    exit 1
fi

# Run sconification
echo "Starting sconification..."
docker run --rm \
    -v /var/run/docker.sock:/var/run/docker.sock \
    "$SCONE_IMAGE" sconify_iexec \
    --name=ipred-matching-engine \
    --from="$INPUT_IMAGE" \
    --to="$OUTPUT_IMAGE" \
    --binary-fs \
    --fs-dir=/app \
    --host-path=/etc/hosts \
    --host-path=/etc/resolv.conf \
    --binary=/usr/local/bin/node \
    --heap=1G \
    --dlopen=2 \
    --no-color \
    --verbose

echo "============================================"
echo "Sconification complete!"
echo "Output image: $OUTPUT_IMAGE"
echo "============================================"
echo ""
echo "Next steps:"
echo "1. Push to Docker Hub:    docker push $OUTPUT_IMAGE"
echo "2. Deploy to iExec:       iexec app deploy"
echo "3. Publish app order:     iexec app publish"
