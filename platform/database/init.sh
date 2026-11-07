#!/bin/sh
set -eu

# The application owns its database, but cannot administer the PostgreSQL cluster.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  --set=app_password="$APP_DB_PASSWORD" <<'SQL'
CREATE ROLE retro LOGIN PASSWORD :'app_password';
CREATE DATABASE retro OWNER retro;
REVOKE ALL ON DATABASE retro FROM PUBLIC;
SQL
