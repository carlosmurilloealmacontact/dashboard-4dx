import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"
import { authOptions } from "@/lib/authOptions"
import { getSheetData } from "@/lib/sheets"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const sheetId = req.nextUrl.searchParams.get("id") ?? ""
  const hoja = req.nextUrl.searchParams.get("hoja") ?? ""
  const filas = parseInt(req.nextUrl.searchParams.get("filas") ?? "3")

  try {
    const rows = await getSheetData(session.accessToken, sheetId, `${hoja}!A1:AZ${filas + 1}`)
    const headers = rows[0] ?? []
    const mapa = headers.map((h, i) => {
      const letra = i < 26 ? String.fromCharCode(65 + i) : "A" + String.fromCharCode(65 + (i - 26))
      return `${letra}: ${h}`
    })
    return NextResponse.json({ hoja, columnas: mapa, muestras: rows.slice(1, filas + 1) })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
