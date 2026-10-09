# Sessions

A standalone, Spotify-inspired group playlist planner. Hosts choose an occasion and duration, build a group from Spotify, invited friends, or editable simulated listeners, then generate and refine a transparent shared playlist.

## Local setup

1. Copy `.env.example` to `.env.local` and add the public configuration values.
2. Run `pnpm install`.
3. Run `pnpm dev`.

Spotify connection always opens from the published Sessions app. The redirect is `https://spotify-sessions-app-anika.anixkas105.chatgpt.site/api/spotify/callback`.

## Spotify

Authentication uses Authorization Code with PKCE. No client secret is used in the browser. The application requests `user-read-private`, `user-top-read`, and `playlist-modify-private`. `playlist-modify-public` is requested only when the host chooses a public playlist.

In the Spotify Developer Dashboard, set Website to `https://spotify-sessions-app-anika.anixkas105.chatgpt.site/` and add the production redirect URI above exactly as written. In Development Mode, each tester must also be listed under User Management.

The typed service in `lib/spotify.ts` handles token refresh, current profile, top artists and tracks, artist and track search, 401, 403, and 429 responses, playlist creation through `POST /me/playlists`, and playlist item insertion through `POST /playlists/{id}/items` in batches of 100.

## Supabase

Run `supabase/migrations/202608310001_sessions.sql` in a Supabase project, enable anonymous authentication, then set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

The migration creates sessions, participants, approved taste summaries, revocable invitations, track rules, playlist versions, and ordered playlist tracks. Row Level Security separates host and participant permissions. Realtime is enabled for participant and playlist-version changes. Spotify tokens are never stored in public database rows.

Without Supabase variables, the app clearly uses local demo storage. Invitations in that mode work only in the same browser profile. Simulated listeners and device-local playlist history remain fully usable.

## MusiMap feature test

Set `MUSIMAP_CLIENT_ID` and `MUSIMAP_CLIENT_SECRET` as server-only runtime secrets. The app selects 20 representative tracks across short, medium, long-term, recently played, and current-release candidates. For each track, it checks D1 by Spotify track ID and ISRC before making an external request. It then tries MusiMap stored tagging by ISRC and falls back to the existing AcousticBrainz archive when no accessible MusiMap result exists.

`GET /api/features/provider-status` tests the OAuth client and reports its granted scopes, catalog context, and shared Atlas access without returning credentials. MusiMap stored ISRC lookup only covers tracks already analyzed in a catalog available to the organization. Live tagging requires an authorized audio file in the organization's MusiMap storage.

## Quality checks

Run `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `pnpm build`. The build also rejects em dash characters in site source files.
