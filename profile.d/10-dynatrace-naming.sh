# Copied into the slug's .profile.d/ at compile time by bin/compile.
# Runs in bash at dyno boot, BEFORE the Procfile command, so anything exported here is
# inherited by the app process and read by the Dynatrace OneAgent at init.
#
# Gives the dyno a Dynatrace identity that matches our AWS/Beanstalk naming:
#   DT_CLUSTER_ID = {blueprint}-{system}                 process group (our host-group stand-in;
#                                                         Heroku PaaS can't set a real host group).
#                                                         Set here so the cluster MASTER joins it too —
#                                                         @fs/startup sets the same value on its workers.
#   DT_HOST_ID    = {blueprint}-{system}-{dyno}-{uuid8}   host name. The dyno + first 8 hex of the dyno
#                                                         UUID stand in for the IP octets AWS uses,
#                                                         e.g. myapp-prod-web.1-02e7ae57
#
# blueprint / system come from FS_BLUEPRINT_NAME / FS_SYSTEM_NAME, injected by heroku-tools at deploy.
# Until that's everywhere, we fall back to the in-slug blueprint.yml `name` and TARGET_ENV.

# --- resolve the {blueprint}-{system} base (prefer injected vars, fall back to in-slug data) ---
_blueprint="${FS_BLUEPRINT_NAME:-}"
if [ -z "$_blueprint" ] && [ -f blueprint.yml ]; then
  # top-level `name:` only (skips indented `- name:` build/system entries); strip any quotes
  _blueprint="$(sed -n 's/^name:[[:space:]]*//p' blueprint.yml | head -1 | tr -d "\"'")"
fi
_system="${FS_SYSTEM_NAME:-${TARGET_ENV:-}}"

if [ -n "$_blueprint" ] && [ -n "$_system" ]; then
  _cluster="${_blueprint}-${_system}"
  export DT_CLUSTER_ID="$_cluster"

  # os.hostname() on Heroku is the dyno UUID; the first block (8 hex) gives per-instance uniqueness.
  _uuid8="$(hostname)"
  _uuid8="${_uuid8%%-*}"
  export DT_HOST_ID="${_cluster}-${DYNO:-}-${_uuid8}"

  echo "[dynatrace-naming] DT_CLUSTER_ID=${DT_CLUSTER_ID} DT_HOST_ID=${DT_HOST_ID}"
  unset _cluster _uuid8
else
  echo "[dynatrace-naming] could not resolve blueprint/system (FS_BLUEPRINT_NAME/FS_SYSTEM_NAME or blueprint.yml) — leaving DT_CLUSTER_ID/DT_HOST_ID unset" >&2
fi
unset _blueprint _system
