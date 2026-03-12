const API_KEY = process.env.GEMINI_API_KEY;

fetch(
  `https://generativelanguage.googleapis.com/v1/models?key=${API_KEY}`
)
  .then(res => res.json())
  .then(data => console.log("MODELS RESPONSE:", data))
  .catch(err => console.error("FETCH ERROR:", err));
