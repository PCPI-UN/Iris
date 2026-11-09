#!/bin/sh
set -e

# This script initializes multiple databases and users in a single PostgreSQL instance
# It's idempotent - safe to run multiple times

echo "Starting PostgreSQL initialization script..."

# Function to create database and user if they don't exist
create_database_and_user() {
    db_name="$1"
    db_user="$2"
    db_password="$3"

    echo "Processing database: $db_name with user: $db_user"

    # Create user if it doesn't exist
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
        DO \$\$
        BEGIN
            IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '$db_user') THEN
                CREATE USER $db_user WITH PASSWORD '$db_password' CREATEDB;
                RAISE NOTICE 'User $db_user created with CREATEDB privilege';
            ELSE
                -- Grant CREATEDB to existing user if they don't have it
                ALTER USER $db_user CREATEDB;
                RAISE NOTICE 'User $db_user already exists, CREATEDB privilege granted';
            END IF;
        END
        \$\$;
EOSQL

    # Create database if it doesn't exist
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
        SELECT 'CREATE DATABASE $db_name OWNER $db_user'
        WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$db_name')\gexec
EOSQL

    # Grant privileges
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
        GRANT ALL PRIVILEGES ON DATABASE $db_name TO $db_user;
EOSQL

    echo "✓ Database '$db_name' ready with user '$db_user'"
}

# Create all service databases
create_database_and_user "auth_service" "auth_user" "${AUTH_DB_PASSWORD:-postgres}"
create_database_and_user "evaluation_service" "evaluation_user" "${EVALUATION_DB_PASSWORD:-postgres}"
create_database_and_user "event_service" "event_user" "${EVENT_DB_PASSWORD:-postgres}"
create_database_and_user "invitation_service" "invitation_user" "${INVITATION_DB_PASSWORD:-postgres}"
create_database_and_user "project_service" "project_user" "${PROJECT_DB_PASSWORD:-postgres}"
create_database_and_user "notification_service" "notification_user" "${NOTIFICATION_DB_PASSWORD:-postgres}"

echo "PostgreSQL initialization completed successfully!"
