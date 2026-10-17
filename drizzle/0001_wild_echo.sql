PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_owners` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider` text NOT NULL,
	`provider_account_id` text NOT NULL,
	`email` text,
	`name` text NOT NULL
);
--> statement-breakpoint
DROP TABLE `owners`;--> statement-breakpoint
ALTER TABLE `__new_owners` RENAME TO `owners`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `owners_provider_account_unique` ON `owners` (`provider`,`provider_account_id`);