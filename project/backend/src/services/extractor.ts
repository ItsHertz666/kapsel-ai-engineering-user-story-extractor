import { eq } from 'drizzle-orm';
import { db } from '../db';
import { transcripts, userStories, acceptanceCriteria } from '../db/schema';

export const SYSTEM_PROMPT = `Anda adalah seorang System Analyst profesional. Tugas Anda adalah mengekstrak kebutuhan fungsional (functional requirements) dari transkrip rapat berbahasa Indonesia menjadi User Story dan Acceptance Criteria.

Aturan yang WAJIB dipatuhi:
1. Input berupa transkrip percakapan rapat informal berbahasa Indonesia yang memuat obrolan santai, basa-basi, atau topik di luar sistem; abaikan semua hal yang bukan kebutuhan sistem perangkat lunak.
2. Ekstrak HANYA kebutuhan fungsional yang benar-benar disetujui, disebutkan, dan dibahas di dalam transkrip. Jangan pernah mengarang atau menambahkan fitur baru yang tidak dibicarakan.
3. Satu User Story HANYA untuk SATU peran (role). Jika dua peran terlibat dalam satu alur yang sama (misalnya karyawan mengajukan koreksi absen dan atasan menyetujui atau menolak koreksi), BUAT User Story terpisah untuk masing-masing peran tersebut.
4. Field 'role', 'feature', dan 'benefit' HANYA berisi frasa intinya saja, TANPA awalan "Sebagai", "Saya ingin", "Aku ingin", "Agar", atau "Supaya".
   - Contoh benar:
     - role: "HR manager" (BUKAN "Sebagai HR manager")
     - feature: "melihat rekap kehadiran karyawan per bulan" (BUKAN "Saya ingin melihat rekap kehadiran karyawan per bulan")
     - benefit: "menghitung gaji dengan mudah" (BUKAN "Agar dapat menghitung gaji dengan mudah")
   Serta harus memenuhi prinsip INVEST (Independent, Negotiable, Valuable, Estimable, Small, Testable).
5. Field 'out_of_scope' berisi daftar singkat fitur yang di transkrip dinyatakan ditunda, belum prioritas, atau di luar scope (misalnya notifikasi email ke karyawan, pembayaran gaji otomatis). Isi dan tentukan 'out_of_scope' LEBIH DULU sebelum menulis 'user_stories'.
6. TIDAK SATU PUN item di 'out_of_scope' boleh muncul sebagai User Story dan TIDAK BOLEH disebut sebagai langkah apa pun di dalam Acceptance Criteria (baik pada given, when, maupun then).
7. Acceptance Criteria hanya boleh memuat perilaku yang dibahas atau langsung tersirat dari transkrip. Jangan menambah detail antarmuka atau fitur yang tidak disebut (seperti nama tombol, isi formulir, pesan error dengan teks tertentu, halaman detail, nama field, maupun teknologi spesifik seperti GPS). Gunakan kalimat perilaku yang generik, misalnya "karyawan berada di lokasi kantor".
8. Setiap User Story harus memiliki 1 hingga 4 Acceptance Criteria dalam format Gherkin:
   - given: Kondisi awal (prasyarat)
   - when: Aksi yang dilakukan pengguna atau pemicu
   - then: Hasil atau perilaku sistem yang diharapkan
9. Jika benefit/manfaat tidak diucapkan secara eksplisit, simpulkan secara minimal berdasarkan konteks pembicaraan, namun dilarang keras menambahkan fitur baru.
10. Hasilkan HANYA JSON valid tanpa teks pembuka, penutup, maupun markdown code fences (\`\`\`json atau \`\`\`), dengan struktur persis seperti berikut:
{"out_of_scope":["fitur A yang ditunda atau di luar scope","fitur B"],"user_stories":[{"role":"...","feature":"...","benefit":"...","acceptance_criteria":[{"given":"...","when":"...","then":"..."}]}]}
11. Jika tidak ada fitur yang di luar scope, isi array kosong: "out_of_scope": []. Jika tidak ada kebutuhan fungsional di dalam transkrip, isi: "user_stories": [].`;

export interface ParsedAcceptanceCriteria {
	given: string;
	when: string;
	then: string;
}

export interface ParsedUserStory {
	role: string;
	feature: string;
	benefit: string;
	acceptance_criteria: ParsedAcceptanceCriteria[];
}

export interface ExtractorOutput {
	out_of_scope?: string[];
	user_stories: ParsedUserStory[];
}

export interface CallOpenRouterResult {
	content: string;
	model: string;
}

