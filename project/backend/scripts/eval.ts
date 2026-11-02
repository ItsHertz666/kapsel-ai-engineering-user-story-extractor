import { asc, eq } from 'drizzle-orm';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { db } from '../src/db';
import { acceptanceCriteria, transcripts, userStories } from '../src/db/schema';
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
	scopeLeakLocations: string[]; // e.g. "Story 1 (feature): notifikasi"
	hasScopeLeak: boolean;
	detailsDetectedWords: string[];
	detailsCountAC: number;
	roleFeatureList: string[];
	outOfScopeList: string[];
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

	// 1. Fetch original transcript raw_text
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

		// INSERT new transcript with same rawText
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

		try {
			console.log(`    Memproses transcript ID: ${newId}...`);
			await processTranscript(newId);
			durationMs = Date.now() - startTime;
			status = 'completed';
			console.log(`    Selesai dalam ${durationMs}ms.`);

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

			// Check story text
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

			// Check AC
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

		// Details check on AC
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
			stories: fetchedStoriesWithAc
		});
	}

	// Restore original OPENROUTER_TEMPERATURE env variable
	if (originalEnvTemperature !== undefined) {
		Bun.env.OPENROUTER_TEMPERATURE = originalEnvTemperature;
	} else {
		delete Bun.env.OPENROUTER_TEMPERATURE;
	}

	// 4. Output to backend/eval-results/
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

	// A. Write runs.json
	writeFileSync(jsonPath, JSON.stringify(results, null, 2), 'utf-8');

	// B. Write runs.csv
	const csvHeaders = [
		'run',
		'transcript_id',
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
		'out_of_scope_list'
	];

	const csvRows = results.map((r) => [
		r.runIndex,
		r.newTranscriptId,
		r.status,
		r.durationMs,
		escapeCsvField(r.model),
		r.temperature,
		escapeCsvField(r.errorMessage || ''),
		r.storyCount,
		escapeCsvField(r.acCountPerStory.join('; ')),
		r.zeroAcStoryCount,
		r.hasTemplatePrefix,
		r.templatePrefixStoriesCount,
		r.hasScopeLeak,
		escapeCsvField(r.scopeLeakWords.join('; ')),
		escapeCsvField(r.scopeLeakLocations.join('; ')),
		r.detailsCountAC,
		escapeCsvField(r.detailsDetectedWords.join('; ')),
		escapeCsvField(r.roleFeatureList.join('; ')),
		escapeCsvField(r.outOfScopeList.join('; '))
	]);

	const csvContent = [csvHeaders.join(','), ...csvRows.map((row) => row.join(','))].join('\n');
	writeFileSync(csvPath, csvContent, 'utf-8');

	// C. Compute Aggregates for summary.md and console
	const totalRuns = results.length;
	const successfulRuns = results.filter((r) => r.status === 'completed');
	const failedRuns = results.filter((r) => r.status === 'failed');

	const durations = results.map((r) => r.durationMs);
	const avgDuration = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
	const maxDuration = durations.length > 0 ? Math.max(...durations) : 0;

	// Story counts for successful runs
	const storyCounts = successfulRuns.map((r) => r.storyCount);
	const minStories = storyCounts.length > 0 ? Math.min(...storyCounts) : 0;
	const maxStories = storyCounts.length > 0 ? Math.max(...storyCounts) : 0;
	const avgStories =
		storyCounts.length > 0
			? (storyCounts.reduce((a, b) => a + b, 0) / storyCounts.length).toFixed(2)
			: '0';

	// Distribution of story counts
	const storyDistribution: Record<number, number> = {};
	for (const count of storyCounts) {
		storyDistribution[count] = (storyDistribution[count] || 0) + 1;
	}
	const distributionStr = Object.entries(storyDistribution)
		.map(([count, runsCount]) => `${count} story: ${runsCount} run`)
		.join(', ') || '-';

	// Percentage of runs with keyword leak
	const leakRuns = successfulRuns.filter((r) => r.hasScopeLeak).length;
	const leakPct = successfulRuns.length > 0 ? ((leakRuns / successfulRuns.length) * 100).toFixed(1) : '0';

	// Percentage of runs with template prefix
	const prefixRuns = successfulRuns.filter((r) => r.hasTemplatePrefix).length;
	const prefixPct = successfulRuns.length > 0 ? ((prefixRuns / successfulRuns.length) * 100).toFixed(1) : '0';

	// Average AC per story
	let totalACs = 0;
	let totalStoriesCount = 0;
	for (const r of successfulRuns) {
		totalStoriesCount += r.storyCount;
		totalACs += r.acCountPerStory.reduce((a, b) => a + b, 0);
	}
	const avgAcPerStory = totalStoriesCount > 0 ? (totalACs / totalStoriesCount).toFixed(2) : '0';

	// Generate summary markdown
	let md = `# Ringkasan Evaluasi Ekstraksi

- **Waktu Evaluasi**: ${now.toISOString()}
- **Label**: ${args.label}
- **Model**: ${modelName}
- **Temperature**: ${activeTemperature}
- **Transcript Sumber ID**: ${args.transcriptId}
- **Keywords (Scope Filter)**: ${args.keywords.length > 0 ? args.keywords.join(', ') : '*(tidak ditentukan)*'}
- **Details (UI/Tech Filter)**: ${args.details.length > 0 ? args.details.join(', ') : '*(tidak ditentukan)*'}

## 1. Statistik Agregat

| Metrik | Nilai |
|---|---|
| Total Run | ${totalRuns} |
| Run Berhasil | ${successfulRuns.length} |
| Run Gagal | ${failedRuns.length} |
| Jumlah Story (Min / Rata-rata / Maks) | ${minStories} / ${avgStories} / ${maxStories} |
| Distribusi Jumlah Story | ${distributionStr} |
| Rata-rata AC per Story | ${avgAcPerStory} |
| Run dengan Kebocoran Keywords (%) | ${leakRuns}/${successfulRuns.length} (${leakPct}%) |
| Run dengan Awalan Template (%) | ${prefixRuns}/${successfulRuns.length} (${prefixPct}%) |
| Durasi Rata-rata / Maksimal (ms) | ${avgDuration} ms / ${maxDuration} ms |

## 2. Tabel Ringkas Hasil Run

| Run | Transcript ID | Status | Durasi (ms) | Jumlah Story | AC / Story | Awalan Template? | Kebocoran Keywords? | AC dg Details |
|---|---|---|---|---|---|---|---|---|
`;

	for (const r of results) {
		const acListStr = r.acCountPerStory.length > 0 ? r.acCountPerStory.join(',') : '-';
		const leakStr = r.hasScopeLeak ? `Ya (${r.scopeLeakWords.join(', ')})` : 'Tidak';
		const prefixStr = r.hasTemplatePrefix ? `Ya (${r.templatePrefixStoriesCount})` : 'Tidak';
		md += `| ${r.runIndex} | ${r.newTranscriptId} | ${r.status} | ${r.durationMs} | ${r.storyCount} | ${acListStr} | ${prefixStr} | ${leakStr} | ${r.detailsCountAC} |\n`;
	}

	md += `
> **Catatan Penting**:
> Deteksi keywords dan details merupakan **heuristik berbasis pencocokan kata kunci**, bukan penilaian makna semantik yang mutlak. Hasil evaluasi tetap perlu ditinjau secara manual untuk memastikan konteks dan akurasi yang sebenarnya.
`;

	writeFileSync(mdPath, md, 'utf-8');

	// 5. Cetak ke console
	console.log(`\n======================================================`);
	console.log(`RINGKASAN EVALUASI (${prefix})`);
	console.log(`======================================================`);
	console.log(`Total Run             : ${totalRuns} (Berhasil: ${successfulRuns.length}, Gagal: ${failedRuns.length})`);
	console.log(`Jumlah Story          : Min: ${minStories}, Rata-rata: ${avgStories}, Maks: ${maxStories}`);
	console.log(`Distribusi Story      : ${distributionStr}`);
	console.log(`Rata-rata AC / Story  : ${avgAcPerStory}`);
	console.log(`Kebocoran Keywords    : ${leakRuns}/${successfulRuns.length} run (${leakPct}%)`);
	console.log(`Awalan Template       : ${prefixRuns}/${successfulRuns.length} run (${prefixPct}%)`);
	console.log(`Durasi Ekstraksi      : Rata-rata: ${avgDuration}ms, Maks: ${maxDuration}ms`);
	console.log(`------------------------------------------------------`);
	console.log(`Tabel Run:`);
	console.log(`Run | Status     | Durasi  | Story | AC/Story | Template? | Leak?`);
	for (const r of results) {
		const acStr = r.acCountPerStory.join(',') || '-';
		console.log(
			`${String(r.runIndex).padEnd(3)} | ${r.status.padEnd(10)} | ${(r.durationMs + 'ms').padEnd(7)} | ${String(r.storyCount).padEnd(5)} | ${acStr.padEnd(8)} | ${(r.hasTemplatePrefix ? 'Ya' : 'Tidak').padEnd(9)} | ${r.hasScopeLeak ? `Ya (${r.scopeLeakWords.join(',')})` : 'Tidak'}`
		);
	}
	console.log(`======================================================`);
	console.log(`Hasil tersimpan di:`);
	console.log(`- ${jsonPath}`);
	console.log(`- ${csvPath}`);
	console.log(`- ${mdPath}`);
	console.log(`\nCatatan: Deteksi keywords dan details adalah heuristik berbasis kata kunci, bukan penilaian makna, dan hasil tetap perlu ditinjau manual.`);
	console.log(`======================================================\n`);

	// Exit process cleanly
	process.exit(0);
}

main().catch((err) => {
	console.error('Unhandled fatal error in evaluation script:', err);
	process.exit(1);
});
