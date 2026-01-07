#!/bin/sh

source ./env

set -xeu

mkdir -p ${XPKG_DIR}
  crossplane xpkg build \
  --package-root="package" \
  --examples-root="examples" \
  -o ${XPKG_DIR}/${CONFIGURATION_NAME}-v${VERSION}.xpkg
