#!/bin/sh
# Refuses AWS credentials in this repository.
#
# examples/network/providerconfig.yaml holds a ProviderConfig and its secret
# together so automated testing can apply both at once. That means it is
# tracked with placeholders and meant to be edited locally, which puts real
# credentials one `git add .` away from being published.
#
# Two modes, so the pre-commit hook and CI share one definition of what a
# credential looks like:
#
#   check-credentials.sh            scan tracked files on disk   (CI)
#   check-credentials.sh --staged   scan staged blobs            (pre-commit)
#
# Deliberately no `set -e`: this script manages its own exit status, and an
# AND-OR list returning non-zero must not abort the scan early.
set -u

mode=worktree
[ "${1:-}" = '--staged' ] && mode=staged

guarded='examples/network/providerconfig.yaml'
# This file necessarily contains the patterns it searches for.
self='hack/check-credentials.sh'

fail=0
note() { printf '%s\n' "$*" >&2; }

if [ "$mode" = staged ]; then
  files=$(git diff --cached --name-only --diff-filter=ACM)
  read_file() { git show ":$1" 2>/dev/null; }
else
  files=$(git ls-files)
  read_file() { cat "$1" 2>/dev/null; }
fi

[ -n "$files" ] || exit 0

# 1. The credentials file must still hold its placeholders.
if printf '%s\n' "$files" | grep -qx "$guarded"; then
  if ! read_file "$guarded" | grep -q 'REPLACE_ME'; then
    note "BLOCKED: $guarded no longer has its REPLACE_ME placeholders."
    note ""
    note "  Real credentials must never be committed. To keep a local edit"
    note "  out of git for good:"
    note ""
    note "    git restore --staged $guarded"
    note "    git update-index --skip-worktree $guarded"
    note ""
    fail=1
  fi
fi

# 2. An AWS key in any file, not just that one. grep -a so a binary blob is
#    scanned rather than skipped.
offenders=$(
  printf '%s\n' "$files" | while IFS= read -r f; do
    [ -n "$f" ] || continue
    if [ "$f" = "$self" ]; then continue; fi
    blob=$(read_file "$f") || continue
    if printf '%s' "$blob" | grep -aEq '(AKIA|ASIA|ABIA|ACCA)[A-Z0-9]{16}'; then
      printf '%s\taccess key ID\n' "$f"
    fi
    if printf '%s' "$blob" | grep -aEq 'aws_secret_access_key[[:space:]]*=[[:space:]]*[A-Za-z0-9/+=]{40}'; then
      printf '%s\tsecret access key\n' "$f"
    fi
  done
)

if [ -n "$offenders" ]; then
  printf '%s\n' "$offenders" | while IFS="$(printf '\t')" read -r f kind; do
    note "BLOCKED: $f looks like it contains an AWS $kind."
  done
  fail=1
fi

if [ "$fail" -ne 0 ]; then
  if [ "$mode" = staged ]; then
    note "Commit aborted. Use --no-verify only if you are certain."
  else
    note "Credential check failed."
  fi
fi
exit "$fail"
