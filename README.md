# Purpose

Uploads static assets to S3 when building Heroku apps, then removes them from the slug to keep it small.

Requires the NodeJS buildpack to be installed. `https://github.com/heroku/heroku-buildpack-nodejs`

Requires Node 24 or newer. The buildpack installs its own dependencies with `npm ci` during slug
compile, using the Node version the Node buildpack put in place for the app — so the app's pinned
Node version has to satisfy this, not just the buildpack's.

The buildpack also gives the dyno a Dynatrace identity — see [Dynatrace naming](#dynatrace-naming) below. That part is independent of the S3 upload.

# Build Environment Variables

Read from the app's config vars, or from the buildpack `ENV_DIR` (one file per variable). None of these are validated up front; see [Failure behavior](#failure-behavior).

```sh
# S3 credentials — required for the upload to succeed
S3_ACCESS_KEY=<aws access key id>
S3_SECRET_ACCESS_KEY=<aws secret access key>

# optional, defaults shown
AWS_DEFAULT_REGION=us-east-1
# directory to upload, relative to the build directory (uploads its contents)
AWS_STATIC_SOURCE_DIRECTORY=build/static
# prefix to include in the S3 key and in STATIC_PATH
AWS_STATIC_PREFIX=static
```

# Where Assets Land

The bucket is hardcoded to `fs-cdn2-origin`. Keys are built as:

```
assets/<AWS_STATIC_PREFIX>/<path relative to AWS_STATIC_SOURCE_DIRECTORY>
```

So with the defaults, `build/static/js/main.abc123.js` uploads to `assets/static/js/main.abc123.js`.

Only files matching `**/*.*` are uploaded — a file with no extension is skipped. Uploads run 16 at a time, with up to 10 SDK retries each.

Every object is uploaded with a `public-read` ACL and a one-year cache lifetime (`Expires` and `CacheControl`). The path carries no version segment of its own, so the app's build is expected to produce content-hashed filenames.

# Exported Environment Variables to Runtime

After a successful upload, the buildpack writes `.profile.d/00-upload-static-files-to-s3-export-env.sh` into the slug, which exports:

```sh
STATIC_SERVER=fs-cdn2-origin.s3.amazonaws.com
STATIC_PATH=/<AWS_STATIC_PREFIX>
```

These variables can be overridden with config vars as expected

```
heroku config:set STATIC_SERVER=your.cdn.host
```

To return to the default value just unset the config vars

```
heroku config:unset STATIC_SERVER
```

# Slug Cleanup

Once the upload finishes, the source directory is deleted from the slug in its entirety.

Earlier versions carried an exclusion intended to keep `_index.html` in the slug, since the app
serves it from the dyno, and earlier revisions of this README described it as preserved. It never
actually was — the exclusion filtered a file list while the directory itself was removed
recursively — so it is documented here as deleted, which is what has always happened.

# Failure behavior

The upload is not allowed to break a deploy. Missing configuration and S3 upload errors are both logged and then exit `0`, which means the slug keeps its assets and no runtime variables get exported — check the build log rather than expecting a red build.

# Dynatrace naming

`bin/compile` copies `profile.d/10-dynatrace-naming.sh` into the slug's `.profile.d/`, so it runs at dyno boot before the Procfile command and exports:

```sh
DT_CLUSTER_ID=<blueprint>-<system>
DT_HOST_ID=<blueprint>-<system>-<dyno>-<first 8 hex of the dyno UUID>
```

`blueprint` and `system` come from `FS_BLUEPRINT_NAME` / `FS_SYSTEM_NAME`, falling back to the top-level `name` in the slug's `blueprint.yml` and `TARGET_ENV`. If neither resolves, the script logs to stderr and leaves any pre-existing values alone.

`DT_CLUSTER_ID` stands in for a host group, which Heroku's PaaS can't set. `@fs/startup` sets the same value on cluster workers, so the format is a cross-repo contract — read the comments in the script before changing it.
