ALTER TABLE `tasks` ADD `deleted_at` text;
--> statement-breakpoint
CREATE INDEX `tasks_deleted_at_idx` ON `tasks` (`deleted_at`);
--> statement-breakpoint
ALTER TABLE `notes` ADD `deleted_at` text;
--> statement-breakpoint
CREATE INDEX `notes_deleted_at_idx` ON `notes` (`deleted_at`);
