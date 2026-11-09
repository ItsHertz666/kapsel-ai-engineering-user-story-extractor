import readline from 'node:readline';
import { eq, sql } from 'drizzle-orm';
import { db } from '../src/db';
import { users } from '../src/db/schema';
import { hashPassword, isValidEmail, isValidPassword } from '../src/utils/auth';

/**
 * Prompt operator in terminal with echo suppression for passwords.
 */
function promptHidden(query: string): Promise<string> {
	return new Promise((resolve) => {
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout
		});

		// Check if stdout is a TTY and supports raw mode
		const isTTY = Boolean(process.stdin.isTTY);

		if (!isTTY) {
			// In non-interactive pipe mode, fallback to regular question
			rl.question(query, (answer) => {
				rl.close();
				resolve(answer.trim());
			});
			return;
		}

		process.stdout.write(query);

		let input = '';
		const onData = (charBuffer: Buffer) => {
			const char = charBuffer.toString();
			switch (char) {
				case '\n':
				case '\r':
				case '\u0004': // EOT / Ctrl+D
					process.stdin.removeListener('data', onData);
					process.stdin.setRawMode(false);
					process.stdout.write('\n');
					rl.close();
					resolve(input.trim());
					break;
				case '\u0003': // Ctrl+C
					process.stdin.setRawMode(false);
					process.exit(1);
					break;
				case '\b':
				case '\x7f': // Backspace
					if (input.length > 0) {
						input = input.slice(0, -1);
					}
					break;
				default:
					input += char;
					break;
			}
		};

		process.stdin.setRawMode(true);
		process.stdin.resume();
		process.stdin.on('data', onData);
	});
}

function promptVisible(query: string): Promise<string> {
	return new Promise((resolve) => {
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout
		});
		rl.question(query, (answer) => {
			rl.close();
			resolve(answer.trim());
		});
	});
}

export async function bootstrapAdmin(
	providedEmail?: string,
	providedPassword?: string
): Promise<{ success: boolean; adminId?: string; message: string }> {
	let email = providedEmail;
	let password = providedPassword;

	// 1. Gather email
	if (!email) {
		email = Bun.env.BOOTSTRAP_ADMIN_EMAIL || (await promptVisible('Enter initial Admin email: '));
	}

	if (!isValidEmail(email)) {
		return { success: false, message: 'Invalid email format' };
	}

	// 2. Gather password
	if (!password) {
		if (Bun.env.BOOTSTRAP_ADMIN_PASSWORD) {
			password = Bun.env.BOOTSTRAP_ADMIN_PASSWORD;
		} else {
			password = await promptHidden('Enter initial Admin password (min 8 chars): ');
			const confirmPassword = await promptHidden('Confirm initial Admin password: ');
			if (password !== confirmPassword) {
				return { success: false, message: 'Passwords do not match' };
			}
		}
	}

	if (!isValidPassword(password)) {
		return { success: false, message: 'Password must be between 8 and 128 characters' };
	}

	// 3. Atomically check and insert within a transaction guarded by an advisory lock
	const passwordHash = await hashPassword(password);

	try {
		const result = await db.transaction(async (tx) => {
			// Acquire transaction-level advisory lock to serialize concurrent bootstrap attempts
			await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('kapsel_admin_bootstrap_lock'))`);

			// Re-check if an active Admin already exists after lock acquisition
			const existingAdmins = await tx
				.select({ id: users.id })
				.from(users)
				.where(eq(users.role, 'admin'))
				.limit(1);

			if (existingAdmins.length > 0) {
				return {
					success: false,
					message: 'An active Admin account already exists in the system. Duplicate bootstrap aborted.'
				};
			}

			// Re-check if email already exists
			const existingByEmail = await tx
				.select({ id: users.id })
				.from(users)
				.where(eq(users.email, email!))
				.limit(1);

			if (existingByEmail.length > 0) {
				return {
					success: false,
					message: `An account with email '${email}' already exists. Bootstrap aborted.`
				};
			}

			// Insert Admin within the same locked transaction
			const [createdAdmin] = await tx
				.insert(users)
				.values({
					email: email!,
					passwordHash,
					role: 'admin',
					isActive: true
				})
				.returning({ id: users.id, email: users.email, role: users.role, createdAt: users.createdAt });

			return {
				success: true,
				adminId: createdAdmin.id,
				message: `Admin account '${createdAdmin.email}' created successfully with ID ${createdAdmin.id}`
			};
		});

		return result;
	} catch (error) {
		console.error('Database transaction error during bootstrap:', error);
		return { success: false, message: 'Failed to complete bootstrap transaction' };
	}
}

// Execution if run directly from CLI
if (import.meta.main) {
	console.log('=== Kapsel Admin Bootstrap CLI ===');
	bootstrapAdmin()
		.then((res) => {
			if (res.success) {
				console.log(`[SUCCESS] ${res.message}`);
				process.exit(0);
			} else {
				console.error(`[ERROR] ${res.message}`);
				process.exit(1);
			}
		})
		.catch((err) => {
			console.error('[FATAL] Bootstrap failed:', err);
			process.exit(1);
		});
}

