import OpenAI from "openai";
import {imageSystemPrompt, AI_MODELS} from "@/lib/global_variables";
import { aggregate } from "@/lib/aggregate";
import { NextRequest, NextResponse } from "next/server";

// Response time limit before timeout
export const maxDuration = 120;

/**
 * Runs the 2-model image check (Gemini only — the other three models don't
 * accept image input) and returns Gilbert's aggregate() shape plus each
 * fulfilled model's real completion ID. Exported so /api/verdict can call
 * this directly without an HTTP round trip.
 *
 * `language` ("en" | "bm" | "zh") controls what language the models answer
 * in.
 */
export async function getImageVerdict(base64URL: string, language: string = "en")
{
	const responses = [
		sendPrompt(AI_MODELS[3], base64URL, language),
		sendPrompt(AI_MODELS[4], base64URL, language),
	];

	// results will contain an array of promise responses
	const results = await Promise.allSettled(responses);

	let fulfilledPromises: PromiseFulfilledResult<any>[] = [];
	for (const each of results)
	{
		if (each.status === "fulfilled")
		{
			fulfilledPromises.push(each);
		}
	}

	if (fulfilledPromises.length === 0)
		throw new Error("No fulfilled promises detected");

	const finalVerdict = await aggregate(fulfilledPromises, "image");
	const requestIds: Record<string, string> = {};
	for (const each of fulfilledPromises)
		requestIds[each.value.model] = each.value.id ?? "";

	return { finalVerdict, requestIds };
}

export async function POST(request: NextRequest)
{
    const body = await request.json();
    const imageBase64 = body.imageBase64;
    const language = body.language ?? "en";

    // Verify incoming request is in the correct format
    if (!imageBase64 || typeof imageBase64 !== "string") {
        return NextResponse.json(
            {
                success: false,
                error: "ERROR: Missing 'imageBase64' parameter in request body.",
            },
            { status: 400 }
        );
    }

	try
	{
		const { finalVerdict } = await getImageVerdict(imageBase64, language);

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
async function sendPrompt(chosenModel: string, userInput: string, language: string)
{
	const abortController = new AbortController();

	// Timeout for 30s
	const timeoutID = setTimeout(() => {
		abortController.abort();
	}, 30000);

	const incomingPrompt = userInput;

	let client: OpenAI | null = null;

	// Initialize OpenAI client (similar to request header)
	try
	{
		// Client for Kimi, Deepseek, MiniMax

		// Client for Gemini models
		if ([AI_MODELS[3], AI_MODELS[4]].includes(chosenModel))
		{
			client = new OpenAI({
				apiKey: process.env.GEMINI_API_KEY,
				baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
			});
		}

		if (!(client instanceof OpenAI))
			throw new Error("ERROR: Client was not initialized.");
	}
	catch (error)
	{
		throw new Error("Client ERROR: " + (error instanceof Error ? error.message : "Unknown error."));
	}

	try
	{
		if ([AI_MODELS[3], AI_MODELS[4]].includes(chosenModel))
		{
			const response = await client.chat.completions.create({
				model: chosenModel,
				max_tokens: 550,
				messages: [
					{ role: 'system', content: imageSystemPrompt(language) },
					{
						role: 'user',
						content: [
							{
								"type": "image_url",
								"image_url": {
									url: userInput,
								}
							}
						]
					}
				],
			},
			{
				signal: abortController.signal
			});

			clearTimeout(timeoutID);
			return response;
		}
		else
		{
			clearTimeout(timeoutID);
			throw new Error(`ERROR: Invalid model.`);
		}
	}
	catch (error)
	{
		clearTimeout(timeoutID);
		throw new Error(`ERROR: Request to ${chosenModel} was aborted due to: ` + (error instanceof Error ? error.message : "Unknown error."));
	}
}

