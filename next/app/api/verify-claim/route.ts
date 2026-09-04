import OpenAI from "openai";
import {CLAIM_SYSTEM_PROMPT, AI_MODELS} from "@/lib/global_variables";
import { aggregate } from "@/lib/aggregate";
import { NextRequest, NextResponse } from "next/server";

// Response time limit before timeout
export const maxDuration = 120;

/**
 * Runs the 5-model claim check and returns Gilbert's aggregate() shape, plus
 * each fulfilled model's real completion ID (aggregate() itself only keeps
 * `.model`, not `.id` — captured here instead of touching aggregate.ts).
 * Exported so /api/verdict can call this directly without an HTTP round trip.
 */
export async function getClaimVerdict(claim: string)
{
	const responses = [
		sendPrompt(AI_MODELS[0], claim),
		sendPrompt(AI_MODELS[1], claim),
		sendPrompt(AI_MODELS[2], claim),
		sendPrompt(AI_MODELS[3], claim),
		sendPrompt(AI_MODELS[4], claim),
	];

	// results will contain an array of promise responses
	const results = await Promise.allSettled(responses);

	let fulfilledPromises: PromiseFulfilledResult<any>[] = [];
	for (const [i, each] of results.entries())
	{
		if (each.status === "rejected")
		{
			console.error(`[verify-claim] ${AI_MODELS[i]} rejected:`, each.reason);
			continue;
		}
		if (each.value.choices[0].message.content !== null && each.value.choices[0].message.content !== "")
		{
			fulfilledPromises.push(each);
		}
		else
		{
			console.error(`[verify-claim] ${AI_MODELS[i]} returned empty content. finish_reason:`, each.value.choices[0].finish_reason);
		}
	}

	if (fulfilledPromises.length === 0)
		throw new Error("No fulfilled promises detected");

	const finalVerdict = await aggregate(fulfilledPromises, "claim");
	const requestIds: Record<string, string> = {};
	for (const each of fulfilledPromises)
		requestIds[each.value.model] = each.value.gonka_request_id ?? each.value.id ?? "";

	return { finalVerdict, requestIds };
}

export async function POST(request: NextRequest)
{
	const body = await request.json();
	const claim = body.claim;

	// Verify incoming request is in the correct format
	if (!claim)
	{
		return NextResponse.json(
			{
				success: false,
				error: "ERROR: Missing 'claim' parameter in request body.",
			},
			{ status: 400 }
		);
	}

	try
	{
		const { finalVerdict } = await getClaimVerdict(claim);

		return NextResponse.json(
			{
				success: true,
				message: "SUCCESS: Final Verdict obtained.",
				data: finalVerdict
			},
			{ status: 201 }
		);
	}
	catch (error)
	{
		return NextResponse.json(
			{
				success: false,
				error: error instanceof Error ? error.message : "Unknown error."
			},
			{ status: 500 }
		);
	}

}

/*------[Send User Prompt to a Model for processing]------*/

async function sendPrompt(chosenModel: string, userInput: string)
{
	const abortController = new AbortController();

	// Timeout for 30s
	const timeoutID = setTimeout(() => {
		abortController.abort();
	}, 30000);

	const incomingPrompt = userInput;

	let client: OpenAI | null = null;

	// Initialize OpenAI Client
	try
	{
		// Client for Kimi, Deepseek and MiniMax
		if ([AI_MODELS[0], AI_MODELS[1], AI_MODELS[2]].includes(chosenModel))
		{
			client = new OpenAI({
				apiKey: process.env.GONKA_ROUTER_API_KEY,
				baseURL: 'https://api.gonkarouter.io/v1',
				defaultHeaders: {
					"X-Gonka-No-Fallback": "true"
				}
			});
		}
		// Client for Gemini models
		else if ([AI_MODELS[3], AI_MODELS[4]].includes(chosenModel))
		{
			client = new OpenAI({
				apiKey: process.env.GEMINI_API_KEY,
				baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
			});
		}
		/*
		else if ([AI_MODELS[5], AI_MODELS[6], AI_MODELS[7]].includes(chosenModel))
		{
			client = new OpenAI({
				apiKey: process.env.CHATGPT_API_KEY,
				baseURL: 'https://api.openai.com/v1',
			});
		}
		*/

		if (!(client instanceof OpenAI))
			throw new Error("ERROR: Client was not initialized.");
	}
	catch (error)
	{
		throw new Error("Client ERROR: " + (error instanceof Error ? error.message : "Unknown error."));
	}

	// Submit request to Gonka Router
	try
	{
		let maxTokens;

		// For Kimi, Deepseek, and Gemini Models
		if (!(chosenModel === AI_MODELS[2]))
			maxTokens = 550;
		// For MiniMax because requires extra max_tokens due to <think> block
		else
			maxTokens = 1024;


		const response = await client.chat.completions.create({
			model: chosenModel,
			max_tokens: maxTokens,
			messages: [
				{ role: 'system', content: CLAIM_SYSTEM_PROMPT },
				{ role: 'user', content: incomingPrompt }
			],
		},
		{
			signal: abortController.signal
		}).withResponse();

		clearTimeout(timeoutID);


		const responseData: OpenAI.Chat.Completions.ChatCompletion & { gonka_request_id?: string | null } = response.data;
		const rawResponse = response.response;

		if ([AI_MODELS[0], AI_MODELS[1], AI_MODELS[2]].includes(chosenModel))
		{
			responseData.gonka_request_id = rawResponse.headers.get("X-Request-Id");
		}

		return responseData;
	}
	catch (error)
	{
		clearTimeout(timeoutID);
		throw new Error(`ERROR: Request to ${chosenModel} was aborted due to: ` + (error instanceof Error ? error.message : "Unknown error."));
	}
}


