import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"
import { authOptions } from "@/lib/authOptions"
import { getSheetData } from "@/lib/sheets"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const id = req.nextUrl.searchParams.get("id") ?? ""
  const hoja = req.nextUrl.searchParams.get("hoja") ?? ""
  const col = parseInt(req.nextUrl.searchParams.get("col") ?? "3") // índice 0 de la columna Jefe
  const q = (req.nextUrl.searchParams.get("q") ?? "").toLowerCase()

  try {
    const rows = await getSheetData(session.accessToken, id, `${hoja}!A:I`)
    const jefes = [...new Set(rows.slice(1).map(r => r[col] ?? "").filter(Boolean))]
    const filtrados = q ? jefes.filter(j => j.toLowerCase().includes(q)) : jefes.slice(0, 20)
    return NextResponse.json({ total: jefes.length, muestra: filtrados })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
