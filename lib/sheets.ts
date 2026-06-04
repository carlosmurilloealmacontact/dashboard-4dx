import { google } from "googleapis"

export async function getSheetsClient(accessToken: string) {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  )
  auth.setCredentials({ access_token: accessToken })
  return google.sheets({ version: "v4", auth })
}

export async function getSheetData(
  accessToken: string,
  spreadsheetId: string,
  range: string
): Promise<string[][]> {
  try {
    const sheets = await getSheetsClient(accessToken)
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    })
    return response.data.values ?? []
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    throw new Error(`Error leyendo Sheet [${range}]: ${msg}`)
  }
}
