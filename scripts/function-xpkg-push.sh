#!/bin/sh

. ./env

set -xe
XPKG_FILES=$(echo "${XPKG_DIR}/${FN_NAME}"-*-v"${VERSION}".xpkg | tr ' ' ',')
if [ -z "${XPKG_FILES}" ] || [ "${XPKG_FILES}" = "${XPKG_DIR}/${FN_NAME}-*-v${VERSION}.xpkg" ]; then
  echo "Error: No xpkg files found matching pattern"
  exit 1
fi
up xpkg push "${XPKG_REPO}/${FN_NAME}:v${VERSION}" -f "${XPKG_FILES}"
