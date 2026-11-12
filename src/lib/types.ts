export type EvidenceStatus = "strong" | "partial" | "unsupported" | "unevaluated";
export type EvidenceKind = "fact" | "inference" | "missing" | "framing";
export type InterviewMode = "learn" | "practice" | "grill";
export type Category = "Resume Grilling" | "Behavioral" | "Product Design" | "Product Improvement" | "Root Cause Analysis" | "Product Success & Metrics" | "Product Strategy" | "Execution & Prioritization" | "Estimation" | "Technical Product Fluency";
export interface EvidenceItem { id:string; label:string; value:string; kind:EvidenceKind; confirmed:boolean }
export interface ResumeClaim { id:string; company:string; role:string; bullet:string; status:EvidenceStatus; confidence:number; evidence:EvidenceItem[]; unanswered:string[]; technicalFollowups:string[]; productFollowups:string[] }
export interface Story { id:string; title:string; competencies:string[]; situation:string; task:string; actions:string; result:string; metric:string; learning:string; followups:string[] }
export interface Answer { id:string; questionId:string; text:string; createdAt:string; feedback?:string; revisedText?:string }
export interface Question { id:string; prompt:string; purpose:string; category:Category; difficulty:"Foundation"|"Stretch"|"Final round" }
export interface DimensionScore { dimension:string; score:1|2|3|4|5; explanation:string; evidenceQuote:string }
export interface SessionReport { summary:string; strongestAnswer:string; weakestAnswer:string; strongestCompetency:string; improvementArea:string; scores:DimensionScore[]; repeatQuestions:string[]; nextSession:string }
export interface Session { id:string; category:Category; mode:InterviewMode; startedAt:string; answers:Answer[]; report?:SessionReport }
export interface CompanySource { title:string; url:string; publishedAt?:string; retrievedAt:string; factOrInterpretation:"fact"|"interpretation" }
export interface Workspace { id:string; name:string; candidateName:string; targetCompany:string; targetRole:string; stage:string; jobDescription:string; resumeText:string; projectNotes:string; claims:ResumeClaim[]; stories:Story[]; sessions:Session[]; savedAnswers:Answer[]; demo:boolean }
