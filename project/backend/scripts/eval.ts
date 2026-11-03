import { asc, eq } from 'drizzle-orm';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { db } from '../src/db';
import { acceptanceCriteria, transcripts, userStories, extractionRuns, extractionAttempts } from '../src/db/schema';
import { processTranscript } from '../src/services/extractor';

interface CommandLineArgs {
	transcriptId: number;
	runs: number;
	label: string;
	temperature?: number;
	keywords: string[];
	details: string[];
}

function parseArgs(): CommandLineArgs {
	const rawArgs = process.argv.slice(2);

	if (rawArgs.length === 0 || rawArgs[0] === '--help' || rawArgs[0] === '-h') {
		console.log(
			'Penggunaan: bun run scripts/eval.ts <transcriptId> [jumlahRun] [--label "nama"] [--temperature <angka>] [--keywords "a,b,c"] [--details "x,y,z"]'
		);
		process.exit(1);
	}

	const transcriptIdStr = rawArgs[0];
	const transcriptId = Number(transcriptIdStr);
	if (isNaN(transcriptId) || !Number.isInteger(transcriptId) || transcriptId <= 0) {
		console.error(`Error: transcriptId harus berupa angka bulat positif, menerima: "${transcriptIdStr}"`);
		process.exit(1);
	}

	let runs = 5;
	let label = 'default';
	let temperature: number | undefined = undefined;
	let keywords: string[] = [];
	let details: string[] = [];

	let argIndex = 1;

	// Check if second argument is runs (numeric)
	if (argIndex < rawArgs.length && !rawArgs[argIndex]!.startsWith('--')) {
		const runsNum = Number(rawArgs[argIndex]);
		if (isNaN(runsNum) || !Number.isInteger(runsNum) || runsNum <= 0) {
			console.error(`Error: jumlahRun harus berupa angka bulat positif, menerima: "${rawArgs[argIndex]}"`);
			process.exit(1);
		}
		runs = runsNum;
		argIndex++;
	}

	if (runs > 20) {
		console.error(`Error: jumlahRun maksimal adalah 20, menerima: ${runs}`);
		process.exit(1);
	}

	while (argIndex < rawArgs.length) {
		const arg = rawArgs[argIndex]!;
		if (arg === '--label') {
			argIndex++;
			if (argIndex >= rawArgs.length || rawArgs[argIndex]!.startsWith('--')) {
				console.error('Error: Flag --label memerlukan argumen teks');
				process.exit(1);
			}
			label = rawArgs[argIndex]!;
			argIndex++;
		} else if (arg === '--temperature') {
			argIndex++;
			if (argIndex >= rawArgs.length || rawArgs[argIndex]!.startsWith('--')) {
				console.error('Error: Flag --temperature memerlukan argumen angka (0 - 2)');
				process.exit(1);
			}
			const tempNum = Number(rawArgs[argIndex]);
			if (isNaN(tempNum) || tempNum < 0 || tempNum > 2) {
				console.error(`Error: Flag --temperature harus berupa angka antara 0 dan 2, menerima: "${rawArgs[argIndex]}"`);
				process.exit(1);
			}
			temperature = tempNum;
			argIndex++;
		} else if (arg === '--keywords') {
			argIndex++;
			if (argIndex >= rawArgs.length || rawArgs[argIndex]!.startsWith('--')) {
				console.error('Error: Flag --keywords memerlukan nilai dipisah koma');
				process.exit(1);
			}
			keywords = rawArgs[argIndex]!
				.split(',')
				.map((s) => s.trim().toLowerCase())
				.filter(Boolean);
			argIndex++;
		} else if (arg === '--details') {
			argIndex++;
			if (argIndex >= rawArgs.length || rawArgs[argIndex]!.startsWith('--')) {
				console.error('Error: Flag --details memerlukan nilai dipisah koma');
				process.exit(1);
			}
			details = rawArgs[argIndex]!
				.split(',')
				.map((s) => s.trim().toLowerCase())
				.filter(Boolean);
			argIndex++;
		} else {
			console.error(`Error: Argumen tidak dikenali: "${arg}"`);
			process.exit(1);
		}
	}

	return {
		transcriptId,
		runs,
		label,
		temperature,
		keywords,
		details
	};
}

