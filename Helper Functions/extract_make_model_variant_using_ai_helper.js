// Helpers/extract_make_model_variant_using_ai_helper.js
const CarMakeModelVariantModel = require("../Models/carMakeModelVariantModel");
const openai = require("../Config/openai");

const MODEL_NAME = process.env.OPENAI_NORMALIZER_MODEL || "gpt-5-mini";
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

let cache = {
  rows: null,
  pairMap: null,
  tripleMap: null,
  lastLoadedAt: 0,
};

function safeString(value) {
  return String(value || "").trim();
}

function normalizeUpper(value) {
  return safeString(value).toUpperCase();
}

function normalizeLoose(value) {
  return normalizeUpper(value)
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function makePairKey(make, model) {
  return `${normalizeUpper(make)}||${normalizeUpper(model)}`;
}

function makeTripleKey(make, model, variant) {
  return `${normalizeUpper(make)}||${normalizeUpper(model)}||${normalizeUpper(variant)}`;
}

function tokenize(value) {
  return normalizeLoose(value)
    .split(" ")
    .map((x) => x.trim())
    .filter(Boolean);
}

async function loadAllowedMakeModelVariant() {
  const now = Date.now();

  if (
    cache.rows &&
    cache.pairMap &&
    cache.tripleMap &&
    now - cache.lastLoadedAt < CACHE_TTL_MS
  ) {
    return cache;
  }

  const docs = await CarMakeModelVariantModel.find({ isActive: true })
    .select("fullName make model variant -_id")
    .lean();

  const seenTriples = new Set();
  const rows = [];
  const pairMap = new Map();
  const tripleMap = new Map();

  for (const doc of docs) {
    const make = safeString(doc.make);
    const model = safeString(doc.model);
    const variant = safeString(doc.variant);
    const fullName = safeString(doc.fullName);

    if (!make || !model) {
      continue;
    }

    const tripleKey = makeTripleKey(make, model, variant);
    if (seenTriples.has(tripleKey)) {
      continue;
    }
    seenTriples.add(tripleKey);

    const row = {
      fullName,
      make,
      model,
      variant,
      makeUpper: normalizeUpper(make),
      modelUpper: normalizeUpper(model),
      variantUpper: normalizeUpper(variant),
      fullNameUpper: normalizeUpper(fullName),
      makeLoose: normalizeLoose(make),
      modelLoose: normalizeLoose(model),
      variantLoose: normalizeLoose(variant),
      fullNameLoose: normalizeLoose(fullName),
      makeTokens: tokenize(make),
      modelTokens: tokenize(model),
      variantTokens: tokenize(variant),
      fullNameTokens: tokenize(fullName),
    };

    rows.push(row);

    const pairKey = makePairKey(make, model);
    if (!pairMap.has(pairKey)) {
      pairMap.set(pairKey, {
        make,
        model,
        variants: new Map(),
      });
    }

    if (variant) {
      pairMap.get(pairKey).variants.set(normalizeUpper(variant), variant);
    }

    tripleMap.set(tripleKey, {
      make,
      model,
      variant,
    });
  }

  cache = {
    rows,
    pairMap,
    tripleMap,
    lastLoadedAt: now,
  };

  return cache;
}

function intersectionCount(arr1, arr2) {
  const set2 = new Set(arr2);
  let count = 0;
  for (const item of arr1) {
    if (set2.has(item)) {
      count += 1;
    }
  }
  return count;
}

function scoreRow(row, makerDescription, makerModel) {
  const descUpper = normalizeUpper(makerDescription);
  const modelUpper = normalizeUpper(makerModel);
  const combinedUpper = normalizeUpper(`${makerDescription} ${makerModel}`);

  const descLoose = normalizeLoose(makerDescription);
  const modelLoose = normalizeLoose(makerModel);
  const combinedLoose = normalizeLoose(`${makerDescription} ${makerModel}`);

  const makerModelTokens = tokenize(makerModel);
  const combinedTokens = tokenize(`${makerDescription} ${makerModel}`);

  let score = 0;

  // Make matching
  if (row.makeUpper && descUpper === row.makeUpper) score += 120;
  else if (row.makeLoose && descLoose.includes(row.makeLoose)) score += 100;
  else if (row.makeLoose && combinedLoose.includes(row.makeLoose)) score += 60;

  // Model matching
  if (row.modelUpper && modelUpper === row.modelUpper) score += 180;
  else if (row.modelLoose && modelLoose.includes(row.modelLoose)) score += 150;
  else if (row.modelLoose && combinedLoose.includes(row.modelLoose)) score += 100;

  // Full name matching
  if (row.fullNameLoose && combinedLoose.includes(row.fullNameLoose)) {
    score += 220;
  }

  // Variant matching
  if (row.variantLoose && modelLoose.includes(row.variantLoose)) {
    score += 45;
  } else if (row.variantLoose && combinedLoose.includes(row.variantLoose)) {
    score += 25;
  }

  // Token overlap on model
  const modelTokenHits = intersectionCount(row.modelTokens, makerModelTokens);
  score += modelTokenHits * 12;

  // Token overlap on full text
  const fullTokenHits = intersectionCount(row.fullNameTokens, combinedTokens);
  score += fullTokenHits * 4;

  return score;
}

function getTopCandidates(rows, makerDescription, makerModel, limit = 40) {
  const scored = rows
    .map((row) => ({
      row,
      score: scoreRow(row, makerDescription, makerModel),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  // Keep balanced candidates: top pairs with some variants
  const pairCounts = new Map();
  const result = [];

  for (const item of scored) {
    const pairKey = makePairKey(item.row.make, item.row.model);
    const currentCount = pairCounts.get(pairKey) || 0;

    if (currentCount >= 5) {
      continue;
    }

    result.push(item);
    pairCounts.set(pairKey, currentCount + 1);

    if (result.length >= limit) {
      break;
    }
  }

  return result;
}

function buildSystemPrompt(candidateRows) {
  const candidateBlock = candidateRows
    .map(
      ({ row }) =>
        `- MAKE: ${row.make} | MODEL: ${row.model} | VARIANT: ${row.variant || ""}`
    )
    .join("\n");

  return `
You are a strict extractor for car make, model and variant.

Input:
- makerDescription: noisy manufacturer text
- makerModel: model text, sometimes also contains variant/trim

Task:
- Return exactly one JSON object:
{"make":"...","model":"...","variant":"..."}

Rules:
1) You MUST choose make and model only from the candidate catalog below.
2) Variant is optional.
3) If variant is clearly present or confidently inferable from input and exists in candidate catalog, return it.
4) If variant is not clear, return empty string for "variant".
5) Do not invent values.
6) Output VALID JSON only. No markdown. No explanation. No extra text.

Candidate Catalog:
${candidateBlock}
`.trim();
}

async function callOpenAIForNormalization({ systemPrompt, makerDescription, makerModel }) {
  try {
    const response = await openai.responses.create({
      model: MODEL_NAME,
      input: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: JSON.stringify({
            makerDescription,
            makerModel,
          }),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "MakeModelVariantOnly",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              make: { type: "string" },
              model: { type: "string" },
              variant: { type: "string" },
            },
            required: ["make", "model", "variant"],
          },
          strict: true,
        },
      },
    });

    const outputText =
      response.output_text ||
      response?.output?.[0]?.content?.[0]?.text ||
      null;

    return {
      ok: true,
      text: outputText,
    };
  } catch (error) {
    console.error("OpenAI normalization error:", {
      status: error?.status || error?.response?.status,
      message: error?.message,
    });

    return {
      ok: false,
      text: null,
    };
  }
}

