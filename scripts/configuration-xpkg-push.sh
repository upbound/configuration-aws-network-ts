#!/bin/sh

source ./env

set -xe

up xpkg push --debug ${XPKG_REPO}/${CONFIGURATION_NAME}:v${VERSION} -f ${XPKG_DIR}/${CONFIGURATION_NAME}-v${VERSION}.xpkg
