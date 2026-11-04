#!/bin/sh
# Generates the two Metabase secrets and stores them on the Clever Cloud app
# linked under the alias demo-metabase (or $CLEVER_ALIAS), without ever printing
# them. The alias keeps it on the right app when several apps share one clone.
#   - METABASE_ADMIN_PASSWORD: the Metabase admin created by the first-run wizard
#   - METABASE_EMBEDDING_SECRET_KEY: signs the static-embedding tokens
# They are independent random values: an embed token (public, in iframe URLs)
# tells nothing about the admin password.
# Run it once, before the first deploy: a new admin password does not change
# the password of a Metabase that is already set up.
set -eu

command -v clever >/dev/null || { echo "clever-tools is required" >&2; exit 1; }
command -v openssl >/dev/null || { echo "openssl is required" >&2; exit 1; }

app_alias="${CLEVER_ALIAS:-demo-metabase}"

clever env set --alias "$app_alias" METABASE_ADMIN_PASSWORD "$(openssl rand -hex 24)" >/dev/null
clever env set --alias "$app_alias" METABASE_EMBEDDING_SECRET_KEY "$(openssl rand -hex 32)" >/dev/null
echo "METABASE_ADMIN_PASSWORD and METABASE_EMBEDDING_SECRET_KEY are set on $app_alias (values not shown)."
