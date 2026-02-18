PRAGMA foreign_keys = OFF;
--> statement-breakpoint
INSERT INTO `task_events` (`id`, `task_id`, `action`, `before`, `after`, `source`, `created_at`)
SELECT
  lower(hex(randomblob(16))),
  child.`id`,
  'update',
  json_object(
    'id', child.`id`,
    'parentId', child.`parent_id`,
    'title', child.`title`,
    'body', child.`body`,
    'status', child.`status`,
    'priority', child.`priority`,
    'today', child.`today`,
    'client', child.`client`,
    'dueDate', child.`due_date`,
    'dueType', child.`due_type`,
    'effort', child.`effort`,
    'invoiceStatus', child.`invoice_status`,
    'valueAtRisk', child.`value_at_risk`,
    'lastClientTouchAt', child.`last_client_touch_at`,
    'order', child.`order`,
    'createdAt', child.`created_at`,
    'completedAt', child.`completed_at`
  ),
  json_object(
    'id', child.`id`,
    'parentId', NULL,
    'title', child.`title`,
    'body', child.`body`,
    'status', child.`status`,
    'priority', child.`priority`,
    'today', child.`today`,
    'client', child.`client`,
    'dueDate', child.`due_date`,
    'dueType', child.`due_type`,
    'effort', child.`effort`,
    'invoiceStatus', child.`invoice_status`,
    'valueAtRisk', child.`value_at_risk`,
    'lastClientTouchAt', child.`last_client_touch_at`,
    'order', child.`order`,
    'createdAt', child.`created_at`,
    'completedAt', child.`completed_at`
  ),
  'user',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM `tasks` child
LEFT JOIN `tasks` parent ON parent.`id` = child.`parent_id`
WHERE child.`parent_id` IS NOT NULL
  AND parent.`id` IS NULL;
--> statement-breakpoint
CREATE TABLE `__new_tasks` (
  `id` text PRIMARY KEY NOT NULL,
  `parent_id` text REFERENCES `tasks`(`id`) ON UPDATE cascade ON DELETE set null,
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
INSERT INTO `__new_tasks` (
  `id`,
  `parent_id`,
  `title`,
  `body`,
  `status`,
  `priority`,
  `today`,
  `client`,
  `due_date`,
  `due_type`,
  `effort`,
  `invoice_status`,
  `value_at_risk`,
  `last_client_touch_at`,
  `order`,
  `created_at`,
  `completed_at`
)
SELECT
  task.`id`,
  CASE
    WHEN task.`parent_id` IS NULL THEN NULL
    WHEN EXISTS (SELECT 1 FROM `tasks` parent WHERE parent.`id` = task.`parent_id`) THEN task.`parent_id`
    ELSE NULL
  END,
  task.`title`,
  task.`body`,
  task.`status`,
  task.`priority`,
  task.`today`,
  task.`client`,
  task.`due_date`,
  task.`due_type`,
  task.`effort`,
  task.`invoice_status`,
  task.`value_at_risk`,
  task.`last_client_touch_at`,
  task.`order`,
  task.`created_at`,
  task.`completed_at`
FROM `tasks` task;
--> statement-breakpoint
DROP TABLE `tasks`;
--> statement-breakpoint
ALTER TABLE `__new_tasks` RENAME TO `tasks`;
--> statement-breakpoint
CREATE INDEX `tasks_parent_id_idx` ON `tasks` (`parent_id`);
--> statement-breakpoint
CREATE INDEX `tasks_status_idx` ON `tasks` (`status`);
--> statement-breakpoint
CREATE INDEX `tasks_today_idx` ON `tasks` (`today`);
--> statement-breakpoint
CREATE INDEX `tasks_due_date_idx` ON `tasks` (`due_date`);
--> statement-breakpoint
CREATE TABLE `memory_events` (
  `id` text PRIMARY KEY NOT NULL,
  `layer` text NOT NULL,
  `before` text NOT NULL,
  `after` text NOT NULL,
  `source` text NOT NULL,
  `created_at` text
);
--> statement-breakpoint
CREATE INDEX `memory_events_layer_idx` ON `memory_events` (`layer`);
--> statement-breakpoint
CREATE INDEX `memory_events_created_at_idx` ON `memory_events` (`created_at`);
--> statement-breakpoint
PRAGMA foreign_keys = ON;
