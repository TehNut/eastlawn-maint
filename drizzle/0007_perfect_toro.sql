CREATE TABLE `log_service_job` (
	`log_id` text NOT NULL,
	`service_job_id` text NOT NULL,
	PRIMARY KEY(`log_id`, `service_job_id`),
	FOREIGN KEY (`log_id`) REFERENCES `maintenance_log`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`service_job_id`) REFERENCES `service_job`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `lsj_job_idx` ON `log_service_job` (`service_job_id`);--> statement-breakpoint
CREATE TABLE `meter_reading` (
	`id` text PRIMARY KEY NOT NULL,
	`equipment_id` text NOT NULL,
	`log_id` text,
	`value` real NOT NULL,
	`read_on` text NOT NULL,
	`author_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`equipment_id`) REFERENCES `equipment`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`log_id`) REFERENCES `maintenance_log`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `reading_equipment_idx` ON `meter_reading` (`equipment_id`,`read_on`);--> statement-breakpoint
CREATE UNIQUE INDEX `reading_log` ON `meter_reading` (`log_id`);--> statement-breakpoint
CREATE TABLE `service_job` (
	`id` text PRIMARY KEY NOT NULL,
	`equipment_id` text NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`meter_every` integer,
	`calendar_every` integer,
	`calendar_unit` text,
	`consumables` text DEFAULT '[]' NOT NULL,
	`notes` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`equipment_id`) REFERENCES `equipment`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `service_job_slug` ON `service_job` (`equipment_id`,`slug`);--> statement-breakpoint
ALTER TABLE `equipment` ADD `category` text DEFAULT 'vehicle' NOT NULL;--> statement-breakpoint
ALTER TABLE `equipment` ADD `meter_unit` text;--> statement-breakpoint
ALTER TABLE `maintenance_log` ADD `summary` text;--> statement-breakpoint
ALTER TABLE `maintenance_log` ADD `meter_reading` real;--> statement-breakpoint
ALTER TABLE `maintenance_log` ADD `performed_by` text;--> statement-breakpoint
ALTER TABLE `maintenance_log` ADD `parts_used` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `photo` ADD `caption` text;