#!/bin/sh

source ./env

set -xe

mkdir -p ${XPKG_DIR}
for platform in ${BUILD_PLATFORMS}; do
  crossplane xpkg build --embed-runtime-image-tarball=${DOCKER_IMAGE_DIR}/${FN_NAME}-runtime-${platform}-v${VERSION}.tar \
  --package-root="package-function" \
  -o ${XPKG_DIR}/${FN_NAME}-${platform}-v${VERSION}.xpkg
done
