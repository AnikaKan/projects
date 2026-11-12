import { NextResponse } from "next/server";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { turnSchema } from "@/lib/schemas";
import { interviewerPrompts } from "@/lib/prompts";
import { evaluateLocally } from "@/lib/local-engine";
import type { Category,InterviewMode,ResumeClaim } from "@/lib/types";

export const runtime="nodejs";
const categoryPrompt=(c:Category)=>c==="Resume Grilling"?interviewerPrompts.resume:c==="Behavioral"?interviewerPrompts.behavioral:c.includes("Design")||c.includes("Improvement")?interviewerPrompts.productDesign:c==="Root Cause Analysis"?interviewerPrompts.rootCause:c.includes("Metrics")?interviewerPrompts.metrics:c==="Product Strategy"?interviewerPrompts.strategy:c.includes("Technical")?interviewerPrompts.technical:interviewerPrompts.base;
export async function POST(request:Request){
 try{const body=await request.json() as {answer?:string;category?:Category;mode?:InterviewMode;claims?:ResumeClaim[];history?:unknown[]};if(!body.answer||!body.category||!body.mode)return NextResponse.json({error:"Answer, category, and mode are required."},{status:400});const answer=body.answer.replace(/[<>]/g,"").slice(0,12000);const claims=(body.claims||[]).slice(0,30);
  if(!process.env.OPENAI_API_KEY||!process.env.OPENAI_MODEL)return NextResponse.json(evaluateLocally(answer,body.category,body.mode,claims));
  const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY});let last:unknown;
  for(let attempt=0;attempt<2;attempt++){try{const response=await client.responses.parse({model:process.env.OPENAI_MODEL,input:[{role:"system",content:`${interviewerPrompts.base}\n${categoryPrompt(body.category)}\n${interviewerPrompts.modes[body.mode]}`},{role:"user",content:JSON.stringify({category:body.category,mode:body.mode,confirmedEvidence:claims.map(c=>({id:c.id,bullet:c.bullet,status:c.status,evidence:c.evidence.filter(e=>e.confirmed)})),recentHistory:(body.history||[]).slice(-6),answer})}],text:{format:zodTextFormat(turnSchema,"interview_turn")}});if(response.output_parsed)return NextResponse.json(response.output_parsed)}catch(e){last=e}}
  console.error("Interview generation failed without transcript content",last instanceof Error?last.name:"unknown");return NextResponse.json({error:"The coach could not produce a valid response. Please retry."},{status:502});
 }catch{return NextResponse.json({error:"Invalid request."},{status:400})}
}
