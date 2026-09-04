import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest)
{
    const body = await request.json();
    const link = body.link;

    // Verify incoming request is in the correct format
    if (!link)
	{
        return NextResponse.json(
            {
                success: false,
                error: "ERROR: Missing 'link' parameter in request body.",
            },
            { status: 400 }
        );
    }

	try
	{
		const returned = await submitRequest(link);
		const result = await obtainResult(returned.data.id);

		const safetyScore = calculateSafetyScore(result.data.attributes);


		return NextResponse.json(
			{
				success: true,
				message: "SUCCESS: Link scanned.",
				data: safetyScore
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

async function submitRequest(URLToScan: string)
{
	const apiKey = process.env.VIRUSTOTAL_API_KEY;
	if (!apiKey) throw new Error("VIRUSTOTAL_API_KEY is not configured.");

	// Initialize POST request
	const options = {
		method: "POST",
		headers: {
			accept: "application/json",
			"content-type": "application/x-www-form-urlencoded",
			"x-apikey": apiKey
		},
		body: new URLSearchParams({url: URLToScan})
	};

	// Fetch response from VirusTotal API
	try
	{
		const response = await fetch("https://www.virustotal.com/api/v3/urls", options);
		const data = await response.json();

		// Check if the provided link produces a valid response
		if ("error" in data)
			throw new Error("ERROR: " + data.error.message);

		return data;
	}
	catch (error)
	{
		throw new Error(error instanceof Error ? error.message : "Unknown error.");
	}
}

async function obtainResult(analysisID: string)
{
	const apiKey = process.env.VIRUSTOTAL_API_KEY;
	if (!apiKey) throw new Error("VIRUSTOTAL_API_KEY is not configured.");

	// Initialize GET request
	const options = {
		method: "GET",
		headers: {
			accept: "application/json",
			"x-apikey": apiKey
		}
	};

	// Fetch response from VirusTotal API
	try
	{
		let reviewResults;
		let numOfLoops = 0;

		while(numOfLoops < 4)
		{
			const response = await fetch(`https://www.virustotal.com/api/v3/analyses/${analysisID}`, options);
			reviewResults = await response.json();

			if (reviewResults.data.attributes.status === "completed")
				break ;

			// VirusTotal RPM limit == 4
			await new Promise(resolve => setTimeout(resolve, 15000));
			numOfLoops++;
		}

		if (numOfLoops === 4)
			throw new Error("ERROR: Aborted due to long wait time.");

		return reviewResults;
	}
	catch (error)
	{
		throw new Error(error instanceof Error ? error.message : "Unknown error.");
	}
}

// VirusTotal's attribute payload is large and not worth fully typing here.
function calculateSafetyScore(linkAttributes: any)
{
	// If any one of these Vendors flag a link as "malicious", return "DANGEROUS" immediately
	const SIGNIFICANT_VENDORS = [
		"Google Safe Browsing",
		"Kaspersky",
		"Sophos",
		"Fortinet",
		"BitDefender",
		"ESET",
		"Forcepoint ThreatSeeker",
	];

	// Extract stats and results field from VirusTotal JSON object
	const linkStats = linkAttributes.stats;
	const allResults = linkAttributes.results;

	// Extract total number of each verdict
	const malicious = linkStats.malicious || 0;
	const suspicious = linkStats.suspicious || 0;
	const harmless = linkStats.harmless || 0;
	const undetected = linkStats.undetected || 0;

	// Calculate Active Vendors, Ignore timeouts, unrated, etc.
	const activeVendors = malicious + suspicious + harmless + undetected;

	// At least 5 Vendors are required to determine link safety
	if (activeVendors < 5)
	{
		return {
			rating: "INSUFFICIENT_DATA",
			score: null,
			significantTriggered: false,
			triggeredBy: null,
			maliciousDetections: 0,
			suspiciousDetections: 0,
			totalActiveVendors: activeVendors,
		};
	}

	// Go through all verdicts to check if any Significant Vendor has been triggered
	const triggeredSignificantVendor = SIGNIFICANT_VENDORS.find((vendor) => {
		const vendorResult = allResults[vendor];

		if (vendorResult !== undefined && vendorResult !== null)
		{
			if (vendorResult.category === "malicious")
				return true;
		}
		return false;
	});

	// If a Significant Vendor has been triggered
	if (triggeredSignificantVendor)
	{
		return {
			rating: "DANGEROUS",
			score: 0,
			significantTriggered: true,
			triggeredBy: triggeredSignificantVendor,
			maliciousDetections: malicious,
			suspiciousDetections: suspicious,
			totalActiveVendors: activeVendors,
		};
	}

	// Malicious & Suspicious verdicts heavily penalizes final score
	const penalty = malicious * 15 + suspicious * 7.5;
	const rawScore = 100 - penalty;
	const safetyScore = Math.max(0, Math.min(100, Math.round(rawScore)));

	// Determine Safety Rating
	let rating = "SAFE";
	if (malicious >= 3 || safetyScore <= 30)
		rating = "DANGEROUS";
	else if (suspicious >= 2 || safetyScore <= 70)
		rating = "SUSPICIOUS";
	else if (safetyScore < 95)
		rating = "CAUTION";

	return {
		rating: rating,
		score: safetyScore,
		significantTriggered: false,
		triggeredBy: null,
		maliciousDetections: malicious,
		suspiciousDetections: suspicious,
		totalActiveVendors: activeVendors,
	};
}


