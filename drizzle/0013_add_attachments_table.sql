CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL REFERENCES `tasks`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
	`stored_name` text NOT NULL,
	`original_name` text NOT NULL,
	`size` integer NOT NULL,
	`mime_type` text,
	`created_at` text DEFAULT (current_timestamp)
);
--> statement-breakpoint
CREATE INDEX `attachments_task_id_idx` ON `attachments` (`task_id`);
