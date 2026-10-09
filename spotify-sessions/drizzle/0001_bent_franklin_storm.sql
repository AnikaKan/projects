CREATE TABLE `shared_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`invite_code` text NOT NULL,
	`host_token_hash` text NOT NULL,
	`occasion` text NOT NULL,
	`duration_minutes` integer NOT NULL,
	`energy_style` text NOT NULL,
	`participant_target` integer NOT NULL,
	`base_participant_count` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shared_sessions_invite_code_unique` ON `shared_sessions` (`invite_code`);
--> statement-breakpoint
CREATE INDEX `shared_sessions_expires_idx` ON `shared_sessions` (`expires_at`);
--> statement-breakpoint
CREATE TABLE `shared_participants` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`identity_key` text NOT NULL,
	`display_name` text NOT NULL,
	`avatar_url` text,
	`profile_type` text NOT NULL,
	`status` text DEFAULT 'ready' NOT NULL,
	`taste_json` text NOT NULL,
	`joined_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `shared_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `shared_participants_session_idx` ON `shared_participants` (`session_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `shared_participants_session_identity_idx` ON `shared_participants` (`session_id`,`identity_key`);
