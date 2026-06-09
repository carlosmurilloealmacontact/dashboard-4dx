import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"
import { authOptions } from "@/lib/authOptions"
import { getSheetData } from "@/lib/sheets"
import { obtenerPerfil } from "@/lib/jerarquia"
import { resolverSemana } from "@/lib/semana"

const SHEET_ID = "1MZiP7K4JbElp3lM2n0Tr554WNN1RTfGlsgCB9uJ8tSw"
const HOJA = "Detalle Eventos"
const META_DIARIA = 5

function parseCumplePct(v: string): number {
  return parseFloat((v ?? "").replace(",", ".").replace("%", "")) || 0
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const email = req.nextUrl.searchParams.get("email") ?? session.user?.email ?? ""
  const semanaParam = req.nextUrl.searchParams.get("semana")
  const perfil = await obtenerPerfil(session.accessToken, email)
  if (!perfil) return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 })

  let rows: string[][]
  try {
    rows = await getSheetData(session.accessToken, SHEET_ID, `${HOJA}!A:P`)
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
  if (rows.length < 2) return NextResponse.json({ modo: "supervisor", dias: [], semanas: [] })

  const headers = rows[0]
  const idx = (n: string) => headers.findIndex(h =>
    (h ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") === n.toLowerCase()
  )

  const iNombre  = idx("nombre")
  const iJefe    = idx("jefe inmediato")
  const iDia     = idx("dia semana")  // 1=Lun, 2=Mar, ... 5=Vie (la columna "Fecha" viene vacía)
  const iSemana  = idx("semana")
  const iTotal   = idx("total gestion dia")
  const iCumple  = idx("cumplimiento dia")

  const nombrePersona = (perfil.persona.nombre ?? "").toLowerCase().trim()
  const esCoord = ["coordinador", "jefatura", "gerente"].includes(perfil.rol)
  const esCoach = perfil.rol === "coach"

  console.log("DEBUG adherencia-pca:")
  console.log("  nombrePersona:", nombrePersona)
  console.log("  rol:", perfil.rol)
  console.log("  esCoach:", esCoach)
  console.log("  iNombre index:", iNombre)
  console.log("  primeros 5 nombres:", rows.slice(1, 6).map(r => (r[iNombre] ?? "").toLowerCase().trim()))

  if (esCoord) {
    // Vista coordinador: supervisores bajo este coordinador
    const registros = rows.slice(1)
      .filter(r => (r[iJefe] ?? "").toLowerCase().trim() === nombrePersona)
      .map(r => ({
        nombre:  r[iNombre]  ?? "",
        dia:     parseInt(r[iDia] ?? "0") || 0,
        semana:  r[iSemana]  ?? "",
        total:   parseInt(r[iTotal] ?? "0") || 0,
        cumple:  r[iCumple]  ?? "",
      }))

    const semanas = [...new Set(registros.map(r => r.semana).filter(Boolean))].sort((a, b) => Number(a) - Number(b))
    const semanaActual = resolverSemana(semanaParam, semanas)
    const deEstaSemana = registros.filter(r => r.semana === semanaActual)

    // Agrupar por supervisor → deduplicar por día (varias filas-evento por día),
    // tomando el MÁXIMO de "Total Gestión Dia" por día.
    const supervisores = [...new Set(deEstaSemana.map(r => r.nombre).filter(Boolean))]
    const porSupervisor = supervisores.map(nombre => {
      const filas = deEstaSemana.filter(r => r.nombre === nombre)
      const porDia: Record<number, { total: number; cumple: string }> = {}
      filas.forEach(r => {
        if (!r.dia) return
        const prev = porDia[r.dia]
        porDia[r.dia] = {
          total:  prev ? Math.max(prev.total, r.total) : r.total,
          cumple: r.cumple || prev?.cumple || "",
        }
      })
      const dias = Object.values(porDia)
      const pcts = dias.map(d => parseCumplePct(d.cumple))
      const promCumple = pcts.length > 0 ? Math.round(pcts.reduce((a, b) => a + b) / pcts.length) : 0
      const totalMonitoreos = dias.reduce((s, d) => s + d.total, 0)
      const diasConMeta = dias.filter(d => d.total >= META_DIARIA).length
      return {
        supervisor: nombre,
        dias: dias.length,
        promCumple,
        totalMonitoreos,
        diasConMeta,
      }
    }).sort((a, b) => a.promCumple - b.promCumple)

    // KPI global
    const pctGlobal = porSupervisor.length > 0
      ? Math.round(porSupervisor.reduce((s, p) => s + p.promCumple, 0) / porSupervisor.length) : 0
    const totalMonitoreos = porSupervisor.reduce((s, p) => s + p.totalMonitoreos, 0)

    const resCoord = NextResponse.json({
      modo: "coordinador",
      semanas,
      semanaActual,
      kpi: { pct: pctGlobal, totalMonitoreos },
      porSupervisor,
    })
    resCoord.headers.set('Cache-Control', 'private, max-age=120, stale-while-revalidate=60')
    return resCoord
  }

  // Vista supervisor/coach: sus propios monitoreos
  console.log("DEBUG adherencia-pca (supervisor/coach):")
  console.log("  nombrePersona:", nombrePersona)
  console.log("  iNombre:", iNombre)
  if (iNombre >= 0) {
    console.log("  primeros 5 nombres en col", iNombre, ":", rows.slice(1, 6).map(r => (r[iNombre] ?? "").toLowerCase().trim()))
  }

  const registros = rows.slice(1)
    .filter(r => iNombre >= 0 && (r[iNombre] ?? "").toLowerCase().trim() === nombrePersona)
    .map(r => ({
      dia:     parseInt(r[iDia] ?? "0") || 0,   // 1=Lun .. 5=Vie
      semana:  r[iSemana]  ?? "",
      total:   parseInt(r[iTotal] ?? "0") || 0,
      cumple:  r[iCumple]  ?? "",
    }))

  const semanas = [...new Set(registros.map(r => r.semana).filter(Boolean))].sort((a, b) => Number(a) - Number(b))
  const semanaActual = resolverSemana(semanaParam, semanas)

  // La columna "Fecha" viene vacía → agrupamos por (semana, dia de la semana).
  // "Total Gestión Dia" aparece en una sola fila del día (resto vacío) → tomar el MÁXIMO.
  const porDia: Record<string, { semana: string; dia: number; total: number; cumple: string }> = {}
  registros.forEach(r => {
    if (!r.semana || !r.dia) return
    const key = `${r.semana}-${r.dia}`
    const prev = porDia[key]
    porDia[key] = {
      semana: r.semana,
      dia:    r.dia,
      total:  prev ? Math.max(prev.total, r.total) : r.total,
      cumple: r.cumple || prev?.cumple || "",
    }
  })

  const dias = Object.values(porDia).map(d => ({
    semana: d.semana,
    dia:    d.dia,
    total:  d.total,
    cumple: d.cumple,
    cumpleMeta: d.total >= META_DIARIA,
  }))

  // KPI: usar los días deduplicados (porFecha) de la semana actual
  // para evitar contar múltiples filas del mismo día
  const diasSemanaActual = dias.filter(d => d.semana === semanaActual)
  const pcts = diasSemanaActual.map(d => parseCumplePct(d.cumple))
  const pctPromedio = pcts.length > 0 ? Math.round(pcts.reduce((a, b) => a + b) / pcts.length) : 0
  const totalMonitoreosSemana = diasSemanaActual.reduce((s, d) => s + d.total, 0)
  const diasConMeta = diasSemanaActual.filter(d => d.total >= META_DIARIA).length

  const response = NextResponse.json({
    modo: "supervisor",
    semanas,
    semanaActual,
    kpi: { pct: pctPromedio, totalMonitoreos: totalMonitoreosSemana, diasConMeta, meta: META_DIARIA },
    dias,
  })

  // Caché corta: 2 min — la hoja tiene 17k+ filas, sin caché agota la quota
  response.headers.set('Cache-Control', 'private, max-age=120, stale-while-revalidate=60')
  return response
}
