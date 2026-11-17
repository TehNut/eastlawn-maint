DROP INDEX `log_equipment_idx`;--> statement-breakpoint
CREATE INDEX `log_recent_idx` ON `maintenance_log` (`performed_on`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `log_equipment_idx` ON `maintenance_log` (`equipment_id`,`performed_on`,`created_at`,`id`);--> statement-breakpoint
ALTER TABLE `equipment` ADD `reading_value` real;--> statement-breakpoint
ALTER TABLE `equipment` ADD `reading_on` text;--> statement-breakpoint
ALTER TABLE `equipment` ADD `usage_rate` real;--> statement-breakpoint
ALTER TABLE `equipment` ADD `due_on` text;--> statement-breakpoint
ALTER TABLE `equipment` ADD `soon_on` text;--> statement-breakpoint
ALTER TABLE `equipment` ADD `unlogged_jobs` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `equipment` ADD `job_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `equipment_list_idx` ON `equipment` (("status" = 'retired'),`name`,`id`);--> statement-breakpoint
ALTER TABLE `service_job` ADD `last_done_on` text;--> statement-breakpoint
ALTER TABLE `service_job` ADD `last_done_meter` real;