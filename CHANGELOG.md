# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-07-30

### Changed
- **Requires Node 24 or newer at slug-compile time.** The buildpack runs `npm ci` with whatever
  Node the Node buildpack installed for the app, so the app's pinned Node version has to satisfy
  this. Node 24 is the floor our security mandate requires; AWS SDK v3 independently needs at
  least Node 20. Apps pinned below 24 need to move up before taking this version.
- Migrated from `aws-sdk` v2 (maintenance mode since 2023) to `@aws-sdk/client-s3` and
  `@aws-sdk/lib-storage` v3. `lib-storage`'s `Upload` replaces v2's `s3.upload`, which keeps the
  streaming behavior — files are still streamed from disk rather than read into memory. Key
  layout, `public-read` ACL, `Expires`, 16-way upload concurrency, and the 10-retry policy
  (expressed as `maxAttempts: 11` in v3) are all unchanged. `CacheControl` is corrected
  separately, below.
- Credentials are now only passed to the client when both `S3_ACCESS_KEY` and
  `S3_SECRET_ACCESS_KEY` resolve. v2 silently fell back to its default credential chain when
  config values were undefined; v3 rejects a credentials object with undefined members, so the
  chain is left in place instead.
- Slug cleanup uses `fs.rm(dir, { recursive: true, force: true })` instead of `del`. Behavior is
  unchanged — the old `"!**/_index.html"` exclusion never actually spared `_index.html`, because
  `del` matched the source directory itself and removed it recursively, leaving the negative
  pattern to filter nothing but `del`'s own return value. Dropping `del` also drops its
  `rimraf@3` → `glob@7` → `minimatch@3` chain and the high-severity `brace-expansion` advisory
  (GHSA-mh99-v99m-4gvg) that comes with it; `npm audit` is clean. `del` could not simply be
  updated, because every version past 6 is ESM-only, and the advisory could not be resolved with
  an `overrides` pin, because `brace-expansion@5`'s CommonJS build exports an object where
  `minimatch@3` expects a callable.
- `Content-Type` on uploaded objects is unchanged from v2, including for `.js` and `.mjs`.
  `mime-types` v3 returns `text/javascript` where v2 returned `application/javascript` — the only
  web-asset type that moved between the pinned `mime-types@2.1.29` and `3.0.2` — so the uploader
  pins `.js`/`.mjs` back to `application/javascript` explicitly. Both types are valid and browsers
  treat them identically, but CDN rules commonly key compression and caching on a content-type
  allowlist, and this bucket has been served as `application/javascript` for years. Nothing else
  changed: `.woff`, `.woff2`, and `.ico` already resolved to `font/woff`, `font/woff2`, and
  `image/vnd.microsoft.icon` under 2.1.29.
- Updated `glob` 7 → 13 and `mime-types` 2 → 3, and bumped `async` to 3.2.6. `glob` is
  promise-based as of v9, so the uploader awaits it rather than passing a callback. `lib/upload.js`
  remains a CommonJS module.

### Removed
- `lodash`, `shelljs`, and `del` dependencies. `shelljs` was imported but never used, `lodash` was
  only providing a `typeof` check, and `del` was replaced by `fs.rm` (see above). The buildpack now
  installs 47 packages at compile time instead of 99.

### Fixed
- `CacheControl` on uploaded objects now says `max-age=31536000,s-maxage=31536000` instead of
  `max-age=31536000000,smax-age=31536000000`. The value was being built from a milliseconds
  constant, but HTTP cache directives take delta-seconds, so it claimed a thousand-year lifetime
  while `Expires` said one year. `smax-age` was also a misspelling of `s-maxage`, so shared caches
  ignored that directive entirely and fell back to `max-age`. Nothing served stale content — asset
  filenames are content-hashed by the app's own build, and caches clamp an overflowing
  delta-seconds — but the headers now match the one-year lifetime the README documents.

## [1.1.0] - 2026-07-09

### Added
- Dynatrace host/cluster naming. `bin/compile` now copies `profile.d/10-dynatrace-naming.sh`
  into the slug's `.profile.d/` so it runs at dyno boot (before the Procfile command) and
  exports `DT_CLUSTER_ID` and `DT_HOST_ID` for the Dynatrace OneAgent. Naming mirrors our
  AWS/Beanstalk convention (`{blueprint}-{system}` for the cluster, plus dyno + UUID for the
  host), sourced from `FS_BLUEPRINT_NAME`/`FS_SYSTEM_NAME` with a fallback to the in-slug
  `blueprint.yml` `name` and `TARGET_ENV`. Independent of the S3 asset upload.

## [1.0.0]

### Added
- Uploads static assets to S3 when building Heroku apps.
- Exports `STATIC_SERVER` and `STATIC_PATH` to the runtime, overridable via config vars.
- Deletes uploaded files after upload to keep the slug size small.
