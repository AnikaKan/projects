import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../lib/spotify.ts", import.meta.url), "utf8");
const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const searchSource = await readFile(new URL("../components/SearchCombobox.tsx", import.meta.url), "utf8");
const catalogSource = await readFile(new URL("../lib/session.ts", import.meta.url), "utf8");
const simulatedSource = await readFile(new URL("../lib/simulated.ts", import.meta.url), "utf8");
const occasionRouteSource = await readFile(new URL("../app/api/occasion/profile/route.ts", import.meta.url), "utf8");
const inviteRouteSource = await readFile(new URL("../app/api/invites/route.ts", import.meta.url), "utf8");
const inviteDetailSource = await readFile(new URL("../app/api/invites/[code]/route.ts", import.meta.url), "utf8");
const inviteJoinSource = await readFile(new URL("../app/api/invites/[code]/join/route.ts", import.meta.url), "utf8");
const joinPageSource = await readFile(new URL("../app/join/[code]/page.tsx", import.meta.url), "utf8");
const spotifySetupSource = await readFile(new URL("../app/spotify-setup/page.tsx", import.meta.url), "utf8");
const artworkRouteSource = await readFile(new URL("../app/api/artwork/lookup/route.ts", import.meta.url), "utf8");
const catalogSearchSource = await readFile(new URL("../app/api/catalog/search/route.ts", import.meta.url), "utf8");
const inviteMigrationSource = await readFile(new URL("../drizzle/0001_bent_franklin_storm.sql", import.meta.url), "utf8");

test("Spotify authentication uses Authorization Code PKCE", () => {
  assert.match(source, /code_challenge_method:"S256"/);
  assert.match(source, /grant_type:"authorization_code"/);
  assert.doesNotMatch(source, /response_type:"token"/);
});

test("playlist writes use current item endpoints", () => {
  assert.match(source, /"\/me\/playlists"/);
  assert.match(source, /\/playlists\/\$\{playlist\.id\}\/items/);
  assert.doesNotMatch(source, /\/playlists\/\$\{playlist\.id\}\/tracks/);
});

test("generated playlists can be copied before Spotify is connected", () => {
  assert.match(pageSource, /playlistClipboardText/);
  assert.match(pageSource, /Copy playlist/);
  assert.match(pageSource, /Playlist copied with Spotify links/);
  assert.match(pageSource, /https:\/\/open\.spotify\.com\/search/);
  assert.match(pageSource, /Use this playlist in your account/);
});

test("rate limits and token refresh are handled", () => {
  assert.match(source, /response\.status===429/);
  assert.match(source, /grant_type:"refresh_token"/);
  assert.match(source, /response\.status===401/);
});

