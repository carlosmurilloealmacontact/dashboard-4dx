import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"
import { authOptions } from "@/lib/authOptions"
import { getSheetData } from "@/lib/sheets"
import { obtenerPerfil } from "@/lib/jerarquia"

const SHEET_ID = "1UN-wQKOh1z9M4K4LUJiY1prj26Lo2taVR-szVhx-Gso"
const HOJA = "Cumplimiento_Diario_MCI"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const emailOverride = req.nextUrl.searchParams.get("email")
  const email = emailOverride ?? session.user?.email ?? ""
  const perfil = await obtenerPerfil(session.accessToken, email)
  if (!perfil) return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 })

  let rows: string[][]
  try {
    rows = await getSheetData(session.accessToken, SHEET_ID, `${HOJA}!A:J`)
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }

  if (rows.length < 2) return NextResponse.json({ error: "No hay datos en el sheet" })

  const headers = rows[0]
  const idx = (n: string) => headers.findIndex(h => (h ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") === n.toLowerCase())

  // Ver qué índices se encontraron
  const indices = {
    fecha: idx("fecha"),
    semana: idx("semana"),
    bp: idx("bp"),
    nombre: idx("nombre"),
    jefe: idx("jefe_inmediato"),
    cumple: idx("cumple_dia"),
  }

  // Ver los primeros 5 registros
  const primeros5 = rows.slice(1, 6).map(r => ({
    fecha: r[indices.fecha] ?? "",
    semana: r[indices.semana] ?? "",
    bp: r[indices.bp] ?? "",
    nombre: r[indices.nombre] ?? "",
    jefe: r[indices.jefe] ?? "",
    cumple: r[indices.cumple] ?? "",
  }))

  return NextResponse.json({
    nombreJefe: perfil.persona.nombre,
    indices,
    headers: headers.slice(0, 10),
    primeros5,
    totalRows: rows.length,
  })
}