function parseStrictJson(text) {
  try {
    return {
      ok: true,
      data: JSON.parse(text),
    };
  } catch (error) {
    return {
      ok: false,
      data: null,
    };
  }
}

function validateAndNormalizeResult({ pairMap, tripleMap, make, model, variant }) {
  const cleanMake = safeString(make);
  const cleanModel = safeString(model);
  const cleanVariant = safeString(variant);

  if (!cleanMake || !cleanModel) {
    return {
      ok: false,
      data: null,
    };
  }

  const pairKey = makePairKey(cleanMake, cleanModel);
  const pairEntry = pairMap.get(pairKey);

  if (!pairEntry) {
    return {
      ok: false,
      data: null,
    };
  }

  let finalVariant = "";

  if (cleanVariant) {
    const tripleKey = makeTripleKey(cleanMake, cleanModel, cleanVariant);
    const tripleEntry = tripleMap.get(tripleKey);

    if (tripleEntry) {
      finalVariant = tripleEntry.variant;
    } else {
      finalVariant = "";
    }
  }

  return {
    ok: true,
    data: {
      make: pairEntry.make,
      model: pairEntry.model,
      variant: finalVariant,
    },
  };
}

function fallbackFromCandidates(candidates, pairMap, makerDescription, makerModel) {
  if (!candidates || candidates.length === 0) {
    return {
      make: "",
      model: "",
      variant: "",
    };
  }

  const top = candidates[0];

  // avoid returning random result on weak match
  if (!top || top.score < 60) {
    return {
      make: "",
      model: "",
      variant: "",
    };
  }

  const pairKey = makePairKey(top.row.make, top.row.model);
  const pairEntry = pairMap.get(pairKey);

  if (!pairEntry) {
    return {
      make: "",
      model: "",
      variant: "",
    };
  }

  let finalVariant = "";
  const modelLoose = normalizeLoose(makerModel);
  const combinedLoose = normalizeLoose(`${makerDescription} ${makerModel}`);

  if (top.row.variantLoose && modelLoose.includes(top.row.variantLoose)) {
    finalVariant = top.row.variant;
  } else if (top.row.variantLoose && combinedLoose.includes(top.row.variantLoose)) {
    finalVariant = top.row.variant;
  } else if (pairEntry.variants.size === 1) {
    finalVariant = Array.from(pairEntry.variants.values())[0] || "";
  }

  return {
    make: pairEntry.make,
    model: pairEntry.model,
    variant: finalVariant || "",
  };
}

