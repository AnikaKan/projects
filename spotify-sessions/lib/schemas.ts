import{z}from"zod";
export const durationSchema=z.number().int().min(15).max(720);
export const inviteCodeSchema=z.string().regex(/^[a-f0-9]{24,32}$/);
export const spotifyArtistSchema=z.object({id:z.string(),name:z.string(),imageUrl:z.string().url().optional(),genres:z.array(z.string()).default([])});
export const spotifyTrackSchema=z.object({id:z.string(),uri:z.string().startsWith("spotify:track:"),title:z.string(),artist:z.string(),artistId:z.string().optional(),album:z.string(),imageUrl:z.string().url().optional(),duration:z.number().positive(),explicit:z.boolean(),popularity:z.number().optional()});
export const sessionDraftSchema=z.object({occasion:z.string().min(1),durationMinutes:durationSchema,participantTarget:z.number().int().min(1).max(12),energyStyle:z.enum(["easygoing","build","variety"]),familiarity:z.enum(["Mostly familiar","Balanced","More discovery"])});
export const sharedSessionCreateSchema=sessionDraftSchema.pick({occasion:true,durationMinutes:true,participantTarget:true,energyStyle:true}).extend({baseParticipantCount:z.number().int().min(0).max(12)});
export const inviteTrackSchema=spotifyTrackSchema.extend({isrc:z.string().optional(),releaseDate:z.string().optional(),familiarityScore:z.number().min(0).max(1).optional(),familiarityReason:z.enum(["recently-played","top-short","top-medium","top-long"]).optional()});
export const sharedParticipantSchema=z.object({identityKey:z.string().min(8).max(120),displayName:z.string().trim().min(1).max(80),avatarUrl:z.string().url().optional(),profileType:z.enum(["spotify","manual"]),genres:z.array(z.string().trim().min(1).max(60)).max(8),artists:z.array(spotifyArtistSchema).max(12),tracks:z.array(inviteTrackSchema).max(40)});
