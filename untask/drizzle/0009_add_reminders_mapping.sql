CREATE TABLE `reminders_mapping` (
  `task_id` TEXT PRIMARY KEY,
  `reminder_id` TEXT NOT NULL,
  `external_id` TEXT,
  `last_synced_at` TEXT,
  `created_at` TEXT DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE INDEX `idx_reminders_mapping_reminder_id` ON `reminders_mapping`(`reminder_id`);
--> statement-breakpoint
CREATE INDEX `idx_reminders_mapping_external_id` ON `reminders_mapping`(`external_id`);