interface RunResult {
	runIndex: number;
	newTranscriptId: number;
	extractionRunId: number | null;
	status: 'completed' | 'failed';
	durationMs: number;
	model: string;
	temperature: number;
	errorMessage: string | null;
	storyCount: number;
	acCountPerStory: number[];
	zeroAcStoryCount: number;
	hasTemplatePrefix: boolean;
	templatePrefixStoriesCount: number;
	scopeLeakWords: string[];
	scopeLeakLocations: string[];
	hasScopeLeak: boolean;
	detailsDetectedWords: string[];
	detailsCountAC: number;
	roleFeatureList: string[];
	outOfScopeList: string[];
	promptTokens: number | null;
	completionTokens: number | null;
	totalTokens: number | null;
	estimatedCostUsd: number | null;
	attemptsCount: number;
	stories: Array<{
		id: number;
		role: string;
		feature: string;
		benefit: string;
		rawAiOutput: any;
		acceptanceCriteria: Array<{
			id: number;
			givenText: string;
			whenText: string;
			thenText: string;
			sortOrder: number | null;
		}>;
	}>;
}

const TEMPLATE_PREFIX_REGEX = /^(?:sebagai|saya ingin|aku ingin|agar|supaya)\s+/i;

function escapeCsvField(val: any): string {
	if (val === null || val === undefined) return '';
	const str = String(val);
	if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
		return `"${str.replace(/"/g, '""')}"`;
	}
	return str;
}

