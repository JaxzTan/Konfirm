//import * as tests from "";
import * as test_inputs from "./test_inputs";
import * as test_images from "./test_images";
import * as test_links from "./test_links";
import * as test_verdicts from "./test_verdicts";
import { NextResponse } from "next/server";

export async function GET()
{
	try
	{
		console.log("Program start!\n");

		// Declared outside the commented-out blocks below: whichever test path
		// is active, the sum-and-refute call further down still needs it.
		const userClaim = test_inputs.chcorrect1;

		/*
		// Verify Claim
		const response = await fetch(`https://localhost:3400/api/verify-claim`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				claim: userClaim,
			}),
		});
		*/
		
		// Verify Image
		const response = await fetch(`https://localhost:3400/api/verify-image`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				imageURL: test_images.chpcorrect1,
			}),
		});

		/*
		// Scan Link
		const response = await fetch(`https://localhost:3400/api/scan-link`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				link: test_links.safe1,
			}),
		});
		*/

	   let success;

	   // Response for Claims, Links and Images
		const responseJSONified = await response.json();

		if (responseJSONified.error)
		{
			throw new Error(responseJSONified.error);
		}
		else
		{
			console.log(JSON.stringify(responseJSONified.data, null, 2));
		}
		success = responseJSONified.message;



		// Summary and Polite Refutation
		const response2 = await fetch(`https://localhost:3400/api/sum-and-refute`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				"original_message": userClaim,
				"final_verdict": response,
				//"final_verdict": test_verdicts.verdict1,
			}),
		});

	   // Response for Summary and Polite Refutation
		const responseJSONified2 = await response2.json();

		if (responseJSONified2.error)
		{
			throw new Error(responseJSONified2.error);
		}
		else
		{
			console.log(JSON.stringify(responseJSONified2.data, null, 2));
		}
		success = responseJSONified2.message;


		console.log("Program end.");

		return NextResponse.json(
			{
				success: true,
				message: success
			}, 
			{ status: 201 }
		);
	}
	catch (error)
	{
		return NextResponse.json(
			{
				success: false,
				error: error instanceof Error ? error.message : String(error)
			}, 
			{ status: 500 }
		);
	}
}

