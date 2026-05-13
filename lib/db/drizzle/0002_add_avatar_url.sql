-- Migration: add avatar_url to students table
ALTER TABLE students ADD COLUMN IF NOT EXISTS avatar_url text;
