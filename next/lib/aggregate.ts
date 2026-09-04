import { NextResponse } from "next/server";
import { CLAIM_MODEL_WEIGHTS, IMAGE_MODEL_WEIGHTS, verdictTrustScores } from "./global_variables.ts";


/*------[Aggregate Function (Logic Computation)]------*/

export function aggregate(promiseResults, mode)
{
	// Stores functional JSON objects containing verdict and flags returned from each model
	let cleanJSONs = [];

	// Collect verdicts of each model
	for (const eachResult of promiseResults)
	{
		const promiseValue = eachResult.value;


		// Obtain raw AI message (which is a stringified JSON)
		const AIMessage = promiseValue.choices[0].message.content;
		if (AIMessage === "" || AIMessage === null)
		{
			// The model did not generate a complete response
			continue ;
		}

		// Clean AI's message in case of any extra wording (mandatory for MiniMax)
		let cleanMessage = AIMessage.replace(/<think>[\s\S]*?<\/think>\s*/g, '').trim();
		cleanMessage = cleanMessage.replace(/```json\s*|```/g, '').trim();

		//console.log(cleanMessage + '\n');

		try
		{
			// Convert response to functional JSON object
			let cleanJSON = JSON.parse(cleanMessage);
			cleanJSON.model = promiseValue.model;
			cleanJSONs.push(cleanJSON);
		}
		catch (error)
		{
			// Issue with parsing JSON, AI may have returned a non-input or a non-JSON response
			// Move on to the next completed model
		}
	}

	/*------[Determining Significant Verdicts]------*/

	// Structure to store the highest verdict and number of votes
	let significantVerdicts = 0;

	// Determine verdict with the highest count
	for (const each in cleanJSONs)
	{
		if (each.claim_verdict !== "CANNOT_BE_VERIFIED")
			significantVerdicts++;
	}



	/*------[Trust Score and Final Verdict computation]------*/

	let chosenWeight;
	let minSignificantVerdicts;

	if (mode === "claim")
	{
		chosenWeight = CLAIM_MODEL_WEIGHTS;
		minSignificantVerdicts = 2;
	}
	else if (mode === "image")
	{
		chosenWeight = IMAGE_MODEL_WEIGHTS;
		minSignificantVerdicts = 2;
	}
	else
		throw new Error("ERROR: Invalid aggregate mode.");


	// Ensure Model Weight is immutable
	const modelWeights = chosenWeight;


	// aggregate() return format
	let finalVerdict = {
		"claim_verdict": null,
		"trust_score": 0,
		"individual_responses": []
	};


	if (significantVerdicts >= minSignificantVerdicts)
	{
		let totalTrustScore = 0;
		let totalModelWeight = 0;

		for (const each of cleanJSONs)
		{
			if (each.claim_verdict !== "CANNOT_BE_VERIFIED")
			{
				totalTrustScore += (verdictTrustScores[each.claim_verdict] * modelWeights[each.model]);
				totalModelWeight += modelWeights[each.model];
				if (Number.isNaN(totalModelWeight))
					throw new Error("ERROR: Total Trust Score computed a NaN.");
			}
		}
		
		const finalTrustScore = totalTrustScore / totalModelWeight;

		if (finalTrustScore < 12.5)
			finalVerdict.claim_verdict = "FALSE";
		else if (finalTrustScore < 37.5)
			finalVerdict.claim_verdict = "LIKELY_FALSE";
		else if (finalTrustScore < 62.5)
			finalVerdict.claim_verdict = "PARTIALLY_TRUE";
		else if (finalTrustScore < 87.5)
			finalVerdict.claim_verdict = "LIKELY_TRUE";
		else
			finalVerdict.claim_verdict = "TRUE";

		if (finalTrustScore < 100)
			finalVerdict.trust_score = Math.round(finalTrustScore);
		else if (finalTrustScore >= 100)
			finalVerdict.trust_score = 100;
		else
			throw new Error("ERROR: Invalid final trust score.")

	}
	else
	{
		finalVerdict.claim_verdict = "CANNOT_BE_VERIFIED";
		finalVerdict.trust_score = null;
	}



	/*------[Store individual verdict of each model]------*/

	let count = 0;
	for (const each of promiseResults)
	{
		try
		{
			let individualResponse = { model: each.value.model, verdict: cleanJSONs[count].claim_verdict, green_flags: cleanJSONs[count].green_flags, red_flags: cleanJSONs[count].red_flags };

			if (each.value.gonka_request_id)
				individualResponse.gonka_request_id = each.value.gonka_request_id;

			finalVerdict.individual_responses.push(individualResponse);
		}
		catch (error)
		{
			throw new Error("Either 'each' is invalid, or cleanJSONs is invalid: " + error.message);
		}
		count++;
	}

	return finalVerdict; 
}



/*
// Debuggers

		console.log(`\n----[${promiseValue.model}]----`);
		console.log(`Finish reason : ${JSON.stringify(promiseValue.choices[0].finish_reason)}`);
		console.log(`${JSON.stringify(promiseValue.usage)}\n`);

		console.log(`promiseValue : ${JSON.stringify(promiseValue)}\n`);

		console.log(`AIMessage : "${AIMessage}"\n`);


	console.log(`${JSON.stringify(highest)}`);

	for (const each of cleanJSONs)
	{
		console.log(JSON.stringify(each));
	}

				console.log(verdictTrustScores[each.claim_verdict]);
				console.log(modelWeights[each.model]);

		console.log(sumOfTrustScore);

			console.log(`${JSON.stringify(each)}`);
			console.log(each.value.model);

			//console.log(`${JSON.stringify(individualResponse)}`);


*/

	
	/*
	// If there is a clear majority, follow majority verdict and pre-defined score
	if (highest.num_votes == 3 || highest.num_votes == 2)
	{
		finalVerdict.claim_verdict = highest.verdict;
		finalVerdict.trust_score = verdictTrustScores[highest.verdict];
	}
	// If no clear majority, resolve dispute by calculating trust score, then decide the verdict
	else if (highest.num_votes == 1)
	{
		let sumOfTrustScore = 0;
		let significantVerdicts = 0;

		// Combine trust scores of each different verdict
		for (const each in verdictCount)
		{
			if (verdictCount[each] == 1 && each != "CANNOT_BE_VERIFIED")
			{
				sumOfTrustScore += verdictTrustScores[each];
				significantVerdicts++ ;
			}
		}

		// Calculate resulting trust score
		const resultingTrustScore = sumOfTrustScore / significantVerdicts;
		console.log(resultingTrustScore);

		let resultingVerdict;

		// Determine resulting verdict
		if (resultingTrustScore == 100)
			resultingVerdict = "TRUE";
		else if (resultingTrustScore >= 75 && resultingTrustScore < 100)
			resultingVerdict = "LIKELY_TRUE";
		else if (resultingTrustScore > 25 && resultingTrustScore < 75)
			//might change this
			resultingVerdict = "PARTIALLY_TRUE";
		else if (resultingTrustScore > 0 && resultingTrustScore <= 25)
			resultingVerdict = "LIKELY_FALSE";
		else
			resultingVerdict = "FALSE";

		finalVerdict.claim_verdict = resultingVerdict;
		finalVerdict.trust_score = resultingTrustScore;
	}
	else
	{
		throw new Error("High");
	}
	*/
