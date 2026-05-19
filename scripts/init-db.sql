-- Creates separate schemas for service isolation
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS catalog;
CREATE SCHEMA IF NOT EXISTS "user";
CREATE SCHEMA IF NOT EXISTS billing;

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
