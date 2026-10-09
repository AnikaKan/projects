CREATE TABLE `track_features` (
	`spotify_track_id` text PRIMARY KEY NOT NULL,
	`isrc` text,
	`musicbrainz_id` text,
	`source` text NOT NULL,
	`model_version` text,
	`features_json` text NOT NULL,
	`match_confidence` real DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `track_features_isrc_idx` ON `track_features` (`isrc`);
--> statement-breakpoint
CREATE TABLE `feature_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`spotify_track_id` text NOT NULL,
	`isrc` text,
	`dimension` text NOT NULL,
	`label` text NOT NULL,
	`numeric_value` real,
	`session_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `feature_feedback_track_idx` ON `feature_feedback` (`spotify_track_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `playlist_audits` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text,
	`requested_style` text NOT NULL,
	`result_status` text NOT NULL,
	`confidence` text NOT NULL,
	`measured_ratio` real NOT NULL,
	`unknown_duration_ratio` real NOT NULL,
	`sections_json` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `playlist_audits_session_idx` ON `playlist_audits` (`session_id`,`created_at`);
