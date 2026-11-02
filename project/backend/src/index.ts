import { eq } from 'drizzle-orm';
import { db } from './db';
import { transcripts } from './db/schema';
import { processTranscript } from './services/extractor';

const port = Number(Bun.env.PORT) || 3000;

const corsHeaders: Record<string, string> = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

function jsonResponse(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			'Content-Type': 'application/json',
			...corsHeaders
		}
	});
}

Bun.serve({
	port,
	async fetch(req) {
		const url = new URL(req.url);
		const { pathname } = url;

		// Handle CORS Preflight
		if (req.method === 'OPTIONS') {
			return new Response(null, {
				status: 204,
				headers: corsHeaders
			});
		}

		// POST /api/transcripts
		if (req.method === 'POST' && pathname === '/api/transcripts') {
			let body: { raw_text?: unknown; original_filename?: unknown };
			try {
				body = (await req.json()) as { raw_text?: unknown; original_filename?: unknown };
			} catch {
				return jsonResponse({ error: 'Invalid JSON body' }, 400);
			}

			if (!body || typeof body.raw_text !== 'string' || body.raw_text.trim() === '') {
				return jsonResponse({ error: 'raw_text is required and cannot be empty' }, 400);
			}

			try {
				const [newTranscript] = await db
					.insert(transcripts)
					.values({
						rawText: body.raw_text,
						originalFilename:
							typeof body.original_filename === 'string'
								? body.original_filename
								: null
					})
					.returning({
						id: transcripts.id,
						status: transcripts.status
					});

				return jsonResponse(newTranscript, 201);
			} catch (error) {
				console.error('Database error on POST /api/transcripts:', error);
				return jsonResponse({ error: 'Failed to create transcript' }, 500);
			}
		}

		// POST /api/transcripts/:id/process
		const processMatch = pathname.match(/^\/api\/transcripts\/([^/]+)\/process$/);
		if (req.method === 'POST' && processMatch) {
			const id = Number(processMatch[1]);
			if (isNaN(id) || !Number.isInteger(id) || id <= 0) {
				return jsonResponse({ error: 'Invalid transcript ID' }, 400);
			}

			try {
				const result = await processTranscript(id);
				return jsonResponse(result, 200);
			} catch (error: any) {
				if (error?.statusCode === 404 || error?.message?.includes('not found')) {
					return jsonResponse({ error: error.message }, 404);
				}
				console.error(`Error processing transcript ${id}:`, error);
				return jsonResponse({ error: error?.message || 'Processing failed' }, 500);
			}
		}

		// GET /api/transcripts/:id
		const transcriptMatch = pathname.match(/^\/api\/transcripts\/([^/]+)$/);
		if (req.method === 'GET' && transcriptMatch) {
			const id = Number(transcriptMatch[1]);
			if (isNaN(id) || !Number.isInteger(id) || id <= 0) {
				return jsonResponse({ error: 'Invalid transcript ID' }, 400);
			}

			try {
				const transcript = await db.query.transcripts.findFirst({
					where: eq(transcripts.id, id),
					with: {
						userStories: {
							with: {
								acceptanceCriteria: {
									orderBy: (acceptanceCriteria, { asc }) => [
										asc(acceptanceCriteria.sortOrder)
									]
								}
							}
						}
					}
				});

				if (!transcript) {
					return jsonResponse({ error: 'Transcript not found' }, 404);
				}

				return jsonResponse(transcript, 200);
			} catch (error) {
				console.error(`Database error on GET /api/transcripts/${id}:`, error);
				return jsonResponse({ error: 'Failed to fetch transcript' }, 500);
			}
		}

		return jsonResponse({ error: 'Not Found' }, 404);
	}
});

console.log(`Server running at http://localhost:${port}`);
