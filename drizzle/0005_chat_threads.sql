CREATE TABLE `conversations` (
  `id` text PRIMARY KEY NOT NULL,
  `title` text NOT NULL DEFAULT 'New Thread',
  `is_auto_title` integer NOT NULL DEFAULT 1,
  `created_at` text,
  `updated_at` text,
  `archived_at` text
);
--> statement-breakpoint
CREATE INDEX `conversations_updated_at_idx` ON `conversations` (`updated_at`);
--> statement-breakpoint
CREATE INDEX `conversations_archived_at_idx` ON `conversations` (`archived_at`);
--> statement-breakpoint
ALTER TABLE `chat_messages` ADD COLUMN `conversation_id` text REFERENCES `conversations`(`id`) ON DELETE cascade;
--> statement-breakpoint
INSERT INTO `conversations` (`id`, `title`, `is_auto_title`, `created_at`, `updated_at`)
SELECT
  'legacy-migration-thread',
  'Previous Conversation',
  0,
  MIN(`created_at`),
  MAX(`created_at`)
FROM `chat_messages`
WHERE EXISTS (SELECT 1 FROM `chat_messages` LIMIT 1);
--> statement-breakpoint
UPDATE `chat_messages`
SET `conversation_id` = 'legacy-migration-thread'
WHERE `conversation_id` IS NULL
  AND EXISTS (SELECT 1 FROM `chat_messages` LIMIT 1);
--> statement-breakpoint
CREATE INDEX `chat_messages_conversation_id_idx`
  ON `chat_messages` (`conversation_id`);
--> statement-breakpoint
CREATE INDEX `chat_messages_conversation_id_created_at_idx`
  ON `chat_messages` (`conversation_id`, `created_at`);
