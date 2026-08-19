var fs = require("fs");
var path = require("path");
var { S3Client } = require("@aws-sdk/client-s3");
var { Upload } = require("@aws-sdk/lib-storage");
var async = require("async");
var { glob } = require("glob");
var mimeTypes = require("mime-types");

function getEnvVariable(name, fallback) {
  let envVar;
  try {
    envVar =
      process.env[name] ||
      fs.readFileSync(path.join(process.env.ENV_DIR, name), {
        encoding: "utf8",
      });
  } catch (e) {
    envVar = fallback;
  }
  return envVar;
}

try {
  var s3ClientConfig = {
    // v2's maxRetries counted retries after the first attempt; v3's maxAttempts
    // counts every attempt, so 10 retries becomes 11 attempts.
    maxAttempts: 11,
    region: getEnvVariable("AWS_DEFAULT_REGION", "us-east-1"),
  };

  var accessKeyId = getEnvVariable("S3_ACCESS_KEY");
  var secretAccessKey = getEnvVariable("S3_SECRET_ACCESS_KEY");
  // Only set explicit credentials when both are present. aws-sdk v2 fell through to
  // its default credential chain when config values were undefined; v3 throws on a
  // credentials object with undefined members, so leave it off entirely instead.
  if (accessKeyId && secretAccessKey) {
    s3ClientConfig.credentials = { accessKeyId, secretAccessKey };
  }

  // bucket where static assets are uploaded to
  // var AWS_STATIC_BUCKET_NAME = getEnvVariable("S3_BUCKET_NAME");

  // the source directory of static assets
  var AWS_STATIC_SOURCE_DIRECTORY = getEnvVariable(
    "AWS_STATIC_SOURCE_DIRECTORY",
    "build/static"
  );
  // the prefix assigned to the path, can be used to configure routing rules in CDNs
  var AWS_STATIC_PREFIX = getEnvVariable("AWS_STATIC_PREFIX", "static");
} catch (error) {
  console.error("Static Uploader is not configured for this deploy");
  console.error(error);
  console.error("Exiting without error");
  process.exit(0);
}

// the sha-1 or version supplied by heroku used to version builds in the path
var SOURCE_VERSION = (process.env.SOURCE_VERSION || "").slice(0, 7);
var BUILD_DIR = process.env.BUILD_DIR;

// location of public assets in the heroku build environment
var PUBLIC_ASSETS_SOURCE_DIRECTORY = path.join(
  BUILD_DIR,
  AWS_STATIC_SOURCE_DIRECTORY
);

// uploaded files are prefixed with this to enable versioning
// var STATIC_PATH = path.join(AWS_STATIC_PREFIX, new Date().toISOString().split('T')[0], SOURCE_VERSION);
var STATIC_PATH = AWS_STATIC_PREFIX;

// glob is promise-based as of v9 — no callback form to hand this to.
glob(PUBLIC_ASSETS_SOURCE_DIRECTORY + "/**/*.*").then(
  function onFiles(files) {
    if (!files) {
      return process.exit(1);
    }

    console.log("Files to Upload:", files.length);
    console.time("Upload Complete In");

    var yearInSeconds = 365 * 24 * 60 * 60;
    var yearFromNow = Date.now() + yearInSeconds * 1000;

    var s3 = new S3Client(s3ClientConfig);
    async.eachLimit(
      files,
      16,
      function(file, callback) {
        var stat = fs.statSync(file);
        if (!stat.isFile()) {
          console.log("Not a file", file);
          return callback(null);
        }

        var contentType = mimeTypes.lookup(path.extname(file)) || null;
        if (typeof contentType !== "string") {
          console.warn("Unknown ContentType:", contentType, file);
          contentType = "application/octet-stream";
        }
        const cdn2Key = path.join(
          "assets",
          path.join(STATIC_PATH, file.replace(PUBLIC_ASSETS_SOURCE_DIRECTORY, ""))
        );
        // console.log('uploading to s3', AWS_STATIC_BUCKET_NAME, key, file)
        // Upload (from lib-storage) is v3's replacement for v2's s3.upload — it's what
        // accepts a read stream as the Body without a known ContentLength.
        new Upload({
          client: s3,
          params: {
            ACL: "public-read",
            Key: cdn2Key,
            Body: fs.createReadStream(file),
            Bucket: "fs-cdn2-origin",
            Expires: new Date(yearFromNow),
            // HTTP cache directives take delta-seconds, not milliseconds, and the
            // shared-cache directive is spelled s-maxage.
            CacheControl:
              "public,max-age=" + yearInSeconds + ",s-maxage=" + yearInSeconds,
            ContentType: contentType,
          },
        })
          .done()
          // two-arg then, not .then().catch() — otherwise a throw from the
          // completion callback would come back around and call it a second time.
          .then(
            function onUploaded() {
              callback(null);
            },
            function onUploadFailed(error) {
              callback(error);
            }
          );
      },
      function onUploadComplete(error) {
        console.timeEnd("Upload Complete In");

        if (error) {
          console.error("Static Uploader failed to upload to S3");
          console.error(error);
          console.error("Exiting without error");
          process.exit(0);
        }

        var profiled = process.env.BUILD_DIR + "/.profile.d";
        fs.writeFileSync(
          path.join(profiled, "00-upload-static-files-to-s3-export-env.sh"),
          "echo EXPORTING STATIC ENV VARIABLES\n" +
          "export STATIC_SERVER=${STATIC_SERVER:-" +
          "fs-cdn2-origin" +
          ".s3.amazonaws.com" +
          "}\n" +
          "export STATIC_PATH=${STATIC_PATH:-/" +
          STATIC_PATH +
          "}\n",
          { encoding: "utf8" }
        );

        console.log(
          "Deleting uploaded assets from slug...",
          PUBLIC_ASSETS_SOURCE_DIRECTORY
        );
        // Was: del([PUBLIC_ASSETS_SOURCE_DIRECTORY, "!**/_index.html"], { force: true })
        // The "!**/_index.html" exclusion never actually spared _index.html: del matched
        // the directory itself and removed it recursively, so the negative pattern only
        // ever filtered del's own result list. fs.rm reproduces that exact behavior
        // without del's rimraf@3 -> glob@7 -> minimatch@3 dependency chain, which carries
        // a high-severity brace-expansion advisory (GHSA-mh99-v99m-4gvg) and can't be
        // overridden — brace-expansion@5's CJS build isn't callable the way minimatch@3
        // expects. If _index.html should genuinely survive, that's a behavior fix, not a
        // dependency choice: glob the tree and unlink everything but _index.html.
        fs.rm(
          PUBLIC_ASSETS_SOURCE_DIRECTORY,
          { recursive: true, force: true },
          function onDeleted(err) {
            if (err) {
              console.error("Failed to delete files", err);
              process.exit(0);
            }
            console.log("Deleted", PUBLIC_ASSETS_SOURCE_DIRECTORY);
            process.exit(0);
          }
        );
      }
    );
  },
  function onGlobError(error) {
    console.error("Static Uploader failed to find files to upload");
    console.error(error);
    process.exit(1);
  }
);
