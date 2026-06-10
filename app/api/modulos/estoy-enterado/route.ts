import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"
import { authOptions } from "@/lib/authOptions"
import { getSheetData } from "@/lib/sheets"
import { obtenerPerfil } from "@/lib/jerarquia"
import { resolverSemana } from "@/lib/semana"

const SHEET_ID = "1sxqnABVcemnPaWivLHmW1SDChBSBQyBYGTAN3sb9q44"
const HOJA = "Base_Dashboard"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const email = req.nextUrl.searchParams.get("email") ?? session.user?.email ?? ""
  const semanaParam = req.nextUrl.searchParams.get("semana")
  const perfil = await obtenerPerfil(session.accessToken, email)
  if (!perfil) return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 })

  let rows: string[][]
  try {
    rows = await getSheetData(session.accessToken, SHEET_ID, `${HOJA}!A:I`)
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
  if (rows.length < 2) return NextResponse.json({ total: 0, semanas: [], temas: [] })

  const headers = rows[0]
  const idx = (n: string) => headers.findIndex(h => (h ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") === n.toLowerCase())

  const iNombre  = idx("nombre")
  const iJefe    = idx("jefe inmediato")
  const iTema    = idx("tema")
  const iSemana  = idx("semana")
  const iClaridad = idx("claridad")

  const nombrePersona = (perfil.persona.nombre ?? "").toLowerCase().trim()

  const registros = rows.slice(1).filter(r =>
    (r[iJefe] ?? "").toLowerCase().trim() === nombrePersona
  ).map(r => ({
    nombre:   r[iNombre]   ?? "",
    tema:     r[iTema]     ?? "",
    semana:   r[iSemana]   ?? "",
    claridad: r[iClaridad] ?? "",
  }))

  // Semanas únicas ordenadas — semanas altas (>30) son del año anterior, van primero
  const semanaNum = (s: string) => parseInt(s.replace(/\D/g, "")) || 0
  const CORTE = 30 // semanas > 30 se tratan como año anterior
  const semanas = [...new Set(registros.map(r => r.semana).filter(Boolean))]
    .sort((a, b) => {
      const na = semanaNum(a)
      const nb = semanaNum(b)
      // Año anterior primero (semanas altas), luego año actual (semanas bajas)
      const pesoA = na > CORTE ? na - 100 : na
      const pesoB = nb > CORTE ? nb - 100 : nb
      return pesoA - pesoB
    })

  const semanaActual = resolverSemana(semanaParam, semanas)
  const deEstaSemana = registros.filter(r => r.semana === semanaActual)

  // Temas únicos esta semana
  const temasUnicos = [...new Set(deEstaSemana.map(r => r.tema).filter(Boolean))]

  // Claridad por tema con detalle de agentes
  const porTema = temasUnicos.map(tema => {
    const agentes = deEstaSemana.filter(r => r.tema === tema)
    const si = agentes.filter(r => r.claridad.toLowerCase() === "si" || r.claridad.toLowerCase() === "sí")
    const no = agentes.filter(r => r.claridad.toLowerCase() === "no")
    const sinRespuesta = agentes.filter(r => r.claridad.toLowerCase().includes("sin"))
    const pctClaro = agentes.length > 0 ? Math.round((si.length / agentes.length) * 100) : 0
    return {
      tema,
      total: agentes.length,
      si: si.length,
      no: no.length,
      sinRespuesta: sinRespuesta.length,
      pctClaro,
      // Detalle por claridad para el filtro de tema
      detalle: {
        si:          si.map(a => a.nombre),
        no:          no.map(a => a.nombre),
        sinRespuesta: sinRespuesta.map(a => a.nombre),
      }
    }
  })

  // Resumen global
  const totalAgentes = deEstaSemana.length
  const totalSi = deEstaSemana.filter(r => r.claridad.toLowerCase() === "si" || r.claridad.toLowerCase() === "sí").length
  const pctGlobal = totalAgentes > 0 ? Math.round((totalSi / totalAgentes) * 100) : 0

  return NextResponse.json({
    total: totalAgentes,
    semanaActual,
    semanas,
    pctClaro: pctGlobal,
    porTema,
  })
}
