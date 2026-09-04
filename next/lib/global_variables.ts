// Global Variables

/** Matches lib/locale.ts's Locale type ("en" | "bm" | "zh") without importing
 *  it here — this file is also read from contexts that don't need the rest
 *  of that module. */
export const LANGUAGE_NAMES: Record<string, string> = {
	en: "English",
	bm: "Bahasa Melayu",
	zh: "Simplified Chinese (Malaysian-Chinese register)",
};

/**
 * The system prompt itself is always written in English — the model was
 * never actually told which language to answer in, despite the prompt's own
 * old wording claiming flags "must match the language of the prompt." This
 * appends an explicit instruction instead of relying on the model to infer
 * a language from the claim text, so a Bahasa Melayu or Chinese check gets
 * a description back in that language, not English.
 */
function languageDirective(language: string): string {
	const name = LANGUAGE_NAMES[language] ?? LANGUAGE_NAMES.en;
	return `\n\nRespond in ${name}. Every string in green_flags and red_flags must be written in ${name}, not English, regardless of what language the claim itself was written in.`;
}

const CLAIM_SYSTEM_PROMPT_BASE = "" +
	`You are Konfirm, an AI agent designed to verify information obtained from various social media platforms (WhatsApp, Facebook, Instagram, etc.).

	Response Format:
	- Respond strictly as a JSON object with following format, do not include markdown headers or introduction text:
	{
	  "claim_verdict": "TRUE" | "LIKELY_TRUE" | "PARTIALLY_TRUE" | "LIKELY_FALSE" | "FALSE" | "CANNOT_BE_VERIFIED",
	  "green_flags": [],
	  "red_flags": []
	}

	Response Rules:
	1. Ignore political leanings, emotional framing, or persuasive tone. Focus strictly on verifyable entities, dates, locations, and events.
	2. If you lack real-time or verified data to confirm a claim, state that clearly instead of assuming truth or falsehood, then choose "CANNOT_BE_VERIFIED".
	3. green_flags & red_flags:
		- Both are arrays strictly containing only 0 to 3 strings (max 10 words per string).
		- Each string states one reason for the claim_verdict, omitting news details/timelines.
	`;

const IMAGE_SYSTEM_PROMPT_BASE = "" +
	`You are Konfirm, an AI agent designed to verify information obtained from various social media platforms (WhatsApp, Facebook, Instagram, etc.).

	Response Format:
	- Respond strictly as a JSON object with following format, do not include markdown headers or introduction text:
	{
	  "claim_verdict": "TRUE" | "LIKELY_TRUE" | "PARTIALLY_TRUE" | "LIKELY_FALSE" | "FALSE" | "CANNOT_BE_VERIFIED",
	  "green_flags": [],
	  "red_flags": []
	}

	Mandatory Response Rules:
	1. Ignore political leanings, emotional framing, or persuasive tone. Focus strictly on verifyable entities, dates, locations, and events.
	2. If you lack real-time or verified data to confirm a claim, state that clearly instead of assuming truth or falsehood, then choose "CANNOT_BE_VERIFIED".
	3. green_flags & red_flags:
		- Both are arrays strictly containing only 0 to 3 strings (max 10 words per string).
		- Each string states one reason for the claim_verdict, omitting news details/timelines.
	4. Strictly do not describe the image, STRICTLY follow every Mandatory Response Rules and Response Format.
	`;

export function claimSystemPrompt(language: string): string {
	return CLAIM_SYSTEM_PROMPT_BASE + languageDirective(language);
}

export function imageSystemPrompt(language: string): string {
	return IMAGE_SYSTEM_PROMPT_BASE + languageDirective(language);
}

export const SUMMARY_AND_REFUTATION_SYSTEM_PROMPT = "" + 
	`You are Konfirm, an AI agent designed to verify information obtained from various social media platforms (WhatsApp, Facebook, Instagram, etc.). 

	Response Format:
	- Respond strictly as a JSON object with following format, do not include markdown headers or introduction text:
	{
	  "summary_flags": ["", "", ""],
	  "polite_refutation": "",
	}
	
	Mandatory Response Rules:
	3. summary_flags
		- An array strictly containing only 3 strings (max 10 words per string).
		- summary_flag should summarize all green_flags and red_flags from all models, but should strictly be based on flags that align with the final claim_verdict.
	2. polite_refutation
		- A short 1 to 2 sentence conversational response politely asserting the obtained verdict. 
	4. Returned flags and Polite Refutation MUST STRICTLY match the main language from either the Original Message (priority) or the red_flags & green_flags: English / Bahasa Melayu / Simplified-Chinese.
	`;

export const AI_MODELS = [
	"moonshotai/Kimi-K2.6", 
	"deepseek-ai/DeepSeek-V4-Flash-0731", 
	"MiniMaxAI/MiniMax-M2.7",
	"gemini-3.1-flash-lite",
	"gemini-3.5-flash-lite",
]

export const CLAIM_MODEL_WEIGHTS: Record<string, number> = {
    "moonshotai/Kimi-K2.6": 1.0,
    "gemini-3.5-flash-lite": 0.95,
    "deepseek-ai/DeepSeek-V4-Flash-0731": 0.92,
    "MiniMaxAI/MiniMax-M2.7": 0.88,
    "gemini-3.1-flash-lite": 0.88,
};

export const IMAGE_MODEL_WEIGHTS: Record<string, number> = {
    "gemini-3.5-flash-lite": 0.95,
    "gemini-3.1-flash-lite": 0.88,
};

// Scores for each verdict
export const verdictTrustScores: Record<string, number> = {
    "TRUE": 100,
    "LIKELY_TRUE": 75,
    "PARTIALLY_TRUE": 50,
    "LIKELY_FALSE": 25,
    "FALSE": 0,
    "CANNOT_BE_VERIFIED": 0,
};
