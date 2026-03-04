DROP TRIGGER IF EXISTS `tasks_fts_insert`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `tasks_fts_update`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `tasks_fts_delete`;
--> statement-breakpoint
DROP TABLE IF EXISTS `tasks_fts`;
--> statement-breakpoint
ALTER TABLE `tasks` ADD `tags` text DEFAULT '[]';
--> statement-breakpoint
UPDATE `tasks` SET `tags` = json_array(lower(`client`)) WHERE `client` IS NOT NULL AND `client` != '';
--> statement-breakpoint
ALTER TABLE `tasks` DROP COLUMN `client`;
