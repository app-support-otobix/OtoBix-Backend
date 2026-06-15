// Config/openai.js
const OpenAI = require("openai");
require("dotenv").config();

const openai = new OpenAI({
  apiKey: process.env.OPEN_AI_API_KEY,
});

module.exports = openai;