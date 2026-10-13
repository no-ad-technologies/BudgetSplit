-- Runs once, when the local Postgres container is first created.
-- Integration tests use this separate database and refuse to touch any database without "test" in its name.
CREATE DATABASE budgetsplit_test OWNER budgetsplit;
