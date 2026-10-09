import{env}from"cloudflare:workers";

const schemaStatements=[
  "CREATE TABLE IF NOT EXISTS shared_sessions (id TEXT PRIMARY KEY, invite_code TEXT NOT NULL UNIQUE, host_token_hash TEXT NOT NULL, occasion TEXT NOT NULL, duration_minutes INTEGER NOT NULL, energy_style TEXT NOT NULL, participant_target INTEGER NOT NULL, base_participant_count INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'open', expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)",
  "CREATE INDEX IF NOT EXISTS shared_sessions_expires_idx ON shared_sessions(expires_at)",
  "CREATE TABLE IF NOT EXISTS shared_participants (id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES shared_sessions(id) ON DELETE CASCADE, identity_key TEXT NOT NULL, display_name TEXT NOT NULL, avatar_url TEXT, profile_type TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'ready', taste_json TEXT NOT NULL, joined_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)",
  "CREATE INDEX IF NOT EXISTS shared_participants_session_idx ON shared_participants(session_id)",
  "CREATE UNIQUE INDEX IF NOT EXISTS shared_participants_session_identity_idx ON shared_participants(session_id,identity_key)",
];

export function inviteDb(){const db=(env as unknown as{DB?:D1Database}).DB;if(!db)throw new Error("Shared session storage is unavailable.");return db}
export async function ensureInviteSchema(db:D1Database){await db.batch(schemaStatements.map(statement=>db.prepare(statement)))}
export function randomHex(byteLength:number){const bytes=crypto.getRandomValues(new Uint8Array(byteLength));return Array.from(bytes,byte=>byte.toString(16).padStart(2,"0")).join("")}
export async function hashToken(value:string){const bytes=new TextEncoder().encode(value),digest=await crypto.subtle.digest("SHA-256",bytes);return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,"0")).join("")}
export async function validHostToken(expectedHash:string,provided:string|null){if(!provided)return false;return(await hashToken(provided))===expectedHash}
