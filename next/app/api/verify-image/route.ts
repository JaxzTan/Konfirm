import OpenAI from "openai";
import {IMAGE_SYSTEM_PROMPT, AI_MODELS} from "@/lib/global_variables";
import { aggregate } from "@/lib/aggregate";
import { NextResponse } from "next/server";

import fs from 'fs';
import path from 'path';

// Response time limit before timeout
export const maxDuration = 120;

export async function POST(request)
{
    const body = await request.json();
    const imageURL = body.imageURL;

    // Verify incoming request is in the correct format
    if (!imageURL) {
        return NextResponse.json(
            {
                success: false,
                error: "ERROR: Missing 'imageURL' parameter in request body.",
            },
            { status: 400 }
        );
    }

	// Convert image into Base 64
	const imagePath = path.join(process.cwd(), 'public', imageURL);
	const imageBase64 = fs.readFileSync(imagePath, { encoding: 'base64' });
	const base64URL = `data:image/png;base64,${imageBase64}`;

	try
	{
		const responses = [
			sendPrompt(AI_MODELS[3], base64URL),
			sendPrompt(AI_MODELS[4], base64URL),
		];

		// results will contain an array of promise responses
		const results = await Promise.allSettled(responses);

		let fulfilledPromises = [];
		for (const each of results)
		{
			if (each.status === "fulfilled")
			{
				fulfilledPromises.push(each);

			}
		}

		if (fulfilledPromises.length > 0)
		{
			const finalVerdict = await aggregate(fulfilledPromises, "image");
			
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
		throw new Error("Client ERROR: " + error.message);
	}

	try
	{
		if ([AI_MODELS[3], AI_MODELS[4]].includes(chosenModel))
		{
			const response = await client.chat.completions.create({
				model: chosenModel,
				max_tokens: 550,
				messages: [
					{ role: 'system', content: IMAGE_SYSTEM_PROMPT },
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
		throw new Error(`ERROR: Request to ${chosenModel} was aborted due to: ` + error.message);
	}
}

