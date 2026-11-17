ALTER TABLE `equipment` ADD `kind` text;--> statement-breakpoint
ALTER TABLE `equipment` ADD `year` integer;--> statement-breakpoint
ALTER TABLE `equipment` ADD `place` text;--> statement-breakpoint
ALTER TABLE `equipment` ADD `operator_name` text;--> statement-breakpoint
ALTER TABLE `equipment` ADD `import_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX `equipment_import_key_unique` ON `equipment` (`import_key`);--> statement-breakpoint
ALTER TABLE `maintenance_log` ADD `import_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX `maintenance_log_import_key_unique` ON `maintenance_log` (`import_key`);