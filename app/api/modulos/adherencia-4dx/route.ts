import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"
import { authOptions } from "@/lib/authOptions"
import { getSheetData } from "@/lib/sheets"
import { obtenerPerfil } from "@/lib/jerarquia"
import { resolverSemana } from "@/lib/semana"

const SHEET_ID = "1UN-wQKOh1z9M4K4LUJiY1prj26Lo2taVR-szVhx-Gso"
const HOJA = "Cumplimiento_Diario_MCI"

function parseCumple(v: string) {
  return parseFloat((v ?? "").replace(",", ".")) || 0
}

// Devuelve las fechas (YYYY-MM-DD) de los días hábiles anteriores a hoy en la semana actual
function diasRequeridosEstaSemana(): string[] {
  const hoy = new Date()
  const diaSemana = hoy.getDay() // 0=Dom, 1=Lun, ..., 6=Sáb

  // Si hoy es lunes (1) o fin de semana, no hay días previos que exigir
  if (diaSemana <= 1) return []

  // Lunes de esta semana
  const lunes = new Date(hoy)
  lunes.setDate(hoy.getDate() - (diaSemana - 1))

  const requeridos: string[] = []
  const ayer = new Date(hoy)
  ayer.setDate(hoy.getDate() - 1)

  // Desde lunes hasta ayer inclusive (solo Lun-Vie)
  for (let d = new Date(lunes); d <= ayer; d.setDate(d.getDate() + 1)) {
    const dia = d.getDay()
    if (dia >= 1 && dia <= 5) {
      const yyyy = d.getFullYear()
      const mm = String(d.getMonth() + 1).padStart(2, "0")
      const dd = String(d.getDate()).padStart(2, "0")
      requeridos.push(`${yyyy}-${mm}-${dd}`)
    }
  }
  return requeridos
}

