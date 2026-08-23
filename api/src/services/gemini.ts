import { requireGeminiApiKey } from "../config.js";

// gemini-2.5-flash is no longer available to new API keys as of 2026 — Gemini's
// own 404 for it names this as the replacement.
const MODEL = "gemini-3.6-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const SYSTEM_INSTRUCTION =
  "You are a clinical summarization aide for a hospital's own already-authorised staff " +
  "reviewing a patient record they hold consent for. Summarize the patient's condition in " +
  "3-5 short sentences: what stands out, and anything a clinician should double-check before " +
  "a visit. Do not invent facts not present in the data. This is not a diagnosis and must not " +
  "recommend a treatment plan.";

export class GeminiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** Calls Gemini server-side — the API key never reaches the browser.
 * `record` is the structured data already fetched (and paid/consent-verified)
 * by the caller; `history` is optional free-text prior notes. */
export async function summarizeRecord(record: unknown, history?: string): Promise<string> {
  const apiKey = requireGeminiApiKey();

  const prompt = [
    "Patient record (JSON):",
    JSON.stringify(record, null, 2),
    history ? `\nPrior visit notes:\n${history}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      contents: [{ parts: [{ text: prompt }] }],
      // Gemini 3.x models spend part of maxOutputTokens on internal reasoning
      // before the visible answer, so a budget sized for the answer alone (we
      // measured ~400 being consumed with no visible text left) truncates the
      // summary mid-sentence. Sized generously so that can't happen quietly.
      generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new GeminiError(`Gemini request failed (${res.status}): ${body.slice(0, 300)}`, res.status);
  }

  const data = await res.json();
  const candidate = data?.candidates?.[0];
  const text = candidate?.content?.parts?.[0]?.text;
  if (typeof text !== "string" || !text.trim()) {
    throw new GeminiError("Gemini returned no summary text.", 502);
  }
  if (candidate?.finishReason === "MAX_TOKENS") {
    throw new GeminiError("Gemini's response was cut off before finishing — try again.", 502);
  }
  return text.trim();
}
