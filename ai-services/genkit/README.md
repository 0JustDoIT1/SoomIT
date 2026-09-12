# SoomIT Genkit chatbot

The patient chatbot uses Gemini for response generation and tool orchestration.
For lung-cancer questions it retrieves guideline chunks from Django/pgvector and
grounds the Gemini answer in those chunks. MedGemma clinician opinions are a
separate Django workflow and are not part of this service.

The guideline lookup is exposed by an MCP server and consumed by an MCP client
inside the same `genkit-serve` process. Gemini receives the discovered
`soomit-medical-knowledge/search_medical_knowledge` tool. Calling it travels
through MCP and then reaches Django's service-token-protected
`/api/ai/knowledge/search/` endpoint. This needs no separate MCP container,
Cloud Run service, port, or environment variable.

The default Gemini model is `gemini-3.8-flash` through the Google AI Studio
Gemini Developer API.

## Local setup

1. Copy `.env.example` to `.env` and set the secrets.
2. Use the same random value for Django `AI_SERVICE_TOKEN` and Genkit
   `DJANGO_SERVICE_TOKEN`.
3. Run `npm install`, then `npm run dev`.
4. Run `npm test` to verify MCP discovery and invocation without calling Gemini.
5. Call `POST /chat` with JSON containing `message` and optional `history`.

The production `/chat` route uses Gemini function calling to select the MCP
guideline-search tool. `GET /health` reports the MCP tool after startup has
completed.
