CREATE TABLE `ai_journal` (
	`id` text PRIMARY KEY NOT NULL,
	`content` text NOT NULL,
	`category` text NOT NULL,
	`created_at` text
);
--> statement-breakpoint
CREATE INDEX `ai_journal_created_at_idx` ON `ai_journal` (`created_at`);--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`tool_calls` text,
	`created_at` text
);
--> statement-breakpoint
CREATE INDEX `chat_messages_created_at_idx` ON `chat_messages` (`created_at`);--> statement-breakpoint
CREATE TABLE `scratchpad` (
	`id` text PRIMARY KEY NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`updated_at` text
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `task_events` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`action` text NOT NULL,
	`before` text,
	`after` text,
	`source` text NOT NULL,
	`created_at` text
);
--> statement-breakpoint
CREATE INDEX `task_events_task_id_idx` ON `task_events` (`task_id`);--> statement-breakpoint
CREATE INDEX `task_events_created_at_idx` ON `task_events` (`created_at`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_id` text,
	`title` text NOT NULL,
	`body` text,
	`status` text DEFAULT 'inbox',
	`priority` text DEFAULT 'none',
	`today` integer DEFAULT false,
	`client` text,
	`due_date` text,
	`due_type` text,
	`effort` text DEFAULT 'unknown',
	`invoice_status` text,
	`value_at_risk` real,
	`last_client_touch_at` text,
	`order` integer DEFAULT 0,
	`created_at` text,
	`completed_at` text
);
--> statement-breakpoint
CREATE INDEX `tasks_parent_id_idx` ON `tasks` (`parent_id`);--> statement-breakpoint
CREATE INDEX `tasks_status_idx` ON `tasks` (`status`);--> statement-breakpoint
CREATE INDEX `tasks_today_idx` ON `tasks` (`today`);--> statement-breakpoint
CREATE INDEX `tasks_due_date_idx` ON `tasks` (`due_date`);