export async function callOpenRouter(transcriptText: string): Promise<CallOpenRouterResult> {
	const apiKey = Bun.env.OPENROUTER_API_KEY;
	const primaryModel = Bun.env.OPENROUTER_MODEL;
	const fallbackModel = Bun.env.OPENROUTER_FALLBACK_MODEL;

	if (!apiKey) {
		throw new Error('OPENROUTER_API_KEY is not defined in environment variables');
	}
	if (!primaryModel) {
		throw new Error('OPENROUTER_MODEL is not defined in environment variables');
	}

	const rawTemp = Bun.env.OPENROUTER_TEMPERATURE;
	let temperature = 0;
	if (rawTemp !== undefined && rawTemp.trim() !== '') {
		const parsedTemp = Number(rawTemp);
		if (!isNaN(parsedTemp) && parsedTemp >= 0 && parsedTemp <= 2) {
			temperature = parsedTemp;
		}
	}

	const url = 'https://openrouter.ai/api/v1/chat/completions';
	const messages = [
		{ role: 'system', content: SYSTEM_PROMPT },
		{ role: 'user', content: transcriptText }
	];

	const sendRequest = async (modelToUse: string) => {
		const basePayload = {
			model: modelToUse,
			messages,
			temperature,
			max_tokens: 4000
		};

		let response = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${apiKey}`
			},
			body: JSON.stringify({
				...basePayload,
				reasoning: { enabled: false },
				response_format: { type: 'json_object' }
			})
		});

		// If HTTP 400 (unsupported optional params), retry once without reasoning and response_format
		if (response.status === 400) {
			response = await fetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${apiKey}`
				},
				body: JSON.stringify(basePayload)
			});
		}

		return response;
	};

	const retryableStatuses = [429, 502, 503];
	const delays = [3000, 6000, 12000];

	// Initial attempt + up to 3 retries (total 4 attempts) on primaryModel
	let response = await sendRequest(primaryModel);

	for (let i = 0; i < delays.length && retryableStatuses.includes(response.status); i++) {
		const delay = delays[i]!;
		const attempt = i + 1; // 1st retry, 2nd retry, 3rd retry
		console.log(`[callOpenRouter] Received status ${response.status}. Retrying attempt ${attempt}/3 after ${delay / 1000}s...`);
		await new Promise((resolve) => setTimeout(resolve, delay));
		response = await sendRequest(primaryModel);
	}

	// If all retries failed and fallback model is configured, make one final attempt
	if (!response.ok && fallbackModel) {
		console.log(`[callOpenRouter] All attempts failed on ${primaryModel} (status ${response.status}). Trying fallback model: ${fallbackModel}...`);
		response = await sendRequest(fallbackModel);
	}

	if (!response.ok) {
		const errorBody = await response.text();
		throw new Error(`OpenRouter API error (Status ${response.status}): ${errorBody}`);
	}

	const data = (await response.json()) as any;
	const content = data?.choices?.[0]?.message?.content;
	const model = data?.model || 'unknown';

	console.log(`[extractor] answered by model: ${model}`);

	if (!content || typeof content !== 'string' || content.trim() === '') {
		throw new Error('OpenRouter API returned no content in choices[0].message.content');
	}

	return { content, model };
}

export function parseModelOutput(rawContent: string): ExtractorOutput {
	// Strip markdown code fences if present
	let cleaned = rawContent.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();

	const firstBrace = cleaned.indexOf('{');
	const lastBrace = cleaned.lastIndexOf('}');

	if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
		const snippet = rawContent.slice(0, 300);
		throw new Error(`Failed to locate JSON object in model output. First 300 chars: ${snippet}`);
	}

	cleaned = cleaned.substring(firstBrace, lastBrace + 1);

	let parsed: any;
	try {
		parsed = JSON.parse(cleaned);
	} catch (e) {
		const snippet = rawContent.slice(0, 300);
		throw new Error(`Failed to parse model output as JSON. First 300 chars: ${snippet}`);
	}

	if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.user_stories)) {
		const snippet = rawContent.slice(0, 300);
		throw new Error(`Invalid JSON format: missing user_stories array. First 300 chars: ${snippet}`);
	}

	const cleanPrefixes = (text: string): string => {
		return text
			.replace(/^(?:sebagai|saya ingin|aku ingin|agar|supaya)\s+/i, '')
			.trim();
	};

	const validUserStories: ParsedUserStory[] = [];

	for (const story of parsed.user_stories) {
		if (
			!story ||
			typeof story !== 'object' ||
			typeof story.role !== 'string' ||
			story.role.trim() === '' ||
			typeof story.feature !== 'string' ||
			story.feature.trim() === '' ||
			typeof story.benefit !== 'string' ||
			story.benefit.trim() === ''
		) {
			continue; // Drop invalid story
		}

		const cleanedRole = cleanPrefixes(story.role);
		const cleanedFeature = cleanPrefixes(story.feature);
		const cleanedBenefit = cleanPrefixes(story.benefit);

		if (!cleanedRole || !cleanedFeature || !cleanedBenefit) {
			continue;
		}

		const validCriteria: ParsedAcceptanceCriteria[] = [];
		if (Array.isArray(story.acceptance_criteria)) {
			for (const criteria of story.acceptance_criteria) {
				if (
					criteria &&
					typeof criteria === 'object' &&
					typeof criteria.given === 'string' &&
					criteria.given.trim() !== '' &&
					typeof criteria.when === 'string' &&
					criteria.when.trim() !== '' &&
					typeof criteria.then === 'string' &&
					criteria.then.trim() !== ''
				) {
					validCriteria.push({
						given: criteria.given.trim(),
						when: criteria.when.trim(),
						then: criteria.then.trim()
					});
				}
			}
		}

		validUserStories.push({
			role: cleanedRole,
			feature: cleanedFeature,
			benefit: cleanedBenefit,
			acceptance_criteria: validCriteria
		});
	}

	const outOfScope: string[] = [];
	if (Array.isArray(parsed.out_of_scope)) {
		for (const item of parsed.out_of_scope) {
			if (typeof item === 'string' && item.trim() !== '') {
				outOfScope.push(item.trim());
			}
		}
	}

	return {
		out_of_scope: outOfScope,
		user_stories: validUserStories
	};
}

