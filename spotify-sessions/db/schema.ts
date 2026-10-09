import{index,integer,real,sqliteTable,text,uniqueIndex}from"drizzle-orm/sqlite-core";

export const trackFeatures=sqliteTable("track_features",{
  spotifyTrackId:text("spotify_track_id").primaryKey(),
  isrc:text("isrc"),musicbrainzId:text("musicbrainz_id"),source:text("source").notNull(),modelVersion:text("model_version"),featuresJson:text("features_json").notNull(),matchConfidence:real("match_confidence").notNull().default(0),createdAt:integer("created_at",{mode:"timestamp_ms"}).notNull(),updatedAt:integer("updated_at",{mode:"timestamp_ms"}).notNull(),
});

export const featureFeedback=sqliteTable("feature_feedback",{
  id:text("id").primaryKey(),spotifyTrackId:text("spotify_track_id").notNull(),isrc:text("isrc"),dimension:text("dimension").notNull(),label:text("label").notNull(),numericValue:real("numeric_value"),sessionId:text("session_id"),createdAt:integer("created_at",{mode:"timestamp_ms"}).notNull(),
});

export const playlistAudits=sqliteTable("playlist_audits",{
  id:text("id").primaryKey(),sessionId:text("session_id"),requestedStyle:text("requested_style").notNull(),resultStatus:text("result_status").notNull(),confidence:text("confidence").notNull(),measuredRatio:real("measured_ratio").notNull(),unknownDurationRatio:real("unknown_duration_ratio").notNull(),sectionsJson:text("sections_json").notNull(),createdAt:integer("created_at",{mode:"timestamp_ms"}).notNull(),
});

export const sharedSessions=sqliteTable("shared_sessions",{
  id:text("id").primaryKey(),inviteCode:text("invite_code").notNull().unique(),hostTokenHash:text("host_token_hash").notNull(),occasion:text("occasion").notNull(),durationMinutes:integer("duration_minutes").notNull(),energyStyle:text("energy_style").notNull(),participantTarget:integer("participant_target").notNull(),baseParticipantCount:integer("base_participant_count").notNull().default(0),status:text("status").notNull().default("open"),expiresAt:integer("expires_at",{mode:"timestamp_ms"}).notNull(),createdAt:integer("created_at",{mode:"timestamp_ms"}).notNull(),updatedAt:integer("updated_at",{mode:"timestamp_ms"}).notNull(),
},table=>[index("shared_sessions_expires_idx").on(table.expiresAt)]);

export const sharedParticipants=sqliteTable("shared_participants",{
  id:text("id").primaryKey(),sessionId:text("session_id").notNull().references(()=>sharedSessions.id,{onDelete:"cascade"}),identityKey:text("identity_key").notNull(),displayName:text("display_name").notNull(),avatarUrl:text("avatar_url"),profileType:text("profile_type").notNull(),status:text("status").notNull().default("ready"),tasteJson:text("taste_json").notNull(),joinedAt:integer("joined_at",{mode:"timestamp_ms"}).notNull(),updatedAt:integer("updated_at",{mode:"timestamp_ms"}).notNull(),
},table=>[index("shared_participants_session_idx").on(table.sessionId),uniqueIndex("shared_participants_session_identity_idx").on(table.sessionId,table.identityKey)]);
