#!/bin/sh

. ./env

set -xe
XPKG_FILES=$(echo ${XPKG_DIR}/${FN_NAME}-*-v${VERSION}.xpkg|tr ' ' ,)
up xpkg push ${XPKG_REPO}/${FN_NAME}:v${VERSION} -f ${XPKG_FILES}
