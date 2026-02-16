ALTER TABLE `chat_messages` ADD COLUMN `chips` text;--> statement-breakpoint
CREATE TABLE `ai_journal_archive` (
	`id` text PRIMARY KEY NOT NULL,
	`content` text NOT NULL,
	`category` text NOT NULL,
	`created_at` text NOT NULL,
	`archived_at` text
);
--> statement-breakpoint
CREATE INDEX `ai_journal_archive_created_at_idx` ON `ai_journal_archive` (`created_at`);--> statement-breakpoint
CREATE INDEX `ai_journal_archive_archived_at_idx` ON `ai_journal_archive` (`archived_at`);
