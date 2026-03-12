const express = require("express");
const fs = require("fs");
const path = require("path");
const Groq = require("groq-sdk");

const router = express.Router();

// Load env
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

if (!process.env.GROQ_API_KEY) {
  console.error("❌ GROQ_API_KEY missing");
}

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// Brain file path
const brainFilePath = path.join(__dirname, "..", "ai", "pranapath-brain.md");

// Fallbacks
const FALLBACK =
  "Sorry, I’m having trouble responding right now. Please try again.";

const FALLBACK_SCOPE =
  "I can only help with Pranapath-related information.";

// 🔹 System prompt
function buildSystemPrompt(brain, role, page) {
  return `
You are the Pranapath AI Assistant for a medical emergency platform.

You must behave like a calm, helpful human guide.

CONVERSATION STYLE:
- Speak naturally, not like documentation or a README
- Explain things in your own words
- Use short paragraphs (no bullet lists)
- Be reassuring and supportive
- Focus on what the user should do next
- Keep responses concise

RESPONSE LENGTH RULES:
- Keep answers under 5 short sentences
- Prefer 2–3 short paragraphs maximum
- Do NOT explain everything at once
- Focus only on the user's current question
- Avoid repeating previously shared information
- If more details exist, ask before explaining them

STRICT RULES:
- Use ONLY the Pranapath knowledge below
- Do NOT copy text verbatim
- Do NOT give medical advice
- Do NOT trigger real-world actions
- If outside scope, reply:
  "I can only help with Pranapath-related information."

PRANAPATH KNOWLEDGE (reference only):
${brain}

Context:
- User role: ${role || "general user"}
- Current page: ${page || "unknown"}

Answer conversationally and briefly.
End with a short follow-up question only if helpful.
`;
}


// POST /api/ai/chat
router.post("/chat", async (req, res) => {
  const { message, role, page } = req.body || {};

  if (!message || typeof message !== "string") {
    return res.status(400).json({ reply: "Please enter a valid message." });
  }

  let brain;
  try {
    const fullBrain = fs.readFileSync(brainFilePath, "utf8");

    // 🔐 HARD LIMIT — prevents 413 forever
    brain = fullBrain.slice(0, 2500);

    // Optional debug
    // console.log("Brain length:", brain.length);

  } catch (err) {
    console.error("❌ Brain read error:", err);
    return res.json({ reply: FALLBACK });
  }

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        {
          role: "system",
          content: buildSystemPrompt(brain, role, page),
        },
        {
          role: "user",
          content: message,
        },
      ],
      temperature: 0.2,
    });

    let reply = completion.choices?.[0]?.message?.content || "";

    // Clean formatting
    reply = reply
      .replace(/\*\*/g, "")
      .replace(/#+\s?/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    return res.json({ reply: reply || FALLBACK });

  } catch (err) {
    console.error("❌ Groq error:", err);
    return res.json({ reply: FALLBACK });
  }
});

module.exports = router;
