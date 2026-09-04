import OpenAI from "openai";
import {CLAIM_SYSTEM_PROMPT, AI_MODELS} from "@/lib/global_variables";
import { aggregate } from "@/lib/aggregate";
import { NextResponse } from "next/server";

// Response time limit before timeout
export const maxDuration = 120;

export async function POST(request)
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
		const responses = [
			sendPrompt(AI_MODELS[0], claim),
			sendPrompt(AI_MODELS[1], claim),
			sendPrompt(AI_MODELS[2], claim),
			sendPrompt(AI_MODELS[3], claim),
			sendPrompt(AI_MODELS[4], claim),
		];

		// results will contain an array of promise responses
		const results = await Promise.allSettled(responses);

		let fulfilledPromises = [];
		for (const each of results)
		{
			if (each.status === "fulfilled" && each.value.choices[0].message.content !== null && each.value.choices[0].message.content !== "")
			{
				//console.log(`\n${each.value.model} responded`);
				fulfilledPromises.push(each);
			}
		}

		if (fulfilledPromises.length > 0)
		{
			//console.log(`Gonna run aggregate`);
			const finalVerdict = await aggregate(fulfilledPromises, "claim");
			//console.log("\nFinal Verdict :\n" + `${JSON.stringify(finalVerdict, null, 2)}` + "\n");

			return NextResponse.json(
				{
					success: true, 
					message: "SUCCESS: Final Verdict obtained.", 
					data: finalVerdict
				}, 
				{ status: 201 }
			);
		}
		else
			throw new Error("No fulfilled promises detected");

	}
	catch (error)
	{
		return NextResponse.json(
			{ 
				success: false, 
				error: error.message
			}, 
			{ status: 500 }
		);
	}

}

/*------[Send User Prompt to a Model for processing]------*/

async function sendPrompt(chosenModel, userInput)
{
	const abortController = new AbortController();

	// Timeout for 30s
	const timeoutID = setTimeout(() => {
		abortController.abort();
	}, 30000);

	const incomingPrompt = userInput;

	let client = null;

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
					"X-Gonka-No-Fallback": true
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
		throw new Error("Client ERROR: " + error.message);
	}

	// Submit request to Gonka Router
	try
	{
		// For Kimi, Deepseek, and Gemini Models
		if (!(chosenModel === AI_MODELS[2]))
		{
			const response = await client.chat.completions.create({
				model: chosenModel,
				max_tokens: 550,
				messages: [
					{ role: 'system', content: CLAIM_SYSTEM_PROMPT },
					{ role: 'user', content: incomingPrompt }
				],
			},
			{
				signal: abortController.signal
			});

			clearTimeout(timeoutID);
			return response;
		}
		// For MiniMax because requires extra max_tokens due to <think> block
		else
		{
			const response = await client.chat.completions.create({
				model: chosenModel,
				max_tokens: 1024,
				messages: [
					{ role: 'system', content: CLAIM_SYSTEM_PROMPT },
					{ role: 'user', content: incomingPrompt }
				],
			},
			{
				signal: abortController.signal
			});

			clearTimeout(timeoutID);
			return response;
		}

	}
	catch (error)
	{
		clearTimeout(timeoutID);
		throw new Error(`ERROR: Request to ${chosenModel} was aborted due to: ` + error.message);
	}
}


/*

				console.log(`${JSON.stringify(each.value)}`);
				console.log(`${JSON.stringify(each.value.choices[0].message.content)}`);
				console.log(`${JSON.stringify(each.value.choices[0].reasoning)}`);
				console.log(`${JSON.stringify(each.value.usage)}`);


*/
