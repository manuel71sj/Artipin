ALTER TABLE `files` ADD `view_token` text;
--> statement-breakpoint
CREATE UNIQUE INDEX `files_view_token_unique` ON `files` (`view_token`);
