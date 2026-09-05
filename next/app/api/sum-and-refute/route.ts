import OpenAI from "openai";
import { summaryRefutationSystemPrompt, AI_MODELS } from "@/lib/global_variables";
import { NextRequest, NextResponse } from "next/server";
import { resolveLocale } from "@/lib/locale";

// Response time limit before timeout
export const maxDuration = 120;

export async function POST(request: NextRequest)
{
	const body = await request.json();
	const originalMessage = body["original_message"];
	const finalVerdict = body["final_verdict"];
	const language = resolveLocale(body["language"]);

	// Verify incoming request is in the correct format
	if (!finalVerdict)
	{
		return NextResponse.json(
			{
				success: false,
				error: "ERROR: Missing 'final_verdict' parameter in request body.",
			},
			{ status: 400 }
		);
	}


	try
	{
		if (finalVerdict === null)
			throw new Error("ERROR: Invalid Final Verdict.");

		let combined;

		if (originalMessage !== "")
			combined = "Original Message\n" + originalMessage + "\n\nFinal Verdict" + finalVerdict;
		else
			combined = "Original Message\nNone" + "\n\nFinal Verdict" + finalVerdict;


		// Priority to Gonka Router Models, which are better at language tasks
		// Each batch contains one Gemini Model as backup, for consistent response
		const priorityBatch = [
			sendPrompt(AI_MODELS[0], combined, language),
			sendPrompt(AI_MODELS[1], combined, language),
			sendPrompt(AI_MODELS[4], combined, language),
		];

		// Results will contain an array of promise responses
		const results = await Promise.allSettled(priorityBatch);

		// Stores the final JSON output
		let summaryAndRefutation = cleanAndReturn(results);

		if (summaryAndRefutation !== null)
		{
			return NextResponse.json(
				{
					success: true, 
					message: "SUCCESS: Polite Refutation message obtained.", 
					data: summaryAndRefutation
				}, 
				{ status: 201 }
			);
		}


		// If priority batches all time out, use Backup Batch instead
		const backupmBatch = [
			sendPrompt(AI_MODELS[2], combined, language),
			sendPrompt(AI_MODELS[3], combined, language),
		];

		const results2 = await Promise.allSettled(backupmBatch);

		summaryAndRefutation = cleanAndReturn(results2);

		if (summaryAndRefutation !== null)
		{
			return NextResponse.json(
				{
					success: true, 
					message: "SUCCESS: Polite Refutation message obtained.", 
					data: summaryAndRefutation
				}, 
				{ status: 201 }
			);
		}
		else
			throw new Error("ERROR: No fulfilled promises detected");

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
                { role: 'system', content: summaryRefutationSystemPrompt(language) },
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

function cleanAndReturn(results: PromiseSettledResult<any>[])
{
	for (const each of results)
	{
		// Take the first fulfilled response of each batch

		if (each.status === "fulfilled" && each.value.choices[0].message.content !== null && each.value.choices[0].message.content !== "")
		{
			const promiseValue = each.value;


			// Obtain raw AI message (which is a stringified JSON)
			const AIMessage = promiseValue.choices[0].message.content;
			if (AIMessage === "" || AIMessage === null)
			{
				// The model did not generate a complete response
				continue ;
			}

			// Clean the AI generated response
			let cleanMessage = AIMessage.replace(/<think>[\s\S]*?<\/think>\s*/g, '').trim();
			cleanMessage = cleanMessage.replace(/```json\s*|```/g, '').trim();


			try
			{
				// Convert response to functional JSON object
				let cleanJSON = JSON.parse(cleanMessage);
				cleanJSON.model = promiseValue.model;
				cleanJSON.gonka_request_id = promiseValue.gonka_request_id;

				// Return first instance of a valid response
				return cleanJSON;
			}
			catch (error)
			{
				// Issue with parsing JSON, AI may have returned a non-input or a non-JSON response
				// Move on to the next completed model
			}
		}
	}

	// Desired response was not obtained, return null
	return null;
}


