const TOKEN_URL = "https://oauth2.googleapis.com/token"
const MODELO = "gemini-2.5-flash-lite"

interface VertexCandidate {
  content?: { parts?: { text?: string }[] }
}

/**
 * Llama a Vertex AI (Gemini) usando credenciales OAuth de usuario
 * (client_id/client_secret/refresh_token), sin necesidad de service account.
 */
export async function generarTextoVertex(prompt: string): Promise<string> {
  const clientId = process.env.VERTEX_OAUTH_CLIENT_ID
  const clientSecret = process.env.VERTEX_OAUTH_CLIENT_SECRET
  const refreshToken = process.env.VERTEX_OAUTH_REFRESH_TOKEN
  const project = process.env.VERTEX_PROJECT
  const location = process.env.VERTEX_LOCATION || "us-central1"

  if (!clientId || !clientSecret || !refreshToken || !project) {
    throw new Error("Faltan variables de entorno de Vertex AI (VERTEX_PROJECT / VERTEX_OAUTH_*)")
  }

  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  })
  const tokenJson = await tokenRes.json()
  if (!tokenRes.ok) throw new Error(`Error obteniendo token de Google: ${JSON.stringify(tokenJson)}`)

  const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${MODELO}:generateContent`
  const body = JSON.stringify({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
  })

  const ESPERAS_MS = [2000, 5000, 10000] // reintentos ante 429 (límite por minuto del free tier)
  let genRes: Response
  let genJson: { candidates?: VertexCandidate[]; error?: unknown }
  for (let intento = 0; ; intento++) {
    genRes = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenJson.access_token}`,
        "Content-Type": "application/json",
      },
      body,
    })
    genJson = await genRes.json()
    if (genRes.ok) break
    if (genRes.status !== 429 || intento >= ESPERAS_MS.length) {
      throw new Error(`Error de Vertex AI: ${JSON.stringify(genJson)}`)
    }
    await new Promise(r => setTimeout(r, ESPERAS_MS[intento]))
  }

  const candidatos: VertexCandidate[] = genJson.candidates ?? []
  const texto = candidatos[0]?.content?.parts?.map(p => p.text ?? "").join("") ?? ""
  if (!texto) throw new Error("Vertex AI no devolvió contenido")
  return texto
}