async function main() {
	const args = parseArgs();
	const modelName = Bun.env.OPENROUTER_MODEL || 'unknown';

	// Save original temperature environment variable to restore at the end
	const originalEnvTemperature = Bun.env.OPENROUTER_TEMPERATURE;
	if (args.temperature !== undefined) {
		Bun.env.OPENROUTER_TEMPERATURE = String(args.temperature);
	}

	// Determine active temperature (from env or default 0)
	let activeTemperature = 0;
	const currentTempStr = Bun.env.OPENROUTER_TEMPERATURE;
	if (currentTempStr !== undefined && currentTempStr.trim() !== '') {
		const parsed = Number(currentTempStr);
		if (!isNaN(parsed) && parsed >= 0 && parsed <= 2) {
			activeTemperature = parsed;
		}
	}

	console.log(`\n======================================================`);
	console.log(`Memulai evaluasi ekstraksi transkrip:`);
	console.log(`- Transcript Asli ID : ${args.transcriptId}`);
	console.log(`- Jumlah Run         : ${args.runs}`);
	console.log(`- Label              : ${args.label}`);
	console.log(`- Model              : ${modelName}`);
	console.log(`- Temperature        : ${activeTemperature}`);
	console.log(`- Keywords (Scope)   : ${args.keywords.length > 0 ? args.keywords.join(', ') : '(tidak ada)'}`);
	console.log(`- Details (UI/Tech)  : ${args.details.length > 0 ? args.details.join(', ') : '(tidak ada)'}`);
	console.log(`======================================================\n`);

	const [orig] = await db
		.select()
		.from(transcripts)
		.where(eq(transcripts.id, args.transcriptId));

	if (!orig) {
		console.error(`Error: Transcript dengan ID ${args.transcriptId} tidak ditemukan di database.`);
		process.exit(1);
	}

	const results: RunResult[] = [];

	for (let k = 1; k <= args.runs; k++) {
		if (k > 1) {
			console.log(`Jeda 2 detik sebelum Run ${k}...`);
			await new Promise((resolve) => setTimeout(resolve, 2000));
		}

		const runFilename = `eval-${args.transcriptId}-${args.label}-run${k}`;
		console.log(`--> [Run ${k}/${args.runs}] Membuat transcript evaluasi (${runFilename})...`);

		const [inserted] = await db
			.insert(transcripts)
			.values({
				originalFilename: runFilename,
				rawText: orig.rawText,
				status: 'queued'
			})
			.returning({ id: transcripts.id });

		if (!inserted) {
			console.error(`Gagal membuat transcript evaluasi untuk Run ${k}`);
			continue;
		}

		const newId = inserted.id;
		const startTime = Date.now();
		let status: 'completed' | 'failed' = 'failed';
		let durationMs = 0;
		let errorMessage: string | null = null;
		let fetchedStoriesWithAc: RunResult['stories'] = [];
		let extractionRunId: number | null = null;
		let promptTokens: number | null = null;
		let completionTokens: number | null = null;
		let totalTokens: number | null = null;
		let estimatedCostUsd: number | null = null;
		let attemptsCount = 0;

		try {
			console.log(`    Memproses transcript ID: ${newId}...`);
			const processRes = await processTranscript(newId);
			durationMs = Date.now() - startTime;
			status = 'completed';
			extractionRunId = processRes.run_id;
			promptTokens = processRes.total_prompt_tokens;
			completionTokens = processRes.total_completion_tokens;
			totalTokens = processRes.total_tokens;
			estimatedCostUsd = processRes.estimated_cost_usd;
			attemptsCount = processRes.attempts_count;
			console.log(`    Selesai dalam ${durationMs}ms (Tokens: ${totalTokens ?? 'N/A'}, Cost: $${estimatedCostUsd ?? 'N/A'}).`);

			// Fetch user stories and AC
			const dbStories = await db
				.select()
				.from(userStories)
				.where(eq(userStories.transcriptId, newId));

			for (const s of dbStories) {
				const acs = await db
					.select()
					.from(acceptanceCriteria)
					.where(eq(acceptanceCriteria.userStoryId, s.id))
					.orderBy(asc(acceptanceCriteria.sortOrder));

				fetchedStoriesWithAc.push({
					id: s.id,
					role: s.role,
					feature: s.feature,
					benefit: s.benefit,
					rawAiOutput: s.rawAiOutput,
					acceptanceCriteria: acs.map((ac) => ({
						id: ac.id,
						givenText: ac.givenText,
						whenText: ac.whenText,
						thenText: ac.thenText,
						sortOrder: ac.sortOrder
					}))
				});
			}
		} catch (err: any) {
			durationMs = Date.now() - startTime;
			status = 'failed';
			errorMessage = err?.message || String(err);
			console.error(`    Run ${k} GAGAL (${durationMs}ms): ${errorMessage}`);
		}

		// Calculate metrics for this run
		const storyCount = fetchedStoriesWithAc.length;
		const acCountPerStory = fetchedStoriesWithAc.map((s) => s.acceptanceCriteria.length);
		const zeroAcStoryCount = acCountPerStory.filter((cnt) => cnt === 0).length;

		let templatePrefixStoriesCount = 0;
		for (const s of fetchedStoriesWithAc) {
			if (
				TEMPLATE_PREFIX_REGEX.test(s.role) ||
				TEMPLATE_PREFIX_REGEX.test(s.feature) ||
				TEMPLATE_PREFIX_REGEX.test(s.benefit)
			) {
				templatePrefixStoriesCount++;
			}
		}
		const hasTemplatePrefix = templatePrefixStoriesCount > 0;

		const detectedLeakWords = new Set<string>();
		const leakLocations: string[] = [];

		for (let sIdx = 0; sIdx < fetchedStoriesWithAc.length; sIdx++) {
			const s = fetchedStoriesWithAc[sIdx]!;
			const storyNum = sIdx + 1;

			const fieldsToCheck: Array<[string, string]> = [
				['role', s.role],
				['feature', s.feature],
				['benefit', s.benefit]
			];

			for (const [fieldName, val] of fieldsToCheck) {
				const lower = val.toLowerCase();
				for (const kw of args.keywords) {
					if (lower.includes(kw)) {
						detectedLeakWords.add(kw);
						leakLocations.push(`Story ${storyNum} (${fieldName}): "${kw}"`);
					}
				}
			}

			for (let aIdx = 0; aIdx < s.acceptanceCriteria.length; aIdx++) {
				const ac = s.acceptanceCriteria[aIdx]!;
				const acNum = aIdx + 1;
				const acFields: Array<[string, string]> = [
					['given', ac.givenText],
					['when', ac.whenText],
					['then', ac.thenText]
				];
				for (const [stepName, val] of acFields) {
					const lower = val.toLowerCase();
					for (const kw of args.keywords) {
						if (lower.includes(kw)) {
							detectedLeakWords.add(kw);
							leakLocations.push(`Story ${storyNum} AC ${acNum} (${stepName}): "${kw}"`);
						}
					}
				}
			}
		}

		const scopeLeakWords = Array.from(detectedLeakWords);
		const hasScopeLeak = scopeLeakWords.length > 0;

		let detailsCountAC = 0;
		const detailsDetectedWordsSet = new Set<string>();

		for (const s of fetchedStoriesWithAc) {
			for (const ac of s.acceptanceCriteria) {
				const combinedAC = `${ac.givenText} ${ac.whenText} ${ac.thenText}`.toLowerCase();
				let acMatched = false;
				for (const det of args.details) {
					if (combinedAC.includes(det)) {
						acMatched = true;
						detailsDetectedWordsSet.add(det);
					}
				}
				if (acMatched) {
					detailsCountAC++;
				}
			}
		}

		const detailsDetectedWords = Array.from(detailsDetectedWordsSet);
		const roleFeatureList = fetchedStoriesWithAc.map((s) => `${s.role}: ${s.feature}`);

		let outOfScopeList: string[] = [];
		if (fetchedStoriesWithAc.length > 0) {
			const firstStoryRaw = fetchedStoriesWithAc[0]?.rawAiOutput;
			if (firstStoryRaw && Array.isArray(firstStoryRaw.out_of_scope)) {
				outOfScopeList = firstStoryRaw.out_of_scope.map((x: any) => String(x));
			}
		}

		results.push({
			runIndex: k,
			newTranscriptId: newId,
			extractionRunId,
			status,
			durationMs,
			model: modelName,
			temperature: activeTemperature,
			errorMessage,
			storyCount,
			acCountPerStory,
			zeroAcStoryCount,
			hasTemplatePrefix,
			templatePrefixStoriesCount,
			scopeLeakWords,
			scopeLeakLocations: leakLocations,
			hasScopeLeak,
			detailsDetectedWords,
			detailsCountAC,
			roleFeatureList,
			outOfScopeList,
			promptTokens,
			completionTokens,
			totalTokens,
			estimatedCostUsd,
			attemptsCount,
			stories: fetchedStoriesWithAc
		});
	}

	// Restore original OPENROUTER_TEMPERATURE env variable
	if (originalEnvTemperature !== undefined) {
		Bun.env.OPENROUTER_TEMPERATURE = originalEnvTemperature;
	} else {
		delete Bun.env.OPENROUTER_TEMPERATURE;
	}

	const resultsDir = join(process.cwd(), 'eval-results');
	if (!existsSync(resultsDir)) {
		mkdirSync(resultsDir, { recursive: true });
	}

	const now = new Date();
	const pad = (n: number) => String(n).padStart(2, '0');
	const timestampStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
	const prefix = `${timestampStr}_${args.label}`;

	const jsonPath = join(resultsDir, `${prefix}-runs.json`);
	const csvPath = join(resultsDir, `${prefix}-runs.csv`);
	const mdPath = join(resultsDir, `${prefix}-summary.md`);

	writeFileSync(jsonPath, JSON.stringify(results, null, 2), 'utf-8');

	const csvHeaders = [
		'run',
		'transcript_id',
		'extraction_run_id',
		'status',
		'duration_ms',
		'model',
		'temperature',
		'error_message',
		'story_count',
		'ac_count_per_story',
		'zero_ac_story_count',
		'has_template_prefix',
		'template_prefix_story_count',
		'has_scope_leak',
		'scope_leak_words',
		'scope_leak_locations',
		'ac_with_details_count',
		'details_detected_words',
		'role_feature_list',
		'out_of_scope_list',
		'prompt_tokens',
		'completion_tokens',
		'total_tokens',
		'estimated_cost_usd',
		'attempts_count'
	];

	const csvLines = [csvHeaders.join(',')];
	for (const r of results) {
		const row = [
			r.runIndex,
			r.newTranscriptId,
			r.extractionRunId ?? '',
			r.status,
			r.durationMs,
			escapeCsvField(r.model),
			r.temperature,
			escapeCsvField(r.errorMessage),
			r.storyCount,
			escapeCsvField(r.acCountPerStory.join(';')),
			r.zeroAcStoryCount,
			r.hasTemplatePrefix,
			r.templatePrefixStoriesCount,
			r.hasScopeLeak,
			escapeCsvField(r.scopeLeakWords.join(';')),
			escapeCsvField(r.scopeLeakLocations.join(';')),
			r.detailsCountAC,
			escapeCsvField(r.detailsDetectedWords.join(';')),
			escapeCsvField(r.roleFeatureList.join(';')),
			escapeCsvField(r.outOfScopeList.join(';')),
			r.promptTokens ?? '',
			r.completionTokens ?? '',
			r.totalTokens ?? '',
			r.estimatedCostUsd ?? '',
			r.attemptsCount
		];
		csvLines.push(row.join(','));
	}
	writeFileSync(csvPath, csvLines.join('\n'), 'utf-8');

	// Write summary markdown
	const completed = results.filter((r) => r.status === 'completed');
	const completedCount = completed.length;
	const avgDuration = completedCount > 0 ? (completed.reduce((a, b) => a + b.durationMs, 0) / completedCount).toFixed(0) : '0';
	const avgStories = completedCount > 0 ? (completed.reduce((a, b) => a + b.storyCount, 0) / completedCount).toFixed(2) : '0';

	let totalAcAll = 0;
	let totalStoriesAll = 0;
	for (const r of completed) {
		totalStoriesAll += r.storyCount;
		totalAcAll += r.acCountPerStory.reduce((a, b) => a + b, 0);
	}
	const avgAcPerStory = totalStoriesAll > 0 ? (totalAcAll / totalStoriesAll).toFixed(2) : '0';

	const leakRuns = completed.filter((r) => r.hasScopeLeak).length;
	const leakRate = completedCount > 0 ? ((leakRuns / completedCount) * 100).toFixed(1) : '0';

	const prefixRuns = completed.filter((r) => r.hasTemplatePrefix).length;
	const prefixRate = completedCount > 0 ? ((prefixRuns / completedCount) * 100).toFixed(1) : '0';

	let avgPromptTokens = 'N/A';
	let avgCompletionTokens = 'N/A';
	let avgTotalTokens = 'N/A';
	let avgCostUsd = 'N/A';

	const validTokens = completed.filter((r) => r.totalTokens !== null);
	if (validTokens.length > 0) {
		avgPromptTokens = (validTokens.reduce((a, b) => a + (b.promptTokens ?? 0), 0) / validTokens.length).toFixed(0);
		avgCompletionTokens = (validTokens.reduce((a, b) => a + (b.completionTokens ?? 0), 0) / validTokens.length).toFixed(0);
		avgTotalTokens = (validTokens.reduce((a, b) => a + (b.totalTokens ?? 0), 0) / validTokens.length).toFixed(0);
	}

	const validCosts = completed.filter((r) => r.estimatedCostUsd !== null);
	if (validCosts.length > 0) {
		avgCostUsd = (validCosts.reduce((a, b) => a + (b.estimatedCostUsd ?? 0), 0) / validCosts.length).toFixed(6);
	}

	const mdSummary = `# Evaluasi Ekstraksi: ${args.label}
- **Tanggal/Waktu**   : ${now.toLocaleString('id-ID')}
- **Transcript ID**   : ${args.transcriptId}
- **Total Run**       : ${args.runs} (Berhasil: ${completedCount}, Gagal: ${results.length - completedCount})
- **Model**           : ${modelName}
- **Temperature**     : ${activeTemperature}

## Metrik Performa & Output
| Metrik | Nilai |
| --- | --- |
| Durasi Rata-rata | ${avgDuration} ms |
| User Stories / Run | ${avgStories} |
| AC / User Story | ${avgAcPerStory} |
| Tingkat Scope Leak | ${leakRate}% (${leakRuns}/${completedCount} run) |
| Template Prefix Leak | ${prefixRate}% (${prefixRuns}/${completedCount} run) |

## Metrik Token & Biaya (K=8 Layer 5)
| Metrik | Nilai |
| --- | --- |
| Prompt Tokens (Avg) | ${avgPromptTokens} |
| Completion Tokens (Avg) | ${avgCompletionTokens} |
| Total Tokens (Avg) | ${avgTotalTokens} |
| Estimasi Biaya / Run | $${avgCostUsd} |
`;

	writeFileSync(mdPath, mdSummary, 'utf-8');

	console.log(`\n======================================================`);
	console.log(`Evaluasi selesai. Hasil tersimpan di:`);
	console.log(`- JSON : ${jsonPath}`);
	console.log(`- CSV  : ${csvPath}`);
	console.log(`- MD   : ${mdPath}`);
	console.log(`======================================================\n`);
}

main().catch((err) => {
	console.error('Fatal eval error:', err);
	process.exit(1);
});
