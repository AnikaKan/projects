import type{Participant}from"./session";
const profiles=[
  ["Maya",["Indie","Singer-songwriter"],["Lorde","Phoebe Bridgers"]],["Jordan",["Hip-hop","R&B"],["Kendrick Lamar","SZA"]],["Leo",["House","Electronic","Dance"],["Disclosure","Calvin Harris"]],["Priya",["Bollywood","Pop"],["A.R. Rahman","Dua Lipa"]],
  ["Sam",["Rock","Throwbacks"],["Fleetwood Mac","The Strokes"]],["Nia",["Afrobeats","R&B"],["Burna Boy","Tems"]],["Mateo",["Latin","Dance"],["Bad Bunny","KAROL G"]],["Sora",["K-pop","Pop"],["NewJeans","BTS"]],
  ["Avery",["Jazz","R&B"],["Masego","Frank Ocean"]],["Noah",["Alternative","Electronic"],["Tame Impala","M83"]],["Imani",["Pop","Musical theatre"],["Chappell Roan","Cynthia Erivo"]],["Elena",["Country","Singer-songwriter"],["Kacey Musgraves","Maggie Rogers"]]
]as const;
const colors=["#df8b64","#8977d2","#d0aa4e","#4fae9d","#6389c4","#c46f9c"];
export function createSimulatedParticipants(count:number,seed=Date.now()):Participant[]{const sorted=[...profiles].sort((a,b)=>((seed+a[0].charCodeAt(0)*17)%101)-((seed+b[0].charCodeAt(0)*17)%101));return sorted.slice(0,count).map((profile,index)=>({id:crypto.randomUUID(),name:profile[0],initials:profile[0].slice(0,2).toUpperCase(),genres:[...profile[1]],artists:[...profile[2]],representativeArtists:profile[2].map((name,i)=>({id:`sim-${index}-${i}`,name})),color:colors[(seed+index)%colors.length],active:true,profileType:"simulated",status:"ready",familiarity:["Mostly familiar","Balanced","More discovery"][Math.abs(seed+index)%3]as Participant["familiarity"]}))}
