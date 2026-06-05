import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"
import { authOptions } from "@/lib/authOptions"
import { getSheetData } from "@/lib/sheets"
import { obtenerPerfil } from "@/lib/jerarquia"

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
  const iFecha   = idx("fecha")
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
        fecha:   r[iFecha]   ?? "",
        semana:  r[iSemana]  ?? "",
        total:   parseInt(r[iTotal] ?? "0") || 0,
        cumple:  r[iCumple]  ?? "",
      }))

    const semanas = [...new Set(registros.map(r => r.semana).filter(Boolean))].sort((a, b) => Number(a) - Number(b))
    const semanaActual = semanas.at(-1) ?? ""
    const deEstaSemana = registros.filter(r => r.semana === semanaActual)

    // Agrupar por supervisor → promedio cumplimiento y monitoreos
    const supervisores = [...new Set(deEstaSemana.map(r => r.nombre).filter(Boolean))]
    const porSupervisor = supervisores.map(nombre => {
      const dias = deEstaSemana.filter(r => r.nombre === nombre)
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
    const allPcts = deEstaSemana.map(d => parseCumplePct(d.cumple))
    const pctGlobal = allPcts.length > 0 ? Math.round(allPcts.reduce((a, b) => a + b) / allPcts.length) : 0
    const totalMonitoreos = deEstaSemana.reduce((s, d) => s + d.total, 0)

    return NextResponse.json({
      modo: "coordinador",
      semanas,
      semanaActual,
      kpi: { pct: pctGlobal, totalMonitoreos },
      porSupervisor,
    })
  }

  // Vista supervisor: sus propios monitoreos
  const registros = rows.slice(1)
    .filter(r => (r[iNombre] ?? "").toLowerCase().trim() === nombrePersona)
    .map(r => ({
      fecha:   r[iFecha]   ?? "",
      semana:  r[iSemana]  ?? "",
      total:   parseInt(r[iTotal] ?? "0") || 0,
      cumple:  r[iCumple]  ?? "",
    }))

  const semanas = [...new Set(registros.map(r => r.semana).filter(Boolean))].sort((a, b) => Number(a) - Number(b))
  const semanaActual = semanas.at(-1) ?? ""
  const deEstaSemana = registros.filter(r => r.semana === semanaActual)

  // Días únicos con sus monitoreos
  const porFecha: Record<string, { total: number; cumple: string }> = {}
  registros.forEach(r => {
    if (r.fecha && !porFecha[r.fecha]) {
      porFecha[r.fecha] = { total: r.total, cumple: r.cumple }
    }
  })

  const dias = Object.entries(porFecha).map(([fecha, d]) => ({
    fecha,
    semana: registros.find(r => r.fecha === fecha)?.semana ?? "",
    total: d.total,
    cumple: d.cumple,
    cumpleMeta: d.total >= META_DIARIA,
  }))

  // KPI: promedio cumplimiento semana actual y total monitoreos
  const pcts = deEstaSemana.map(d => parseCumplePct(d.cumple))
  const pctPromedio = pcts.length > 0 ? Math.round(pcts.reduce((a, b) => a + b) / pcts.length) : 0
  const totalMonitoreosSemana = deEstaSemana.reduce((s, d) => s + d.total, 0)
  const diasConMeta = deEstaSemana.filter(d => d.total >= META_DIARIA).length

  return NextResponse.json({
    modo: "supervisor",
    semanas,
    semanaActual,
    kpi: { pct: pctPromedio, totalMonitoreos: totalMonitoreosSemana, diasConMeta, meta: META_DIARIA },
    dias,
  })
}
