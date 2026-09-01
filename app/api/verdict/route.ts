import { NextRequest, NextResponse } from "next/server";

// Demo trigger words so every state is testable without real Gonka — keyed
// by locale so the mock content matches whatever language the request asked
// for. TODO: replace this whole file with real GonkaRouter calls + aggregate().
const mockResponses = {
  en: {
    true: {
      state: "true",
      score: 87,
      verdict: "Likely True",
      description: "This matches an official government announcement.",
      flags: ["Matches official government statement", "Date and source are verifiable"],
      modelCount: 3,
      models: [
        { name: "DeepSeek", score: 89, reasoning: "Confirmed by official finance ministry statement.", requestId: "gonka-9j3k1p" },
        { name: "Kimi", score: 85, reasoning: "Matches published government records.", requestId: "gonka-2h8n4q" },
        { name: "MiniMax", score: 87, reasoning: "Consistent with official timeline.", requestId: "gonka-7t5m3x" },
      ],
    },
    degraded: {
      state: "false",
      score: 22,
      verdict: "Likely False",
      description: "This claim does not match any verified sources.",
      flags: ["No original source or date included", "Uses urgency language"],
      modelCount: 2,
      models: [
        { name: "DeepSeek", score: 18, reasoning: "No credible source found supporting this claim.", requestId: "gonka-8k2p9x" },
        { name: "Kimi", score: 25, reasoning: "Contradicts established government information.", requestId: "gonka-3nq7w2" },
      ],
    },
    disputed: {
      state: "disputed",
      title: "Models Disagree",
      description: "The AI models that checked this claim did not agree with each other. No single score is shown — read each side below before deciding.",
      modelCount: 3,
      positions: [
        { stance: "Likely True", models: ["DeepSeek"], reasoning: "Matches a regional news report from earlier this year, though not an official statement." },
        { stance: "Likely False", models: ["Kimi", "MiniMax"], reasoning: "No official source confirms this, and the claim uses classic misinformation patterns (urgency, no date)." },
      ],
    },
    unverifiable: {
      state: "unverifiable",
      title: "Can't Be Verified",
      description: "Most of our models could not find enough evidence and information to judge this claim.",
      note: "This claim references a private or unverifiable source. There is no public record to check against it. This does not mean it is false.",
      modelCount: 3,
    },
    insufficient: {
      state: "insufficient",
      title: "We couldn't finish checking this",
      description: "Only 1 of 3 AI models responded in time. This is a system issue on our end, not a judgment about your claim.",
      respondedModel: { name: "DeepSeek", score: 15, reasoning: "No news reports match this claim.", requestId: "gonka-4p9k7z" },
      timedOutModels: ["Kimi", "MiniMax"],
      modelCount: 1,
    },
    false: {
      state: "false",
      score: 25,
      verdict: "Likely False",
      description: "This claim does not match any verified sources.",
      flags: ["No original source or date included", "Uses urgency language", "Claims a vague, unnamed source"],
      modelCount: 3,
      models: [
        { name: "DeepSeek", score: 18, reasoning: "No credible source found supporting this claim.", requestId: "gonka-8k2p9x" },
        { name: "Kimi", score: 25, reasoning: "Contradicts established government information.", requestId: "gonka-3nq7w2" },
        { name: "MiniMax", score: 26, reasoning: "Found old timestamp on similar news, likely outdated.", requestId: "gonka-r7y1m8" },
      ],
    },
  },
  bm: {
    true: {
      state: "true",
      score: 87,
      verdict: "Berkemungkinan Benar",
      description: "Ini sepadan dengan pengumuman rasmi kerajaan.",
      flags: ["Sepadan dengan kenyataan rasmi kerajaan", "Tarikh dan sumber boleh disahkan"],
      modelCount: 3,
      models: [
        { name: "DeepSeek", score: 89, reasoning: "Disahkan oleh kenyataan rasmi kementerian kewangan.", requestId: "gonka-9j3k1p" },
        { name: "Kimi", score: 85, reasoning: "Sepadan dengan rekod kerajaan yang diterbitkan.", requestId: "gonka-2h8n4q" },
        { name: "MiniMax", score: 87, reasoning: "Konsisten dengan garis masa rasmi.", requestId: "gonka-7t5m3x" },
      ],
    },
    degraded: {
      state: "false",
      score: 22,
      verdict: "Berkemungkinan Palsu",
      description: "Dakwaan ini tidak sepadan dengan mana-mana sumber yang disahkan.",
      flags: ["Tiada sumber atau tarikh asal disertakan", "Menggunakan bahasa mendesak"],
      modelCount: 2,
      models: [
        { name: "DeepSeek", score: 18, reasoning: "Tiada sumber yang boleh dipercayai menyokong dakwaan ini.", requestId: "gonka-8k2p9x" },
        { name: "Kimi", score: 25, reasoning: "Bercanggah dengan maklumat rasmi kerajaan.", requestId: "gonka-3nq7w2" },
      ],
    },
    disputed: {
      state: "disputed",
      title: "Model Tidak Bersetuju",
      description: "Model AI yang menyemak dakwaan ini tidak bersetuju antara satu sama lain. Tiada skor tunggal ditunjukkan — baca setiap pihak di bawah sebelum membuat keputusan.",
      modelCount: 3,
      positions: [
        { stance: "Berkemungkinan Benar", models: ["DeepSeek"], reasoning: "Sepadan dengan laporan berita serantau awal tahun ini, walaupun bukan kenyataan rasmi." },
        { stance: "Berkemungkinan Palsu", models: ["Kimi", "MiniMax"], reasoning: "Tiada sumber rasmi mengesahkan ini, dan dakwaan ini menggunakan corak maklumat palsu klasik (mendesak, tiada tarikh)." },
      ],
    },
    unverifiable: {
      state: "unverifiable",
      title: "Tidak Boleh Disahkan",
      description: "Kebanyakan model kami tidak dapat mencari cukup bukti dan maklumat untuk menilai dakwaan ini.",
      note: "Dakwaan ini merujuk kepada sumber peribadi atau yang tidak dapat disahkan. Tiada rekod awam untuk disemak. Ini tidak bermakna ia palsu.",
      modelCount: 3,
    },
    insufficient: {
      state: "insufficient",
      title: "Kami tidak dapat selesaikan semakan ini",
      description: "Hanya 1 daripada 3 model AI bertindak balas tepat pada masanya. Ini adalah isu sistem di pihak kami, bukan penilaian terhadap dakwaan anda.",
      respondedModel: { name: "DeepSeek", score: 15, reasoning: "Tiada laporan berita sepadan dengan dakwaan ini.", requestId: "gonka-4p9k7z" },
      timedOutModels: ["Kimi", "MiniMax"],
      modelCount: 1,
    },
    false: {
      state: "false",
      score: 25,
      verdict: "Berkemungkinan Palsu",
      description: "Dakwaan ini tidak sepadan dengan mana-mana sumber yang disahkan.",
      flags: ["Tiada sumber atau tarikh asal disertakan", "Menggunakan bahasa mendesak", "Mendakwa sumber yang samar dan tidak dinamakan"],
      modelCount: 3,
      models: [
        { name: "DeepSeek", score: 18, reasoning: "Tiada sumber yang boleh dipercayai menyokong dakwaan ini.", requestId: "gonka-8k2p9x" },
        { name: "Kimi", score: 25, reasoning: "Bercanggah dengan maklumat rasmi kerajaan.", requestId: "gonka-3nq7w2" },
        { name: "MiniMax", score: 26, reasoning: "Menemui cap masa lama pada berita serupa, berkemungkinan lapuk.", requestId: "gonka-r7y1m8" },
      ],
    },
  },
  zh: {
    true: {
      state: "true",
      score: 87,
      verdict: "可能属实",
      description: "这与官方政府公告相符。",
      flags: ["与官方政府声明相符", "日期和来源可核实"],
      modelCount: 3,
      models: [
        { name: "DeepSeek", score: 89, reasoning: "已由财政部官方声明证实。", requestId: "gonka-9j3k1p" },
        { name: "Kimi", score: 85, reasoning: "与已公布的政府记录相符。", requestId: "gonka-2h8n4q" },
        { name: "MiniMax", score: 87, reasoning: "与官方时间线一致。", requestId: "gonka-7t5m3x" },
      ],
    },
    degraded: {
      state: "false",
      score: 22,
      verdict: "可能为假",
      description: "此说法与任何已核实的来源都不相符。",
      flags: ["没有原始来源或日期", "使用紧急语气"],
      modelCount: 2,
      models: [
        { name: "DeepSeek", score: 18, reasoning: "未找到可信来源支持此说法。", requestId: "gonka-8k2p9x" },
        { name: "Kimi", score: 25, reasoning: "与政府官方信息相矛盾。", requestId: "gonka-3nq7w2" },
      ],
    },
    disputed: {
      state: "disputed",
      title: "模型意见分歧",
      description: "核实此说法的 AI 模型之间意见不一致。不显示单一分数——请在下方阅读双方理由后再做判断。",
      modelCount: 3,
      positions: [
        { stance: "可能属实", models: ["DeepSeek"], reasoning: "与今年早些时候的一则地方新闻报道相符，但并非官方声明。" },
        { stance: "可能为假", models: ["Kimi", "MiniMax"], reasoning: "没有官方来源证实，且此说法具有典型的谣言特征（语气紧急、没有日期）。" },
      ],
    },
    unverifiable: {
      state: "unverifiable",
      title: "无法核实",
      description: "大多数模型未能找到足够的证据和信息来判断此说法。",
      note: "此说法引用了私人或无法核实的来源，没有公开记录可供核对。这并不代表它是假的。",
      modelCount: 3,
    },
    insufficient: {
      state: "insufficient",
      title: "我们未能完成此次核实",
      description: "3 个 AI 模型中只有 1 个及时回应。这是我们系统方面的问题，并非对您说法的判断。",
      respondedModel: { name: "DeepSeek", score: 15, reasoning: "没有新闻报道与此说法相符。", requestId: "gonka-4p9k7z" },
      timedOutModels: ["Kimi", "MiniMax"],
      modelCount: 1,
    },
    false: {
      state: "false",
      score: 25,
      verdict: "可能为假",
      description: "此说法与任何已核实的来源都不相符。",
      flags: ["没有原始来源或日期", "使用紧急语气", "声称来自模糊、未具名的来源"],
      modelCount: 3,
      models: [
        { name: "DeepSeek", score: 18, reasoning: "未找到可信来源支持此说法。", requestId: "gonka-8k2p9x" },
        { name: "Kimi", score: 25, reasoning: "与政府官方信息相矛盾。", requestId: "gonka-3nq7w2" },
        { name: "MiniMax", score: 26, reasoning: "发现类似新闻的旧时间戳，可能已过时。", requestId: "gonka-r7y1m8" },
      ],
    },
  },
} as const;

type Locale = keyof typeof mockResponses;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { text, language } = body;

  await new Promise((resolve) => setTimeout(resolve, 2000));

  const locale: Locale = ["en", "bm", "zh"].includes(language) ? language : "en";
  const responses = mockResponses[locale];
  const lowerText = text.toLowerCase();

  if (lowerText.includes("true")) return NextResponse.json(responses.true);
  if (lowerText.includes("degrad") || lowerText.includes("partial")) return NextResponse.json(responses.degraded);
  if (lowerText.includes("dispute") || lowerText.includes("disagree")) return NextResponse.json(responses.disputed);
  if (lowerText.includes("unsure") || lowerText.includes("unverif")) return NextResponse.json(responses.unverifiable);
  if (lowerText.includes("insuff") || lowerText.includes("fail")) return NextResponse.json(responses.insufficient);

  return NextResponse.json(responses.false);
}
