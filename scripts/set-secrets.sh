#!/bin/sh
# Generates the two Metabase secrets and stores them on the Clever Cloud app
# linked to this folder, without ever printing them.
#   - METABASE_ADMIN_PASSWORD: the Metabase admin created by the first-run wizard
#   - METABASE_EMBEDDING_SECRET_KEY: signs the static-embedding tokens
# They are independent random values: an embed token (public, in iframe URLs)
# tells nothing about the admin password.
# Run it once, before the first deploy: a new admin password does not change
# the password of a Metabase that is already set up.
set -eu

command -v clever >/dev/null || { echo "clever-tools is required" >&2; exit 1; }
command -v openssl >/dev/null || { echo "openssl is required" >&2; exit 1; }

clever env set METABASE_ADMIN_PASSWORD "$(openssl rand -hex 24)" >/dev/null
clever env set METABASE_EMBEDDING_SECRET_KEY "$(openssl rand -hex 32)" >/dev/null
echo "METABASE_ADMIN_PASSWORD and METABASE_EMBEDDING_SECRET_KEY are set (values not shown)."
