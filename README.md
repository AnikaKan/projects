# Drilldown

Drilldown is a local-first, evidence-grounded preparation and mock-interview coach for product-management and resume-grilling interviews. It is designed as a real portfolio-ready MVP: resume evidence, story preparation, adaptive text interviews, grounded answer drafting, scorecards, and progress history work together in one responsive workspace.

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. The fictional demo works without an API key. Browser local storage (`drilldown-workspace`) is the MVP persistence layer.

## OpenAI configuration

1. Create an API key in your OpenAI project.
2. Put `OPENAI_API_KEY` in `.env.local`; never prefix it with `NEXT_PUBLIC_`.
3. Set `OPENAI_MODEL` to a structured-output-capable model available to that project.
4. Restart the development server.

The server route uses the official OpenAI JavaScript SDK, the Responses API, and Zod-validated structured output. No key reaches the browser. When either environment variable is absent, `/api/interview` uses the deterministic local engine so the entire demo remains functional.

## Architecture

- `src/components/drilldown-app.tsx`: responsive workspace UI and local interaction flows.
- `src/lib/types.ts`: strict domain types for evidence, claims, stories, interviews, answers, sources, reports, and workspaces.
- `src/lib/schemas.ts`: Zod schemas for model boundaries.
- `src/lib/prompts.ts`: interviewer roles, rubrics, and mode behavior, separate from UI.
- `src/lib/local-engine.ts`: deterministic offline adaptive follow-up engine.
- `src/app/api/interview`: server-only OpenAI integration with one retry and safe fallback behavior.
- `src/app/api/resume`: server-side PDF/DOCX validation and text extraction.
- `src/lib/seed.ts`: entirely fictional demonstration workspace.

Persistence is accessed by the client through a narrow workspace state boundary. A production version should replace local storage with an encrypted repository implementation and authenticated API without changing domain types.

## Real versus demonstration functionality

**Working:** PDF/DOCX validation and parsing, pasted resume extraction, editable evidence claims, confirmed-fact capture, grounded answer drafting, fictional demo, ten interview categories, distinct Learn/Practice/Grill behavior, adaptive local/OpenAI follow-ups, transcript-backed session report, saved answers, local history, progress, responsive/mobile layouts, retry/error states.

**Extension points / limitations:** local extraction is conservative and line-based; OpenAI extraction can be added against `extractionSchema`. Company Research is intentionally not populated with stale or fabricated content; add a server-side search provider that returns `CompanySource[]` with publication/retrieval dates. Voice is not included in this text-first MVP. Story editing, authentication, cloud sync, exhaustive deletion/audit controls, and production malware scanning remain follow-on work. The local report is intentionally lightweight; a full evaluator should validate a report schema against the complete transcript.

## Privacy and safety

- Data remains in this browser unless an AI request is configured.
- Full resumes and transcripts are not written to server logs.
- Uploads are restricted to PDF/DOCX and 5 MB, then processed in memory.
- Candidate claims are never enhanced automatically. Inferences remain unconfirmed.
- Do not upload confidential employer, customer, or company material.
- Reset the fictional demo from Workspace settings to delete the active local workspace.

## Quality commands

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

## Deployment

Deploy to any Node-compatible Next.js host. Configure `OPENAI_API_KEY` and `OPENAI_MODEL` as encrypted server environment variables. For multi-user use, add authentication, encrypted database persistence, retention controls, virus scanning, rate limiting, and explicit data-deletion endpoints before accepting sensitive documents.
