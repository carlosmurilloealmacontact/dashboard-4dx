import { google } from "googleapis"

export async function getSheetsClient(accessToken: string) {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  )
  auth.setCredentials({ access_token: accessToken })
  return google.sheets({ version: "v4", auth })
}

function esErrorReintentable(error: unknown): boolean {
  const codigo = (error as { code?: number; response?: { status?: number } })?.code
    ?? (error as { response?: { status?: number } })?.response?.status
  // 429/403: cuota excedida. 500/502/503/504: errores transitorios de Google.
  return codigo === 429 || codigo === 403 || codigo === 500 || codigo === 502 || codigo === 503 || codigo === 504
}

const ESPERAS_MS = [1000, 2000, 4000] // reintentos ante error transitorio de Sheets API

async function fetchSheetData(
  accessToken: string,
  spreadsheetId: string,
  range: string
): Promise<string[][]> {
  for (let intento = 0; ; intento++) {
    try {
      const sheets = await getSheetsClient(accessToken)
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
      })
      return response.data.values ?? []
    } catch (error: unknown) {
      if (esErrorReintentable(error) && intento < ESPERAS_MS.length) {
        await new Promise(r => setTimeout(r, ESPERAS_MS[intento]))
        continue
      }
      const msg = error instanceof Error ? error.message : String(error)
      throw new Error(`Error leyendo Sheet [${range}]: ${msg}`)
    }
  }
}

// Caché compartida en memoria: todas las peticiones concurrentes/recientes a la
// misma hoja+rango reutilizan el mismo dato, sin importar qué usuario lo pida.
// Esto reduce drásticamente el consumo de cuota de Sheets API en picos de tráfico
// y permite mantener los datos frescos (TTL corto) sin golpear la API por usuario.
const TTL_MS = 30_000

interface CacheEntry { data: string[][]; timestamp: number }

const cache = new Map<string, CacheEntry>()
const pendientes = new Map<string, Promise<string[][]>>()

export async function getSheetData(
  accessToken: string,
  spreadsheetId: string,
  range: string
): Promise<string[][]> {
  const key = `${spreadsheetId}::${range}`

  const cacheado = cache.get(key)
  if (cacheado && Date.now() - cacheado.timestamp < TTL_MS) {
    return cacheado.data
  }

  const enCurso = pendientes.get(key)
  if (enCurso) return enCurso

  const promesa = fetchSheetData(accessToken, spreadsheetId, range)
    .then(data => {
      cache.set(key, { data, timestamp: Date.now() })
      return data
    })
    .catch(error => {
      // Si falla pero tenemos un dato previo (aunque esté vencido), lo servimos
      // en vez de propagar el error 500 al usuario.
      if (cacheado) return cacheado.data
      throw error
    })
    .finally(() => {
      pendientes.delete(key)
    })

  pendientes.set(key, promesa)
  return promesa
}
