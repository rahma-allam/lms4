import { pgTable, serial, integer, text, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { studentsTable } from "./students";
import { tenantsTable } from "./tenants";

export const notificationTypeEnum = pgEnum("notification_type", [
  "payment_approved",
  "payment_rejected",
  "course_activated",
  "new_message",
  "quiz_graded",
  "certificate_ready",
  "general",
]);

export const notificationsTable = pgTable("notifications", {
  id:         serial("id").primaryKey(),
  tenantId:   integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  studentId:  integer("student_id").notNull().references(() => studentsTable.id, { onDelete: "cascade" }),
  type:       notificationTypeEnum("type").notNull().default("general"),
  title:      text("title").notNull(),
  titleAr:    text("title_ar"),
  body:       text("body"),
  bodyAr:     text("body_ar"),
  isRead:     boolean("is_read").notNull().default(false),
  createdAt:  timestamp("created_at").notNull().defaultNow(),
});

export type Notification      = typeof notificationsTable.$inferSelect;
export type NewNotification   = typeof notificationsTable.$inferInsert;