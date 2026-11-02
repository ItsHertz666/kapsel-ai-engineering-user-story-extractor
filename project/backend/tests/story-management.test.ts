import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { db } from '../src/db';
import { transcripts, userStories, acceptanceCriteria } from '../src/db/schema';
import { handleRequest } from '../src/index';
import { eq } from 'drizzle-orm';

describe('HITL Story Management API', () => {
	let testTranscriptId: number;
	let testStoryId: number;

	beforeAll(async () => {
		// Create a test transcript
		const [t] = await db
			.insert(transcripts)
			.values({
				rawText: 'Percakapan simulasi rapat untuk pengujian HITL story management.',
				originalFilename: 'test-hitl.txt',
				status: 'completed'
			})
			.returning({ id: transcripts.id });
		testTranscriptId = t.id;

		// Create a test user story with initial 'draft' status
		const [s] = await db
			.insert(userStories)
			.values({
				transcriptId: testTranscriptId,
				role: 'Dokter',
				feature: 'Melihat rekam medis pasien',
				benefit: 'Menentukan diagnosis tepat',
				status: 'draft'
			})
			.returning({ id: userStories.id });
		testStoryId = s.id;

		// Create initial acceptance criteria
		await db.insert(acceptanceCriteria).values([
			{
				userStoryId: testStoryId,
				givenText: 'Dokter sudah login ke sistem',
				whenText: 'Dokter memilih pasien di antrean',
				thenText: 'Sistem menampilkan ringkasan riwayat medis',
				sortOrder: 1
			}
		]);
	});

	afterAll(async () => {
		// Clean up created records (cascade delete on transcripts removes stories and AC)
		if (testTranscriptId) {
			await db.delete(transcripts).where(eq(transcripts.id, testTranscriptId));
		}
	});

	describe('PATCH /api/user-stories/:id (Edit content)', () => {
		it('should update role, feature, and benefit, transitioning draft to edited', async () => {
			const req = new Request(`http://localhost:3000/api/user-stories/${testStoryId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					role: 'Dokter Spesialis',
					feature: 'Melihat riwayat alergi pasien',
					benefit: 'Mencegah salah peresepan obat'
				})
			});

			const res = await handleRequest(req);
			expect(res.status).toBe(200);

			const data = (await res.json()) as any;
			expect(data.id).toBe(testStoryId);
			expect(data.role).toBe('Dokter Spesialis');
			expect(data.feature).toBe('Melihat riwayat alergi pasien');
			expect(data.benefit).toBe('Mencegah salah peresepan obat');
			expect(data.status).toBe('edited');
		});

		it('should allow partial update of only one field', async () => {
			const req = new Request(`http://localhost:3000/api/user-stories/${testStoryId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					feature: 'Melihat riwayat tindakan dan alergi pasien'
				})
			});

			const res = await handleRequest(req);
			expect(res.status).toBe(200);

			const data = (await res.json()) as any;
			expect(data.feature).toBe('Melihat riwayat tindakan dan alergi pasien');
			expect(data.role).toBe('Dokter Spesialis'); // unchanged
		});

		it('should return 400 when no updatable fields are provided', async () => {
			const req = new Request(`http://localhost:3000/api/user-stories/${testStoryId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({})
			});

			const res = await handleRequest(req);
			expect(res.status).toBe(400);
			const data = (await res.json()) as any;
			expect(data.error).toContain('At least one field');
		});

		it('should return 400 when field is an empty string', async () => {
			const req = new Request(`http://localhost:3000/api/user-stories/${testStoryId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ role: '   ' })
			});

			const res = await handleRequest(req);
			expect(res.status).toBe(400);
			const data = (await res.json()) as any;
			expect(data.error).toContain('role must be a non-empty string');
		});

		it('should return 404 for nonexistent story ID', async () => {
			const req = new Request(`http://localhost:3000/api/user-stories/99999999`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ role: 'Admin' })
			});

			const res = await handleRequest(req);
			expect(res.status).toBe(404);
		});

		it('should return 400 for invalid non-integer story ID', async () => {
			const req = new Request(`http://localhost:3000/api/user-stories/invalid-id`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ role: 'Admin' })
			});

			const res = await handleRequest(req);
			expect(res.status).toBe(400);
		});
	});

	describe('PATCH /api/user-stories/:id/status (Transition status)', () => {
		it('should transition edited story to approved', async () => {
			const req = new Request(`http://localhost:3000/api/user-stories/${testStoryId}/status`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ status: 'approved' })
			});

			const res = await handleRequest(req);
			expect(res.status).toBe(200);

			const data = (await res.json()) as any;
			expect(data.id).toBe(testStoryId);
			expect(data.status).toBe('approved');
		});

		it('should allow transition from approved to rejected', async () => {
			const req = new Request(`http://localhost:3000/api/user-stories/${testStoryId}/status`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ status: 'rejected' })
			});

			const res = await handleRequest(req);
			expect(res.status).toBe(200);

			const data = (await res.json()) as any;
			expect(data.status).toBe('rejected');
		});

		it('should return 400 for an unknown enum status', async () => {
			const req = new Request(`http://localhost:3000/api/user-stories/${testStoryId}/status`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ status: 'in_progress' })
			});

			const res = await handleRequest(req);
			expect(res.status).toBe(400);
			const data = (await res.json()) as any;
			expect(data.error).toContain('Valid statuses are');
		});

		it('should return 404 for nonexistent story ID on status update', async () => {
			const req = new Request(`http://localhost:3000/api/user-stories/99999999/status`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ status: 'approved' })
			});

			const res = await handleRequest(req);
			expect(res.status).toBe(404);
		});
	});

	describe('PUT /api/user-stories/:id/acceptance-criteria (Update & reorder AC)', () => {
		it('should replace and reorder acceptance criteria atomically', async () => {
			const newCriteria = [
				{
					given: 'Pasien telah terdaftar di meja administrasi',
					when: 'Dokter membuka halaman antrean periksa',
					then: 'Data rekam medis pasien langsung termuat',
					sort_order: 1
				},
				{
					given: 'Data rekam medis memuat riwayat alergi antibiotik',
					when: 'Dokter memilih resep obat berisiko',
					then: 'Sistem menampilkan notifikasi peringatan alergi',
					sort_order: 2
				}
			];

			const req = new Request(`http://localhost:3000/api/user-stories/${testStoryId}/acceptance-criteria`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ acceptance_criteria: newCriteria })
			});

			const res = await handleRequest(req);
			expect(res.status).toBe(200);

			const data = (await res.json()) as any;
			expect(data.user_story_id).toBe(testStoryId);
			expect(Array.isArray(data.acceptance_criteria)).toBe(true);
			expect(data.acceptance_criteria.length).toBe(2);
			expect(data.acceptance_criteria[0].sortOrder).toBe(1);
			expect(data.acceptance_criteria[1].sortOrder).toBe(2);
			expect(data.acceptance_criteria[0].givenText).toBe(newCriteria[0].given);
			expect(data.acceptance_criteria[1].thenText).toBe(newCriteria[1].then);

			// Verify in database directly
			const dbAcs = await db
				.select()
				.from(acceptanceCriteria)
				.where(eq(acceptanceCriteria.userStoryId, testStoryId));
			expect(dbAcs.length).toBe(2);
		});

		it('should return 400 when acceptance_criteria is empty array', async () => {
			const req = new Request(`http://localhost:3000/api/user-stories/${testStoryId}/acceptance-criteria`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ acceptance_criteria: [] })
			});

			const res = await handleRequest(req);
			expect(res.status).toBe(400);
			const data = (await res.json()) as any;
			expect(data.error).toContain('cannot be empty');
		});

		it('should return 400 when a criteria item is missing required fields', async () => {
			const req = new Request(`http://localhost:3000/api/user-stories/${testStoryId}/acceptance-criteria`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					acceptance_criteria: [
						{
							given: 'Kondisi awal',
							// missing when
							then: 'Hasil akhir'
						}
					]
				})
			});

			const res = await handleRequest(req);
			expect(res.status).toBe(400);
			const data = (await res.json()) as any;
			expect(data.error).toContain("'when' (or 'when_text') is required");
		});

		it('should return 404 for nonexistent story ID when updating AC', async () => {
			const req = new Request(`http://localhost:3000/api/user-stories/99999999/acceptance-criteria`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					acceptance_criteria: [
						{
							given: 'A',
							when: 'B',
							then: 'C'
						}
					]
				})
			});

			const res = await handleRequest(req);
			expect(res.status).toBe(404);
		});
	});
});