async function extractMakeModelVariantUsingAI({ makerDescription, makerModel }) {
  try {
    const cleanMakerDescription = safeString(makerDescription);
    const cleanMakerModel = safeString(makerModel);

    if (!cleanMakerDescription && !cleanMakerModel) {
      return {
        make: "",
        model: "",
        variant: "",
      };
    }

    const { rows, pairMap, tripleMap } = await loadAllowedMakeModelVariant();

    if (!rows || rows.length === 0) {
      console.error("carMakeModelVariant collection is empty.");
      return {
        make: "",
        model: "",
        variant: "",
      };
    }

    const candidates = getTopCandidates(rows, cleanMakerDescription, cleanMakerModel, 40);

    if (!candidates || candidates.length === 0) {
      return {
        make: "",
        model: "",
        variant: "",
      };
    }

    const systemPrompt = buildSystemPrompt(candidates);

    const aiResponse = await callOpenAIForNormalization({
      systemPrompt,
      makerDescription: cleanMakerDescription,
      makerModel: cleanMakerModel,
    });

    if (aiResponse.ok && aiResponse.text) {
      const parsed = parseStrictJson(aiResponse.text);

      if (parsed.ok && parsed.data) {
        const validated = validateAndNormalizeResult({
          pairMap,
          tripleMap,
          make: parsed.data.make,
          model: parsed.data.model,
          variant: parsed.data.variant,
        });

        if (validated.ok) {
          return validated.data;
        }
      }
    }

    // fallback if AI fails or returns invalid output
    return fallbackFromCandidates(
      candidates,
      pairMap,
      cleanMakerDescription,
      cleanMakerModel
    );
  } catch (error) {
    console.error("extractMakeModelVariantUsingAI error:", error.message || error);

    return {
      make: "",
      model: "",
      variant: "",
    };
  }
}

module.exports = {
  extractMakeModelVariantUsingAI,
};