import { google } from "googleapis"

export async function getSheetsClient(accessToken: string) {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  )
  auth.setCredentials({ access_token: accessToken })
  return google.sheets({ version: "v4", auth })
}

function esErrorDeCuota(error: unknown): boolean {
  const codigo = (error as { code?: number; response?: { status?: number } })?.code
    ?? (error as { response?: { status?: number } })?.response?.status
  return codigo === 429 || codigo === 403
}

const ESPERAS_MS = [1000, 2000, 4000] // reintentos ante error de cuota de Sheets API

export async function getSheetData(
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
      if (esErrorDeCuota(error) && intento < ESPERAS_MS.length) {
        await new Promise(r => setTimeout(r, ESPERAS_MS[intento]))
        continue
      }
      const msg = error instanceof Error ? error.message : String(error)
      throw new Error(`Error leyendo Sheet [${range}]: ${msg}`)
    }
  }
}
