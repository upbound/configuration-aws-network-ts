#!/bin/sh

source ./env

set -xe

mkdir -p ${XPKG_DIR}
for platform in ${BUILD_PLATFORMS}; do
  crossplane xpkg push  ${XPKG_REPO}/${FN_NAME}:v${VERSION} -f ${XPKG_DIR}/${FN_NAME}-${platform}-v${VERSION}.xpkg
done