export async function processTranscript(transcriptId: number) {
	const [transcript] = await db
		.select()
		.from(transcripts)
		.where(eq(transcripts.id, transcriptId));

	if (!transcript) {
		const err = new Error(`Transcript with ID ${transcriptId} not found`);
		(err as any).statusCode = 404;
		throw err;
	}

	try {
		await db
			.update(transcripts)
			.set({
				status: 'processing',
				errorMessage: null,
				updatedAt: new Date()
			})
			.where(eq(transcripts.id, transcriptId));

		const maxAttempts = 3;
		let parsed: ExtractorOutput | null = null;
		let answeredModels: string[] = [];
		let lastRawContent = '';
		let lastParseError: any = null;

		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			console.log(`[processTranscript] Attempt ${attempt}/${maxAttempts} for transcript ${transcriptId}...`);
			const { content, model } = await callOpenRouter(transcript.rawText);
			answeredModels.push(model);
			lastRawContent = content;

			console.log(`[processTranscript] Attempt ${attempt} answered by model: ${model}`);

			try {
				parsed = parseModelOutput(content);
				break; // Successfully parsed!
			} catch (parseErr: any) {
				lastParseError = parseErr;
				console.warn(
					`[processTranscript] Attempt ${attempt}/${maxAttempts} failed to parse output from model '${model}': ${parseErr?.message || parseErr}`
				);
				if (attempt < maxAttempts) {
					console.log(`[processTranscript] Retrying callOpenRouter + parseModelOutput...`);
				}
			}
		}

		if (!parsed) {
			const modelsStr = answeredModels.join(', ');
			const snippet = lastRawContent.slice(0, 300);
			const detailedMsg = `Failed to parse model output after ${maxAttempts} attempts. Models answered: [${modelsStr}]. Last error: ${lastParseError?.message || lastParseError}. First 300 chars of output: ${snippet}`;
			throw new Error(detailedMsg);
		}

		await db.transaction(async (tx) => {
			await tx
				.delete(userStories)
				.where(eq(userStories.transcriptId, transcriptId));

			for (const story of parsed.user_stories) {
				const [insertedStory] = await tx
					.insert(userStories)
					.values({
						transcriptId,
						role: story.role,
						feature: story.feature,
						benefit: story.benefit,
						rawAiOutput: {
							...story,
							out_of_scope: parsed.out_of_scope || []
						},
						status: 'draft'
					})
					.returning({ id: userStories.id });

				if (insertedStory && story.acceptance_criteria.length > 0) {
					await tx.insert(acceptanceCriteria).values(
						story.acceptance_criteria.map((ac, index) => ({
							userStoryId: insertedStory.id,
							givenText: ac.given,
							whenText: ac.when,
							thenText: ac.then,
							sortOrder: index + 1
						}))
					);
				}
			}

			await tx
				.update(transcripts)
				.set({
					status: 'completed',
					errorMessage: null,
					updatedAt: new Date()
				})
				.where(eq(transcripts.id, transcriptId));
		});

		return {
			id: transcriptId,
			status: 'completed' as const,
			user_stories_count: parsed.user_stories.length
		};
	} catch (error: any) {
		const message = error?.message || String(error);
		try {
			await db
				.update(transcripts)
				.set({
					status: 'failed',
					errorMessage: message,
					updatedAt: new Date()
				})
				.where(eq(transcripts.id, transcriptId));
		} catch (dbErr) {
			console.error(`Failed to update transcript status to 'failed':`, dbErr);
		}

		throw error;
	}
}
