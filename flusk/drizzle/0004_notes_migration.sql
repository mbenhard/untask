CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL DEFAULT '',
	`status` text NOT NULL DEFAULT 'active',
	`created_at` text,
	`updated_at` text
);
--> statement-breakpoint
CREATE INDEX `notes_status_idx` ON `notes` (`status`);--> statement-breakpoint
CREATE INDEX `notes_created_at_idx` ON `notes` (`created_at`);--> statement-breakpoint
INSERT INTO `notes` (`id`, `title`, `content`, `status`, `created_at`, `updated_at`)
SELECT `id`, 'Migrated notes', `content`, 'active', COALESCE(`updated_at`, datetime('now')), `updated_at`
FROM `scratchpad`
WHERE `content` IS NOT NULL AND `content` != '' AND `content` != '[]';--> statement-breakpoint
DROP TABLE `scratchpad`;
