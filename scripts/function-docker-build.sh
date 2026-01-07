#!/bin/sh

source ./env

set -xe

mkdir -p ${DOCKER_IMAGE_DIR}
for platform in ${BUILD_PLATFORMS}; do 
  docker buildx build --platform linux/${platform} . --tag=${FN_NAME}:v${VERSION} --target=image --output type=docker,dest=${DOCKER_IMAGE_DIR}/${FN_NAME}-runtime-${platform}-v${VERSION}.tar
done
