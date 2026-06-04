import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"
import { authOptions } from "@/lib/authOptions"
import { getSheetData } from "@/lib/sheets"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  const id = req.nextUrl.searchParams.get("id") ?? ""
  const hoja = req.nextUrl.searchParams.get("hoja") ?? ""
  try {
    const rows = await getSheetData(session.accessToken, id, `${hoja}!A1:AZ3`)
    return NextResponse.json({ headers: rows[0], filas: rows.slice(1) })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
