import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"
import { authOptions } from "@/lib/authOptions"
import { getSheetData } from "@/lib/sheets"
import { obtenerPerfil, normalizarCargo } from "@/lib/jerarquia"
import { resolverSemana } from "@/lib/semana"

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

  // Vista coordinador (ej. Katheryne Quiñones): agrupar por cada coach de su equipo
  if (perfil.rol === "coordinador") {
    const semanaParam = req.nextUrl.searchParams.get("semana")
    const coaches = perfil.equipo.filter(p => normalizarCargo(p.cargo) === "coach")

    const registrosPorCoach = coaches.map(coach => {
      const nombreCoach = (coach.nombre ?? "").toLowerCase().trim()
      const registros = rows.slice(1)
        .filter(r => iLider >= 0 && (r[iLider] ?? "").toLowerCase().trim() === nombreCoach)
        .map(r => ({
          fecha:  r[iFecha]  ?? "",
          semana: r[iSemana] ?? "",
          cumple: r[iCumple] ?? "",
          cdr:    r[iCDR]    ?? "",
          foco:   r[iFoco]   ?? "",
        }))
      return { coach: coach.nombre, registros }
    })

    const semanas = [...new Set(
      registrosPorCoach.flatMap(c => c.registros.map(r => r.semana)).filter(Boolean)
    )].sort((a, b) => Number(a) - Number(b))
    const semanaActual = resolverSemana(semanaParam, semanas)

    const porCoach = registrosPorCoach.map(({ coach, registros }) => {
      const deEstaSemana = registros.filter(r => r.semana === semanaActual)
      const conCumple = deEstaSemana.filter(r => r.cumple === "1")
      const conCDR = deEstaSemana.filter(r => r.cdr && r.cdr !== "0")
      const pct = deEstaSemana.length > 0 ? Math.round((conCumple.length / deEstaSemana.length) * 100) : 0
      const cdrRaw = conCDR.at(-1)?.cdr ?? null
      const cdr = cdrRaw ? (() => {
        const n = parseFloat(cdrRaw)
        return isNaN(n) ? null : (n <= 1 ? Math.round(n * 100) : Math.round(n))
      })() : null
      return { coach, totalDias: deEstaSemana.length, cumplidos: conCumple.length, pct, cdr }
    }).sort((a, b) => a.pct - b.pct)

    const totalDias = porCoach.reduce((s, c) => s + c.totalDias, 0)
    const totalCumplidos = porCoach.reduce((s, c) => s + c.cumplidos, 0)
    const pctGlobal = totalDias > 0 ? Math.round((totalCumplidos / totalDias) * 100) : 0
    const cdrVals = porCoach.map(c => c.cdr).filter((v): v is number => v !== null)
    const cdrGlobal = cdrVals.length > 0 ? Math.round(cdrVals.reduce((a, b) => a + b) / cdrVals.length) : null

    const response = NextResponse.json({
      modo: "coordinador",
      semanas,
      semanaActual,
      kpi: { pct: pctGlobal, cdr: cdrGlobal },
      porCoach,
    })
    response.headers.set('Cache-Control', 'no-store')
    return response
  }

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

  const response = NextResponse.json({
    modo: "individual",
    registros: registros.slice(-60),
    semanas,
    resumen: {
      totalDias: registros.length,
      diasCumplidos: conCumple.length,
      pctCumplimiento: registros.length > 0 ? Math.round((conCumple.length / registros.length) * 100) : 0,
      ultimoCDR: conCDR.at(-1)?.cdr ?? null,
    },
  })

  // Sin caché — datos deben ser siempre frescos
  response.headers.set('Cache-Control', 'no-store')
  return response
}
