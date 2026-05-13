-- Migration: add Paymob gateway fields to settings
ALTER TABLE settings ADD COLUMN IF NOT EXISTS paymob_api_key text;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS paymob_integration_id text;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS paymob_iframe_id text;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS paymob_hmac_secret text;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS paymob_enabled text NOT NULL DEFAULT 'false';

-- thumbnail_url already exists in courses but ensure it's there
ALTER TABLE courses ADD COLUMN IF NOT EXISTS thumbnail_url text;
