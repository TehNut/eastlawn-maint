CREATE TABLE `manual_bookmark` (
	`id` text PRIMARY KEY NOT NULL,
	`manual_id` text NOT NULL,
	`equipment_id` text NOT NULL,
	`service_job_id` text,
	`page` integer NOT NULL,
	`label` text NOT NULL,
	`author_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`manual_id`) REFERENCES `manual`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`equipment_id`) REFERENCES `equipment`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`service_job_id`) REFERENCES `service_job`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`author_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `bookmark_equipment_idx` ON `manual_bookmark` (`equipment_id`);--> statement-breakpoint
CREATE TABLE `product_standard` (
	`id` text PRIMARY KEY NOT NULL,
	`product` text NOT NULL,
	`matches` text NOT NULL,
	`brand` text NOT NULL,
	`cross_format` integer DEFAULT false NOT NULL,
	`notes` text,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
-- Hand-edited: drizzle-kit leaves out ON DELETE for a foreign key added by ALTER TABLE.
ALTER TABLE `equipment` ADD `attached_to_id` text REFERENCES equipment(id) ON DELETE SET NULL;--> statement-breakpoint
-- Hand-added seed: the cemetery-maintenance skill's fleet product standards.
INSERT INTO `product_standard` (`id`, `product`, `matches`, `brand`, `cross_format`, `notes`, `sort_order`) VALUES
	('std-diesel-oil', 'Diesel engine oil', 'engine oil', 'Shell Rotella T5', 0, 'In the viscosity the machine''s manual lists. Overrides the manual''s brand and API category.', 0),
	('std-gas-oil', 'Gasoline engine oil', 'engine oil', 'Valvoline', 0, 'In the viscosity the machine''s manual lists. Overrides the manual''s brand and API category.', 1),
	('std-filters', 'Filters', 'filter', 'NAPA', 1, 'Never invent a NAPA number. Keep the manual''s number only as the cross.', 2);