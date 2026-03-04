ALTER TABLE `tasks` ADD `tags` text DEFAULT '[]';
--> statement-breakpoint
UPDATE `tasks` SET `tags` = json_array(lower(`client`)) WHERE `client` IS NOT NULL AND `client` != '';
--> statement-breakpoint
ALTER TABLE `tasks` DROP COLUMN `client`;
