CREATE TABLE `manual` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`sha256` text NOT NULL,
	`size` integer NOT NULL,
	`page_count` integer NOT NULL,
	`chunk_count` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `manual_sha256_unique` ON `manual` (`sha256`);--> statement-breakpoint
CREATE TABLE `manual_chunk` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`manual_id` text NOT NULL,
	`page` integer NOT NULL,
	`text` text NOT NULL,
	FOREIGN KEY (`manual_id`) REFERENCES `manual`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chunk_manual_idx` ON `manual_chunk` (`manual_id`);--> statement-breakpoint
ALTER TABLE `equipment` ADD `manual_id` text REFERENCES manual(id);