import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"
import { authOptions } from "@/lib/authOptions"
import { getSheetData } from "@/lib/sheets"
import { obtenerPerfil } from "@/lib/jerarquia"
import { resolverSemana } from "@/lib/semana"

const SHEET_ID = "17Jftow3b5V9AFhndlt1MNe6ZBKQD1xBCrQfNqM0vDl4"
const HOJA = "Pausas 4DX Raw"

function fechaAIsoSemana(fechaStr: string): string {
  const [y, m, d] = fechaStr.split("-").map(Number)
  if (!y || !m || !d) return ""
  const date = new Date(y, m - 1, d)
  const thu = new Date(date)
  thu.setDate(date.getDate() + (4 - (date.getDay() || 7)))
  const yearStart = new Date(thu.getFullYear(), 0, 1)
  return String(Math.ceil(((thu.getTime() - yearStart.getTime()) / 86400000 + 1) / 7))
}

function nombreAgente(raw: string): string {
  const idx = raw.indexOf(" - ")
  return idx >= 0 ? raw.slice(idx + 3) : raw
}

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
    rows = await getSheetData(session.accessToken, SHEET_ID, `'${HOJA}'!A:J`)
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
  if (rows.length < 2) return NextResponse.json({ registros: [], semanas: [], modo: "supervisor" })

  const headers = rows[0]
  const idx = (n: string) => headers.findIndex(h =>
    (h ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") === n.toLowerCase()
  )

  const iFecha     = idx("fecha")
  const iAgente    = idx("agente")
  const iAgenteId  = idx("agente_id")
  const iTipo      = idx("tipo")
  const iEstado    = idx("estado")
  const iJefe      = idx("jefe_inmediato")
  const iCoord     = idx("coordinador")

  const rol = perfil.rol?.toLowerCase()
  const esAdmin = rol === "admin"
  const esCoord = esAdmin || ["coordinador", "jefatura", "gerente"].includes(rol)
  const nombrePersona = (perfil.persona.nombre ?? "").toLowerCase().trim()

  const todos = rows.slice(1)
    .filter(r => {
      if (esAdmin) return true
      const col = esCoord ? (r[iCoord] ?? "") : (r[iJefe] ?? "")
      return col.toLowerCase().trim() === nombrePersona
    })
    .map(r => {
      const tipo   = r[iTipo]   ?? ""
      const estado = r[iEstado] ?? ""
      const e = estado.toLowerCase()
      const participo = tipo === "CDR"
        ? !e.includes("sin cdr")
        : !e.includes("sin diálogo") && !e.includes("sin dialogo")
      return {
        fecha:    r[iFecha]    ?? "",
        agenteId: r[iAgenteId] ?? "",
        agente:   nombreAgente(r[iAgente] ?? ""),
        tipo,
        estado,
        participo,
        jefe:     r[iJefe]     ?? "",
      }
    })

  // Derivar semanas desde fecha
  const semanas = [
    ...new Set(todos.map(r => fechaAIsoSemana(r.fecha)).filter(Boolean))
  ].sort((a, b) => Number(a) - Number(b))

  const semanaActual = resolverSemana(semanaParam, semanas)

  const deEstaSemana = todos.filter(r => fechaAIsoSemana(r.fecha) === semanaActual)

  function kpiTipo(tipo: string) {
    const filas = deEstaSemana.filter(r => r.tipo === tipo)
    if (!filas.length) return { pct: 0, alertas: 0 }
    const participo = filas.filter(r => r.participo).length
    const pct = Math.round((participo / filas.length) * 100)
    // Agentes con ≥1 día sin participar esta semana
    const agentesConFalta = new Set(filas.filter(r => !r.participo).map(r => r.agenteId)).size
    return { pct, alertas: agentesConFalta }
  }

  const kpi = {
    dialogo: kpiTipo("Diálogo"),
    cdr:     kpiTipo("CDR"),
  }

  if (esCoord) {
    const supervisores = [...new Set(deEstaSemana.map(r => r.jefe).filter(Boolean))]
    const supervisoresResumen = supervisores.map(jefe => {
      const filas = deEstaSemana.filter(r => r.jefe === jefe)
      const agentesUnicos = new Set(filas.map(r => r.agenteId)).size
      const kpD = kpiFilas(filas.filter(r => r.tipo === "Diálogo"))
      const kpC = kpiFilas(filas.filter(r => r.tipo === "CDR"))
      return { supervisor: jefe, totalAgentes: agentesUnicos, pctDialogo: kpD, pctCDR: kpC }
    }).sort((a, b) => a.pctDialogo - b.pctDialogo)

    return NextResponse.json({
      modo: "coordinador",
      semanas,
      semanaActual,
      kpi,
      supervisoresResumen,
      registros: deEstaSemana,
    })
  }

  return NextResponse.json({
    modo: "supervisor",
    semanas,
    semanaActual,
    kpi,
    registros: deEstaSemana,
  })
}

function kpiFilas(filas: { participo: boolean }[]): number {
  if (!filas.length) return 0
  return Math.round((filas.filter(r => r.participo).length / filas.length) * 100)
}
