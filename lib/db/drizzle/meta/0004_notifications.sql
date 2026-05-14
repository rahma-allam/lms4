-- Migration: add notifications system
-- Run: psql $DATABASE_URL -f 0004_notifications.sql

DO $$ BEGIN
  CREATE TYPE notification_type AS ENUM (
    'payment_approved',
    'payment_rejected',
    'course_activated',
    'new_message',
    'quiz_graded',
    'certificate_ready',
    'general'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS notifications (
  id          SERIAL PRIMARY KEY,
  tenant_id   INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  student_id  INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  type        notification_type NOT NULL DEFAULT 'general',
  title       TEXT NOT NULL,
  title_ar    TEXT,
  body        TEXT,
  body_ar     TEXT,
  is_read     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_student ON notifications(student_id);
CREATE INDEX IF NOT EXISTS idx_notifications_tenant  ON notifications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread  ON notifications(student_id, is_read) WHERE is_read = false;