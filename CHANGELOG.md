# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
