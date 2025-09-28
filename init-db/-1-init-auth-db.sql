-- Initialize users database with proper privileges
-- This script runs when the PostgreSQL container starts for the first time

-- Connect to the auth_db database
\c auth_db;

-- Grant all privileges on the database to auth_admin
GRANT ALL PRIVILEGES ON DATABASE auth_db TO auth_admin;

-- Grant all privileges on all tables in public schema
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO auth_admin;

-- Grant all privileges on all sequences in public schema
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO auth_admin;

-- Grant all privileges on all functions in public schema
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO auth_admin;

-- Grant usage and create privileges on public schema
GRANT USAGE, CREATE ON SCHEMA public TO auth_admin;

-- Set default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO auth_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO auth_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO auth_admin;

-- Create extensions that might be useful
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Log the initialization
SELECT 'Auth database initialized successfully with user: auth_admin' AS status;
