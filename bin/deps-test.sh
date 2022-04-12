#!/usr/bin/env bash
# bin/compile <build-dir> <cache-dir> <env-dir>

### Configure environment

set -o errexit    # always exit on error
set -o pipefail   # don't ignore exit codes when piping output
set -o nounset    # fail on unset variables
unset GIT_DIR     # Avoid GIT_DIR leak from previous build steps

### Send deps to Frontier Dashboard
printf "\nFrontier Dashboard steps:\n"
printf "Scanning deps... " && npm ls --json > deps.json && printf "Done.\n"
printf "Flattening deps... " && node bin/flatten-deps.js && printf "Done.\n"
printf "Sending deps to Frontier Dashboard... " curl -X POST -H "x-api-key: KrgZiZRMgxNKvH5gew3n6VBxkcradwu9lQrZe5C7" -d "$(cat ./deps.json.flat)" https://tiagtww9kj.execute-api.us-east-1.amazonaws.com/dev/app/deploy/snapshot && printf "Done.\n"
printf "Done with Frontier Dashboard steps\n"