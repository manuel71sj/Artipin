CREATE TABLE `file_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`file_id` integer NOT NULL,
	`no` integer NOT NULL,
	`storage_path` text NOT NULL,
	`size` integer NOT NULL,
	`title` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `file_versions_file_no_unique` ON `file_versions` (`file_id`,`no`);
--> statement-breakpoint
INSERT INTO `file_versions` (`file_id`, `no`, `storage_path`, `size`, `title`, `created_at`)
SELECT `id`, 1, `storage_path`, `size`, `title`, coalesce(`replaced_at`, `created_at`) FROM `files`;
