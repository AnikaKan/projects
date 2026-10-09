import type{Metadata}from"next";
import{ensureInviteSchema,inviteDb}from"../../../db/invites";

export async function generateMetadata({params}:{params:Promise<{code:string}>}):Promise<Metadata>{let occasion="group";try{const{code}=await params,db=inviteDb();await ensureInviteSchema(db);const row=await db.prepare("SELECT occasion FROM shared_sessions WHERE invite_code=? LIMIT 1").bind(code).first<{occasion:string}>();if(row?.occasion)occasion=row.occasion.toLowerCase()}catch{/* Use generic invitation metadata if storage is unavailable. */}const title=`Join a ${occasion} Session`;const description="Connect your Spotify taste and join a shared playlist in a few taps.";return{title,description,openGraph:{title,description,images:[]},twitter:{card:"summary",title,description,images:[]}}}
export default function JoinLayout({children}:{children:React.ReactNode}){return children}
