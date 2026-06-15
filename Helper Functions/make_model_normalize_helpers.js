// Helpers/make_model_normalize_helpers.js
const CarPricesForPdiModel = require("../Models/carPricesForPdiModel");
const openai = require("../Config/openai");

const MODEL_NAME = "gpt-5-mini"; // change if needed

// Small in-memory cache so DB isn't hit every request
let cache = {
  promptBlock: null,
  allowedSet: null,
  lastLoadedAt: 0,
};
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 mins

function normalizeUpper(v) {
  return String(v || "").trim().toUpperCase();
}

async function loadAllowedMakeModel() {
  const now = Date.now();
  if (cache.promptBlock && cache.allowedSet && now - cache.lastLoadedAt < CACHE_TTL_MS) {
    return cache;
  }

  const rows = await CarPricesForPdiModel.aggregate([
    {
      $match: {
        make: { $type: "string" },
        model: { $type: "string" },
      },
    },
    {
      $group: {
        _id: {
          make: { $toUpper: "$make" },
          model: { $toUpper: "$model" },
        },
      },
    },
    { $project: { _id: 0, make: "$_id.make", model: "$_id.model" } },
  ]);

  rows.sort((a, b) => {
    if (a.make !== b.make) return a.make.localeCompare(b.make);
    return a.model.localeCompare(b.model);
  });

  const promptBlock = rows.map((x) => `- ${x.make} | ${x.model}`).join("\n");
  const allowedSet = new Set(rows.map((x) => `${x.make}||${x.model}`));

  cache = { promptBlock, allowedSet, lastLoadedAt: now };
  return cache;
}

function buildSystemPrompt(allowedPromptBlock) {
  // Keep stable for prompt caching
  return `
You are a strict normalizer for car MAKE and MODEL.

Goal:
- Input has: makerDescription (noisy make) and makerModel (model + variant/trim).
- Output MUST be exactly one JSON object: {"make":"...","model":"..."}.

Hard Rules:
1) You MUST choose make and model ONLY from the Allowed Pairs list below.
2) makerDescription may include company/legal suffix words. Extract correct MAKE from allowed list.
3) makerModel includes model + variant/trim words. Remove variant/trim and select correct MODEL from allowed list.
4) Output must be VALID JSON only. No extra text. No markdown. No explanation.
5) Only keys allowed: "make", "model".
6) If multiple matches, pick the closest allowed pair.

Allowed Pairs (authoritative):
${allowedPromptBlock}
`.trim();
}

const jsonSchema = {
  name: "MakeModelOnly",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      make: { type: "string" },
      model: { type: "string" },
    },
    required: ["make", "model"],
  },
  strict: true,
};

// OpenAI call (system errors are NOT returned to user, only logged)
async function callOpenAIForNormalization({ systemPrompt, makerDescription, makerModel }) {
  try {
    const resp = await openai.responses.create({
      model: MODEL_NAME,
      input: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: JSON.stringify({ makerDescription, makerModel }),
        },
      ],

      // ✅ NEW way (Responses API)
      text: {
        format: {
          type: "json_schema",
          name: "MakeModelOnly",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              make: { type: "string" },
              model: { type: "string" },
            },
            required: ["make", "model"],
          },
          strict: true,
        },
      },
    });

    // Some SDK versions return output_text, others return output[...]
    const outputText = resp.output_text || resp?.output?.[0]?.content?.[0]?.text;

    return { ok: true, text: outputText };
  } catch (err) {
    console.error("OpenAI error:", {
      status: err?.status || err?.response?.status,
      message: err?.message,
    });
    return { ok: false, text: null };
  }
}

function parseStrictJson(text) {
  try {
    return { ok: true, data: JSON.parse(text) };
  } catch {
    return { ok: false, data: null };
  }
}

function validateInAllowedList({ allowedSet, make, model }) {
  const mk = normalizeUpper(make);
  const md = normalizeUpper(model);
  const key = `${mk}||${md}`;
  return { ok: allowedSet.has(key), make: mk, model: md };
}


async function getFinalNormalizedMakeModel({ makerDescription, makerModel }) {
  if (!makerDescription || !makerModel) {
    return {
      ok: false,
      message: "makerDescription and makerModel are required",
      data: null,
    };
  }

  // Load allowed list
  const { promptBlock, allowedSet } = await loadAllowedMakeModel();

  if (!promptBlock || promptBlock.length === 0) {
    console.log("Allowed make/model list is empty in database.");
    return {
      ok: false,
      message: "Allowed make/model list is empty in database.",
      data: null,
    };
  }

  const systemPrompt = buildSystemPrompt(promptBlock);

  // Call OpenAI
  const ai = await callOpenAIForNormalization({
    systemPrompt,
    makerDescription,
    makerModel,
  });

  if (!ai.ok) {
    return {
      ok: false,
      message: "Unable to process right now. Please try again later.",
      data: null,
    };
  }

  // Parse JSON
  const parsed = parseStrictJson(ai.text);
  if (!parsed.ok) {
    console.log("Unable to normalize this input right now. Please retry.");
    return {
      ok: false,
      message: "Unable to normalize this input right now. Please retry.",
      data: null,
    };
  }

  const { make, model } = parsed.data || {};
  if (!make || !model) {
    console.log("Normalization failed. Please retry.");
    return {
      ok: false,
      message: "Normalization failed. Please retry.",
      data: null,
    };
  }

  // Validate in allowed list
  const v = validateInAllowedList({ allowedSet, make, model });
  if (!v.ok) {
    console.log("No valid make/model found from allowed list for this input.");
    return {
      ok: false,
      message: "No valid make/model found from allowed list for this input.",
      data: null,
    };
  }

  return {
    ok: true,
    message: "Normalized successfully",
    data: {
      make: v.make,
      model: v.model,
    },
  };
}

module.exports = {
  getFinalNormalizedMakeModel,
};