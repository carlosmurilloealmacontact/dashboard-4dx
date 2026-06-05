import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"
import { authOptions } from "@/lib/authOptions"
import { getSheetData } from "@/lib/sheets"
import { obtenerPerfil } from "@/lib/jerarquia"

const SHEET_ID = "1UN-wQKOh1z9M4K4LUJiY1prj26Lo2taVR-szVhx-Gso"
const HOJA = "Seguimiento_LiderCoach_8Sem"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const emailOverride = req.nextUrl.searchParams.get("email")
  const email = emailOverride ?? session.user?.email ?? ""
  const perfil = await obtenerPerfil(session.accessToken, email)
  if (!perfil) return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 })

  let rows: string[][]
  try {
    rows = await getSheetData(session.accessToken, SHEET_ID, `${HOJA}!A:K`)
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
  if (rows.length < 2) return NextResponse.json({ registros: [], semanas: [], resumen: { totalDias: 0, diasCumplidos: 0, pctCumplimiento: 0, ultimoCDR: null } })

  const headers = rows[0]
  const idx = (n: string) => headers.findIndex(h => (h ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") === n.toLowerCase())

  const iLider  = idx("lider coach")
  const iFecha  = idx("fecha")
  const iSemana = idx("semana")
  const iCumple = idx("cumple")
  const iCDR    = idx("cdr_sim")
  const iFoco   = idx("focos")

  // Debug: si no encuentra columnas, loguear
  if (iLider === -1) console.log("No encontró 'Lider Coach' en headers:", headers.slice(0, 10))
  if (iFecha === -1) console.log("No encontró 'Fecha'")
  if (iCumple === -1) console.log("No encontró 'Cumple'")

  const nombreLider = (perfil.persona.nombre ?? "").toLowerCase().trim()

  console.log("DEBUG seguimiento-coach:")
  console.log("  nombreLider buscando:", nombreLider)
  console.log("  iLider index:", iLider)
  console.log("  primeros 5 nombres en hoja:", rows.slice(1, 6).map(r => (r[iLider] ?? "").toLowerCase().trim()))

  const registros = rows.slice(1)
    .filter(r => iLider >= 0 && (r[iLider] ?? "").toLowerCase().trim() === nombreLider)
    .map(r => ({
      fecha:  r[iFecha]  ?? "",
      semana: r[iSemana] ?? "",
      cumple: r[iCumple] ?? "",
      cdr:    r[iCDR]    ?? "",
      foco:   r[iFoco]   ?? "",
    }))

  const conCumple = registros.filter(r => r.cumple === "1")
  const conCDR    = registros.filter(r => r.cdr && r.cdr !== "0")
  const semanas   = [...new Set(registros.map(r => r.semana).filter(Boolean))].sort((a, b) => Number(a) - Number(b))

  return NextResponse.json({
    registros: registros.slice(-60),
    semanas,
    resumen: {
      totalDias: registros.length,
      diasCumplidos: conCumple.length,
      pctCumplimiento: registros.length > 0 ? Math.round((conCumple.length / registros.length) * 100) : 0,
      ultimoCDR: conCDR.at(-1)?.cdr ?? null,
    },
  })
}
