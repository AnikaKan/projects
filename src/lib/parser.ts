import type { ResumeClaim } from "./types";
export function extractClaimsLocally(text:string):ResumeClaim[]{
 const lines=text.split(/\n|•/).map(x=>x.replace(/^[-*]\s*/,"").trim()).filter(x=>x.length>25);
 return lines.slice(0,12).map((bullet,i)=>({id:`claim-${Date.now()}-${i}`,company:"Add company / project",role:"Add role",bullet,status:"unevaluated",confidence:20,evidence:[{id:`ev-${i}`,label:"Original resume text",value:bullet,kind:"fact",confirmed:true}],unanswered:["What problem did this solve?","What did you personally own?",...( /\d/.test(bullet)?["How was this result measured?"]:[])],technicalFollowups:[],productFollowups:[]}));
}
