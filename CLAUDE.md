# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Heroku buildpack that runs at slug-compile time. It does two unrelated jobs:

1. **Static asset upload** — copies everything under the app's build output directory to S3, writes a `.profile.d` script exporting `STATIC_SERVER`/`STATIC_PATH`, then deletes the uploaded files from the slug to keep it small.
2. **Dynatrace naming** — copies `profile.d/10-dynatrace-naming.sh` into the slug so the dyno exports `DT_CLUSTER_ID`/`DT_HOST_ID` at boot.

The two paths share nothing but `bin/compile`. Changing one shouldn't touch the other.

Requires the Node buildpack to be installed alongside it (`heroku/heroku-buildpack-nodejs`).

## Commands

There is no build, lint, or test setup. `npm test` is the npm placeholder and exits 1 — don't run it expecting a signal, and don't treat its failure as a regression.

Verification is manual. The realistic options:

- **Node uploader in isolation** — the script reads everything from env, so you can drive it directly:
  ```sh
  BUILD_DIR=/path/to/fake-app CACHE_DIR=/tmp/cache ENV_DIR=/tmp/env \
  SOURCE_VERSION=abc1234 node lib/upload.js
  ```
  `ENV_DIR` must exist (Heroku's convention: one file per var, filename = var name, contents = value). Real AWS credentials will cause real uploads to the production bucket — point `AWS_STATIC_SOURCE_DIRECTORY` at an empty dir or omit credentials when you only want to exercise the code path.
- **Shell entrypoints** — `bash bin/compile <build-dir> <cache-dir> <env-dir>` from a scratch build dir. Note it runs `npm install` in the buildpack directory itself, and `set -o nounset` means an unset `SOURCE_VERSION` aborts the compile.
- **`profile.d/10-dynatrace-naming.sh`** — pure shell, no side effects beyond exports and an echo. Source it in a subshell with `FS_BLUEPRINT_NAME`/`FS_SYSTEM_NAME` (or a `blueprint.yml` in cwd) set and inspect the result.

## Execution model

Heroku invokes `bin/compile <build-dir> <cache-dir> <env-dir>`. That script sources `lib/output.sh` for the `header`/`info`/`output` log helpers (all Heroku-style indented output, piped to `/tmp/node-build-log.txt`), installs the buildpack's own npm dependencies, then hands off to `lib/upload.js` with `BUILD_DIR`, `CACHE_DIR`, `ENV_DIR`, and `SOURCE_VERSION` passed explicitly.

`lib/upload.js` resolves config through `getEnvVariable(name, fallback)`, which checks `process.env` first and then falls back to reading `$ENV_DIR/<name>` — the buildpack API's file-per-var form. New config knobs should go through that helper, not `process.env` directly.

`lib/upload.js` is CommonJS and stays that way — it was deliberately kept off ESM to hold the AWS SDK v3 migration to one change at a time. That constrains dependency choices: anything ESM-only is out (this is why slug cleanup uses `fs.rm` rather than a current `del`, whose every version past 6 is ESM-only).

Uploads go through `@aws-sdk/lib-storage`'s `Upload` rather than a bare `PutObjectCommand`, because the `Body` is a `fs.createReadStream` and `Upload` is what handles a stream of unknown length. Credentials are only attached to the `S3Client` when both `S3_ACCESS_KEY` and `S3_SECRET_ACCESS_KEY` resolve — passing a credentials object with undefined members makes v3 throw instead of falling through to the default provider chain. `glob` is promise-based as of v9, so there's no callback form to hand it; the uploader wires its rejection handler to the `exit 1` path.

The uploader is deliberately failure-tolerant: misconfiguration and S3 errors both log and `process.exit(0)`, so a broken upload never fails an app deploy. Preserve that unless asked otherwise. The one exception is a glob error, which exits 1.

`bin/release` is an empty stub. `bin/detect` just echoes a name and exits 0.

## Specialization for the FamilySearch CDN

The buildpack started as a general-purpose S3 uploader and has since been hardwired to one bucket. The README now matches the code; keep it that way when you change behavior. What the specialization left behind:

- The bucket is hardcoded to `fs-cdn2-origin` (`lib/upload.js`), and the `S3_BUCKET_NAME` lookup is commented out just above it.
- Keys get an `assets/` segment prepended on top of `AWS_STATIC_PREFIX`.
- `STATIC_PATH` is only `/<AWS_STATIC_PREFIX>` — the original `<date>/<sha>` version segment is commented out. `SOURCE_VERSION` is still threaded from `bin/compile` and truncated to 7 chars, but nothing consumes it.
- Credentials are read as `S3_ACCESS_KEY` / `S3_SECRET_ACCESS_KEY`, not the conventional `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`.

Those commented-out lines are the record of what was removed; leave them unless you're restoring the behavior.

## Conventions

- Uploaded objects get `public-read` ACL and one-year immutable caching (`Expires`, `CacheControl`). The path is expected to be content-versioned by the app's own build, so cache headers stay aggressive.
- Post-upload slug cleanup removes the source directory outright (`fs.rm` with `recursive`/`force`), `_index.html` included. The intent was to keep `_index.html` in the slug because the app still serves it from the dyno, and the old code carried a `del([dir, "!**/_index.html"])` exclusion to that end — but it never worked, since `del` matched the directory itself and removed it recursively. Treat "does `_index.html` need to survive?" as an open question, not settled behavior; making it survive means globbing the tree and unlinking everything else.
- `lib/environment.sh` defines `export_env_dir` but nothing sources it. It's dead code; don't build on it.
- Buildpack scripts are tracked mode `644`, not `755`. Keep it that way when editing so diffs stay clean.
- Bump `version` in `package.json` and add a `CHANGELOG.md` entry (Keep a Changelog format, semver) for any user-visible change — the changelog is maintained here, so keep it current.
- Comments in `profile.d/10-dynatrace-naming.sh` carry the reasoning for the naming scheme and why Heroku needs `DT_CLUSTER_ID` as a host-group stand-in. Read them before changing the identity format; `@fs/startup` sets a matching `DT_CLUSTER_ID` on cluster workers, so the value is a cross-repo contract.