test("Spotify uses the canonical production callback and minimum scopes", () => {
  assert.match(source, /SPOTIFY_REDIRECT_URI=DEFAULT_REDIRECT/);
  assert.doesNotMatch(source, /NEXT_PUBLIC_SPOTIFY_REDIRECT_URI/);
  assert.match(pageSource, /PUBLISHED_APP.*spotify-sessions-app-anika/);
  assert.match(pageSource, /location\.assign\(`\$\{PUBLISHED_APP\}\/spotify-setup/);
  assert.doesNotMatch(source, /window\.location\.origin/);
  assert.doesNotMatch(source, /user-library-read/);
  assert.match(source, /user-read-recently-played/);
});

test("Spotify metadata includes ISRC and release date without inventing energy from popularity",()=>{
  assert.match(source,/external_ids\?\.isrc/);
  assert.match(source,/album\?\.release_date/);
  assert.doesNotMatch(pageSource,/popularity\|\|50/);
});

test("Spotify taste import tolerates artists without genre metadata", () => {
  assert.match(source, /a\.genres\|\|\[\]/);
  assert.match(source, /typeof genre==="string"/);
});

test("a saved Spotify connection does not skip the plan page", () => {
  assert.match(pageSource, /if\(code\)setStep\(1\)/);
});

test("artist search renders results without genre metadata", () => {
  assert.match(source, /genres:\(a\.genres\|\|\[\]\)\.filter\(Boolean\)/);
  assert.match(searchSource, /\(item\.genres\|\|\[\]\)\.slice/);
});

test("demo tracks are resolved to real Spotify URIs before playlist creation", () => {
  assert.doesNotMatch(catalogSource, /uri:`spotify:track:\$\{id\}`/);
  assert.match(source, /\^spotify:track:\[A-Za-z0-9\]\{22\}\$/);
  assert.match(source, /resolveTrackUri/);
  assert.match(source, /tracks\.slice\(i,i\+4\)/);
});

test("generated covers hydrate every track with a public fallback",()=>{
  assert.match(source,/async hydrateArtwork\(tracks:Track\[\]\)/);
  assert.match(source,/imageUrl:match\.imageUrl/);
  assert.match(pageSource,/hydratePlaylistArtwork\(next\)/);
  assert.match(pageSource,/fetch\('\/api\/artwork\/lookup'/);
  assert.match(artworkRouteSource,/grant_type=client_credentials/);
  assert.match(artworkRouteSource,/api\.spotify\.com\/v1\/search/);
  assert.match(artworkRouteSource,/source: "spotify"/);
  assert.match(artworkRouteSource,/itunes\.apple\.com\/search/);
  assert.match(artworkRouteSource,/artwork_cache/);
  assert.match(artworkRouteSource,/preview_url/);
  assert.doesNotMatch(pageSource,/track\.title\[0\]/);
});

test("generated tracks offer an on-demand Spotify preview",()=>{
  assert.match(source,/previewUrl:t\.preview_url\|\|undefined/);
  assert.match(pageSource,/className="track-art-preview"/);
  assert.match(pageSource,/<PreviewArtwork track=\{track\}/);
  assert.match(pageSource,/hydratePublicArtwork\(\[track\]\)/);
  assert.match(pageSource,/new Audio\(track\.previewUrl\)/);
  assert.match(pageSource,/player\.play\(\)/);
  assert.match(pageSource,/No audio snippet is available for this recording/);
  assert.match(pageSource,/player\.currentTime>=30/);
  assert.match(pageSource,/Play'\} preview of/);
  assert.doesNotMatch(pageSource,/Hear a preview/);
  assert.doesNotMatch(pageSource,/open\.spotify\.com\/embed\/track/);
  assert.match(pageSource,/setPreviewing/);
});

test("required tracks and excluded artists can be searched without connecting a user",()=>{
  assert.match(searchSource,/fetch\(`\/api\/catalog\/search\?kind=\$\{kind\}/);
  assert.match(catalogSearchSource,/grant_type=client_credentials/);
  assert.match(catalogSearchSource,/api\.spotify\.com\/v1\/search/);
  assert.match(catalogSearchSource,/kind !== "artist" && kind !== "track"/);
  assert.match(catalogSearchSource,/previewUrl: track\.preview_url/);
});

test("Spotify API errors expose the response message", () => {
  assert.match(source, /payload\.error\?\.message/);
  assert.match(source, /Spotify: \$\{detail\}/);
});

test("House is available in demo profile tastes and the genre editor", () => {
  assert.match(simulatedSource, /\["House","Electronic","Dance"\]/);
  assert.match(pageSource, /'Electronic','House','Dance'/);
});

test("invite QR code is large and keeps a scannable quiet zone", () => {
  assert.match(pageSource, /className="invite-qr"/);
  assert.match(pageSource, /size=\{240\}/);
  assert.match(pageSource, /marginSize=\{4\}/);
});

test("the demo requires every listener spot before playlist generation", () => {
  assert.match(pageSource, /const remainingSpots=Math\.max\(0,target-people\.length\),groupReady=people\.length>0&&remainingSpots===0/);
  assert.match(pageSource, /Complete your group to continue/);
  assert.match(pageSource, /disabled=\{busy\|\|!groupReady\}/);
  assert.match(pageSource, /if\(!groupReady\)\{setError\('Complete every listener spot before making the playlist/);
});

test("explicit songs are allowed by default", () => {
  assert.match(pageSource, /\[clean,setClean\]=useState\(false\)/);
  assert.match(pageSource, /explicitAllowed:!clean/);
});

test("the artist limit uses an open-ended numeric stepper",()=>{
  assert.match(pageSource,/className="number-stepper"/);
  assert.match(pageSource,/Decrease maximum songs per artist/);
  assert.match(pageSource,/Increase maximum songs per artist/);
  assert.match(pageSource,/type="number" min="1" step="1"/);
  assert.doesNotMatch(pageSource,/\[1,2,3,4,5\]\.map/);
});

test("saved sessions keep track details and open into a song list", () => {
  assert.match(pageSource, /tracks:next\.map\(compactTrack\)/);
  assert.match(pageSource, /className="history-card"/);
  assert.match(pageSource, /className="history-track-list"/);
  assert.match(pageSource, /openHistory/);
  assert.match(source, /tracksByIds/);
});

test("saved sessions use unique record IDs and repair legacy duplicates", () => {
  assert.match(pageSource, /crypto\.randomUUID\(\)/);
  assert.match(pageSource, /repairHistory/);
  assert.doesNotMatch(pageSource, /id:`session-\$\{nextSeed\}`/);
  assert.match(pageSource, /item\.id===currentSavedId/);
});

test("new playlist titles vary and renamed titles persist in history", () => {
  assert.match(pageSource, /crypto\.getRandomValues\(new Uint32Array\(1\)\)/);
  assert.match(pageSource, /history\.slice\(0,3\)\.some/);
  assert.match(pageSource, /name:renamed/);
  assert.match(pageSource, /sessionDate\(saved\.createdAt\)/);
});

test("new sessions use recent playlist history to avoid repetitive songs and positions",()=>{
  assert.match(pageSource,/recentSessions:history\.slice\(0,8\)\.map\(item=>item\.trackIds\)/);
});

test("legacy sessions with missing dates do not crash Your Sessions", () => {
  assert.match(pageSource, /Number\.isNaN\(date\.getTime\(\)\)/);
  assert.match(pageSource, /'Date unavailable'/);
});

test("custom occasions use a server-side OpenAI structured response with fallback",()=>{assert.match(pageSource,/className="custom-occasion"/);assert.match(pageSource,/\/api\/occasion\/profile/);assert.match(occasionRouteSource,/https:\/\/api\.openai\.com\/v1\/responses/);assert.match(occasionRouteSource,/type:"json_schema"/);assert.match(occasionRouteSource,/store:false/);assert.match(occasionRouteSource,/OPENAI_API_KEY/);assert.match(occasionRouteSource,/fallbackCustomProfile/)});
test("custom hard constraints are interpreted and shown before generation",()=>{assert.match(occasionRouteSource,/instrumentalOnly:\{type:"boolean"\}/);assert.match(occasionRouteSource,/cleanOnly:\{type:"boolean"\}/);assert.match(pageSource,/className="constraint-chips"/);assert.match(pageSource,/Instrumental only/);assert.match(pageSource,/trackMatchesProfile/);assert.match(catalogSource,/curatedInstrumentals/)});

test("the energy audit is hidden unless all four sections have values",()=>{
  assert.match(pageSource,/const showEnergyAudit=analysis\.sections\.length===4&&analysis\.sections\.every\(section=>section\.averageEnergy!==null\)/);
  assert.match(pageSource,/\{showEnergyAudit&&<section className=\{`energy-audit/);
});

test("a no-lyrics playlist requires explicit approval for a lyrical must-play",()=>{
  assert.match(pageSource,/Must-play lyrics conflict/);
  assert.match(pageSource,/Allow this one exception/);
  assert.match(pageSource,/if\(unresolvedLyricalConflicts\.length\)/);
  assert.match(pageSource,/instrumentalExceptions:lyricalExceptions/);
  assert.match(pageSource,/Instrumental with \$\{approvedLyricalExceptions\.length\} lyrical/);
});

test("invitations are persistent, expiring, and protected by a host token",()=>{
  assert.match(inviteRouteSource,/INSERT INTO shared_sessions/);
  assert.match(inviteRouteSource,/await hashToken\(hostToken\)/);
  assert.match(inviteRouteSource,/24\*60\*60\*1000/);
  assert.match(inviteDetailSource,/x-session-host-token/);
  assert.match(inviteDetailSource,/Only the host can close this invitation/);
  assert.match(inviteMigrationSource,/CREATE TABLE `shared_sessions`/);
  assert.match(inviteMigrationSource,/CREATE TABLE `shared_participants`/);
  assert.doesNotMatch(inviteMigrationSource,/CREATE TABLE `track_features`/);
});

test("friends can join with Spotify or a quick manual profile",()=>{
  assert.match(joinPageSource,/Join with Spotify/);
  assert.match(joinPageSource,/Continue without Spotify/);
  assert.match(joinPageSource,/Your Spotify password, access token, and full listening history are never shared/);
  assert.match(joinPageSource,/spotify\.connect\(false,`\/join\/\$\{code\}`,true\)/);
  assert.match(source,/tasteOnly\?\[\]:\["playlist-modify-private"\]/);
  assert.match(source,/consumeReturnTo\(\)/);
  assert.match(pageSource,/location\.replace\(returnTo\)/);
});

test("Spotify connection is clearly labeled as limited beta access",()=>{
  assert.match(pageSource,/Limited beta access · Allowlisted Spotify testers only/);
  assert.match(joinPageSource,/Limited beta access · Allowlisted testers only/);
  assert.match(spotifySetupSource,/Limited beta access/);
  assert.match(spotifySetupSource,/allowlisted beta testers/);
});

test("joined friends appear for the host and influence generation",()=>{
  assert.match(inviteJoinSource,/INSERT INTO shared_participants/);
  assert.match(inviteJoinSource,/This session is already full/);
  assert.match(pageSource,/setInterval\(\(\)=>void load\(\),4000\)/);
  assert.match(pageSource,/person\.tracks\.map\(track=>trackFromSpotify/);
  assert.match(pageSource,/setPeople\(list=>\[\.\.\.list\.filter\(person=>!person\.id\.startsWith\('invite-'\)\)/);
  assert.match(pageSource,/Close invite/);
});
