/**
 * Model Pricing Matrix & Token-to-Cost Calculation Utility
 * 
 * Sources & Retrieval Date:
 * Verified via OpenRouter Official Models Catalog API (https://openrouter.ai/models)
 * Retrieved at: 2026-11-03
 * 
 * Verified Models & Current Rates (per 1,000,000 tokens):
 * - openai/gpt-oss-120b:
 *     Prompt (Input): $0.03
 *     Completion (Output): $0.15
 *     Ref: https://openrouter.ai/openai/gpt-oss-120b
 * 
 * - openai/gpt-oss-120b:free:
 *     Free tier variant hosted on OpenRouter subject to provider rate limits.
 *     Prompt (Input): $0.00
 *     Completion (Output): $0.00
 *     Ref: https://openrouter.ai/openai/gpt-oss-120b:free
 * 
 * - openai/gpt-4o-mini:
 *     Prompt (Input): $0.15
 *     Completion (Output): $0.60
 *     Ref: https://openrouter.ai/openai/gpt-4o-mini
 * 
 * POLICY:
 * - If a model is not verified, or if token metadata is missing (null), pricing returns NULL.
 * - Do NOT substitute arbitrary default rates.
 * - Dates indicate when the rate was retrieved/verified (retrieved_at), NOT historical effective dates.
 */

export interface ModelPricingTier {
	modelName: string;
	promptRatePerMillionUsd: number;
	completionRatePerMillionUsd: number;
	retrievedAt: string; // YYYY-MM-DD
	source: string;
}

export const KNOWN_MODEL_PRICING: Record<string, ModelPricingTier> = {
	'openai/gpt-oss-120b': {
		modelName: 'openai/gpt-oss-120b',
		promptRatePerMillionUsd: 0.03,
		completionRatePerMillionUsd: 0.15,
		retrievedAt: '2026-11-03',
		source: 'OpenRouter Models Catalog (https://openrouter.ai/openai/gpt-oss-120b)'
	},
	'openai/gpt-oss-120b:free': {
		modelName: 'openai/gpt-oss-120b:free',
		promptRatePerMillionUsd: 0.0,
		completionRatePerMillionUsd: 0.0,
		retrievedAt: '2026-11-03',
		source: 'OpenRouter Models Catalog (https://openrouter.ai/openai/gpt-oss-120b:free)'
	},
	'openai/gpt-4o-mini': {
		modelName: 'openai/gpt-4o-mini',
		promptRatePerMillionUsd: 0.15,
		completionRatePerMillionUsd: 0.6,
		retrievedAt: '2026-11-03',
		source: 'OpenRouter Models Catalog (https://openrouter.ai/openai/gpt-4o-mini)'
	}
};

/**
 * Returns verified pricing tier for a model, or null if unverified/unknown.
 * Does NOT substitute default fallback prices to prevent inaccurate cost calculation.
 */
export function getModelPricingTier(modelName: string): ModelPricingTier | null {
	if (!modelName) return null;
	const normalized = modelName.trim().toLowerCase();

	// Exact match
	for (const [key, tier] of Object.entries(KNOWN_MODEL_PRICING)) {
		if (key.toLowerCase() === normalized) {
			return tier;
		}
	}

	// Match ignoring provider prefix (e.g. "gpt-4o-mini" -> "openai/gpt-4o-mini")
	for (const [key, tier] of Object.entries(KNOWN_MODEL_PRICING)) {
		const shortKey = key.split('/').pop()?.toLowerCase();
		if (shortKey && shortKey === normalized) {
			return tier;
		}
	}

	return null;
}

export interface CostCalculationResult {
	promptRatePerMillionUsd: number | null;
	completionRatePerMillionUsd: number | null;
	estimatedCostUsd: number | null;
}

/**
 * Calculates estimated cost for an attempt.
 * Returns null for estimatedCostUsd if token counts are missing or model pricing is unverified.
 */
export function calculateAttemptCost(
	modelName: string,
	promptTokens: number | null,
	completionTokens: number | null
): CostCalculationResult {
	const tier = getModelPricingTier(modelName);

	if (!tier) {
		return {
			promptRatePerMillionUsd: null,
			completionRatePerMillionUsd: null,
			estimatedCostUsd: null
		};
	}

	const promptRate = tier.promptRatePerMillionUsd;
	const completionRate = tier.completionRatePerMillionUsd;

	// If either prompt or completion token counts are unavailable, exact cost is indeterminable
	if (promptTokens === null || completionTokens === null) {
		return {
			promptRatePerMillionUsd: promptRate,
			completionRatePerMillionUsd: completionRate,
			estimatedCostUsd: null
		};
	}

	const pCost = (promptTokens / 1_000_000) * promptRate;
	const cCost = (completionTokens / 1_000_000) * completionRate;
	const total = Number((pCost + cCost).toFixed(8));

	return {
		promptRatePerMillionUsd: promptRate,
		completionRatePerMillionUsd: completionRate,
		estimatedCostUsd: total
	};
}