function calcularAlertas(registrosSemana: { bp: string; fecha: string; cumple: string }[]): { count: number; bps: string[] } {
  const diasRequeridos = diasRequeridosEstaSemana()
  if (diasRequeridos.length === 0) return { count: 0, bps: [] }

  const bps = [...new Set(registrosSemana.map(r => r.bp))]
  const bpsConAlerta = bps.filter(bp => {
    return diasRequeridos.some(fechaReq => {
      const registro = registrosSemana.find(r => r.bp === bp && r.fecha === fechaReq)
      // Alerta si: no tiene registro ese día O el cumple es < 1
      if (!registro) return true
      return parseCumple(registro.cumple) < 1
    })
  })
  return { count: bpsConAlerta.length, bps: bpsConAlerta }
}

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const emailOverride = req.nextUrl.searchParams.get("email")
  const email = emailOverride ?? session.user?.email ?? ""
  const semanaParam = req.nextUrl.searchParams.get("semana")
  const servicioParam = req.nextUrl.searchParams.get("servicio")
  const perfil = await obtenerPerfil(session.accessToken, email)
  if (!perfil) return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 })

  let rows: string[][]
  try {
    rows = await getSheetData(session.accessToken, SHEET_ID, `${HOJA}!A:J`)
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
  if (rows.length < 2) return NextResponse.json({ registros: [], semanas: [], modo: "supervisor" })

  const headers = rows[0]
  const idx = (n: string) => headers.findIndex(h => (h ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") === n.toLowerCase())

  const iFecha  = idx("fecha")
  const iSemana = idx("semana")
  const iBP     = idx("bp")
  const iNombre = idx("nombre")
  const iJefe   = idx("jefe_inmediato")
  const iCoordinador = idx("coordinador")
  const iCumple = idx("cumple_dia")
  const iResol  = idx("resolutividade")
  const iProd   = idx("produtividade")

  const esCoord = ["coordinador", "jefatura", "gerente"].includes(perfil.rol?.toLowerCase())
  const nombrePersonaCoord = (perfil.persona.nombre ?? "").toLowerCase().trim()

  if (esCoord) {
    // --- VISTA COORDINADOR: agrupar por supervisor ---
    // Filtramos por la columna "Coordinador" de la hoja (perfil.supervisores puede venir vacío).
    const supervisoresServicio = servicioParam
      ? new Set(perfil.supervisores
          .filter(s => (s.servicio ?? "").toLowerCase().trim() === servicioParam.toLowerCase().trim())
          .map(s => (s.nombre ?? "").toLowerCase().trim()))
      : null

    const registros = rows.slice(1)
      .filter(r => iCoordinador >= 0 && (r[iCoordinador] ?? "").toLowerCase().trim() === nombrePersonaCoord)
      .filter(r => !supervisoresServicio || supervisoresServicio.has((r[iJefe] ?? "").toLowerCase().trim()))
      .map(r => ({
        fecha:  r[iFecha]  ?? "",
        semana: r[iSemana] ?? "",
        bp:     r[iBP]     ?? "",
        nombre: r[iNombre] ?? "",
        jefe:   r[iJefe]   ?? "",
        cumple: r[iCumple] ?? "",
        resol:  iResol >= 0 ? (r[iResol] ?? "") : "",
        prod:   iProd  >= 0 ? (r[iProd]  ?? "") : "",
      }))

    const semanas = [...new Set(registros.map(r => r.semana).filter(Boolean))].sort((a, b) => Number(a) - Number(b))
    const semanaActual = resolverSemana(semanaParam, semanas)
    const deEstaSemana = registros.filter(r => r.semana === semanaActual)

    // Agrupar por supervisor
    const porSupervisor: Record<string, { nombre: string; agentes: typeof deEstaSemana }> = {}
    deEstaSemana.forEach(r => {
      const jefe = r.jefe
      if (!porSupervisor[jefe]) porSupervisor[jefe] = { nombre: jefe, agentes: [] }
      porSupervisor[jefe].agentes.push(r)
    })

    // Resumen por supervisor
    const supervisoresResumen = Object.values(porSupervisor).map(sv => {
      const agentesUnicos = [...new Map(sv.agentes.map(a => [a.bp, a])).values()]
      const totalDias = sv.agentes.length
      const cumplieron = sv.agentes.filter(a => parseCumple(a.cumple) >= 1).length
      const pct = totalDias > 0 ? Math.round((cumplieron / totalDias) * 100) : 0
      const conResol = sv.agentes.filter(a => parseCumple(a.resol) > 0).length
      const conProd  = sv.agentes.filter(a => parseCumple(a.prod)  > 0).length
      const pctResol = totalDias > 0 ? Math.round((conResol / totalDias) * 100) : 0
      const pctProd  = totalDias > 0 ? Math.round((conProd  / totalDias) * 100) : 0
      const alertasSv = calcularAlertas(sv.agentes)
      return { supervisor: sv.nombre, totalAgentes: agentesUnicos.length, pct, pctResol, pctProd, conAlerta: alertasSv.count, bpsAlerta: alertasSv.bps }
    }).sort((a, b) => a.pct - b.pct)

    // KPI global
    const totalRegistros = deEstaSemana.length
    const totalCumplieron = deEstaSemana.filter(r => parseCumple(r.cumple) >= 1).length
    const pctGlobal = totalRegistros > 0 ? Math.round((totalCumplieron / totalRegistros) * 100) : 0
    const alertasGlobal = calcularAlertas(deEstaSemana)

    return NextResponse.json({
      modo: "coordinador",
      semanas,
      semanaActual,
      kpi: { pct: pctGlobal, alertas: alertasGlobal.count, bpsAlerta: alertasGlobal.bps },
      supervisoresResumen,
      registros: registros.slice(-1000),
    })
  }

  // --- VISTA SUPERVISOR ---
  const nombreJefe = (perfil.persona.nombre ?? "").toLowerCase().trim()
  const registros = rows.slice(1)
    .filter(r => (r[iJefe] ?? "").toLowerCase().trim() === nombreJefe)
    .map(r => ({
      fecha:  r[iFecha]  ?? "",
      semana: r[iSemana] ?? "",
      bp:     r[iBP]     ?? "",
      nombre: r[iNombre] ?? "",
      cumple: r[iCumple] ?? "",
      resol:  iResol >= 0 ? (r[iResol] ?? "") : "",
      prod:   iProd  >= 0 ? (r[iProd]  ?? "") : "",
    }))

  const semanas = [...new Set(registros.map(r => r.semana).filter(Boolean))].sort((a, b) => Number(a) - Number(b))
  const semanaActual = resolverSemana(semanaParam, semanas)
  const deEstaSemana = registros.filter(r => r.semana === semanaActual)

  // KPI: % cumplimiento y alertas dinámicas
  const totalDias = deEstaSemana.length
  const cumplieron = deEstaSemana.filter(r => parseCumple(r.cumple) >= 1).length
  const pct = totalDias > 0 ? Math.round((cumplieron / totalDias) * 100) : 0
  const alertas = calcularAlertas(deEstaSemana)

  return NextResponse.json({
    modo: "supervisor",
    semanas,
    semanaActual,
    kpi: { pct, alertas: alertas.count, bpsAlerta: alertas.bps },
    registros: registros.slice(-500),
  })
}
