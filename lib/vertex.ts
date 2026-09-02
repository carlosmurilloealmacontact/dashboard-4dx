const MODELO = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite"

interface GeminiCandidate {
  content?: { parts?: { text?: string }[] }
}

/**
 * Llama a la API publica de Gemini (Google AI Studio) usando una API key.
 * Reemplaza a Vertex AI desde 2026-08-27 (credito Vertex vencido); mismo
 * modelo gratuito, sin OAuth ni cuenta de servicio.
 */
export async function generarTextoVertex(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY

  if (!apiKey) {
    throw new Error("Falta la variable de entorno GEMINI_API_KEY")
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent?key=${apiKey}`
  const body = JSON.stringify({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
  })

  const ESPERAS_MS = [2000, 5000, 10000] // reintentos ante 429 (limite por minuto del free tier)
  let genRes: Response
  let genJson: { candidates?: GeminiCandidate[]; error?: unknown }
  for (let intento = 0; ; intento++) {
    genRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    })
    genJson = await genRes.json()
    if (genRes.ok) break
    if (genRes.status !== 429 || intento >= ESPERAS_MS.length) {
      throw new Error(`Error de Gemini API: ${JSON.stringify(genJson)}`)
    }
    await new Promise(r => setTimeout(r, ESPERAS_MS[intento]))
  }

  const candidatos: GeminiCandidate[] = genJson.candidates ?? []
  const texto = candidatos[0]?.content?.parts?.map(p => p.text ?? "").join("") ?? ""
  if (!texto) throw new Error("Gemini API no devolvio contenido")
  return texto
}
