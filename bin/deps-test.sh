#!/usr/bin/env bash
# bin/compile <build-dir> <cache-dir> <env-dir>

### Configure environment

set -o errexit    # always exit on error
set -o pipefail   # don't ignore exit codes when piping output
set -o nounset    # fail on unset variables
unset GIT_DIR     # Avoid GIT_DIR leak from previous build steps

generated_lockfile=0

### Send deps to Frontier Dashboard
echo "Frontier Dashboard steps:"
echo "$(env)"
echo "$(ls -la)"
echo "Checking for lockfile..."
if [ ! -f package-lock.json ]; then
  echo "No lockfile, generating one"
  generated_lockfile=1
  npm install --package-lock-only
fi
echo "Flattening deps... " && node bin/flatten-deps.js && echo "Done.\n"
echo "Sending deps to Frontier Dashboard... " curl -X POST -H "x-api-key: hmPlMe6As2aNih6Dg3sRj8mHhiM9mDWo1bldZoaz"  -F 'packagejson=@package.json' -F 'packagelock=@package-lock.json' -d "$(cat ./deps.json.flat)" https://tiagtww9kj.execute-api.us-east-1.amazonaws.com/dev/app/deploy/snapshot && printf "Done.\n"
echo "Cleaning up $generated_lockfile"
if [ $generated_lockfile -eq 1 ]; then
  echo "Removing generated lockfile"
  rm package-lock.json
fi
echo "Done with Frontier Dashboard steps"
