import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"
import { authOptions } from "@/lib/authOptions"
import { getSheetData } from "@/lib/sheets"
import { obtenerPerfil } from "@/lib/jerarquia"

const SHEET_ID = "1tmFJQ4EJaUTCbogu11klf7GSzXpzevn7gw3U84Rw3zM"
const HOJA = "Datos"

const META_IMPLEMENTACION = 23  // Fallback si la jefatura no está en la hoja Metas
const META_BACKLOG_MAX    = 10  // Aplicados ≤ 10% (fijo)
const HOJA_METAS = "Metas"

function normalizarEtapa(etapa: string): string {
  const e = etapa.toLowerCase().trim()
  if (e.includes("aplicad") || e.includes("applied")) return "Aplicados"
  if (e.includes("selecion") || e.includes("seleccion") || e.includes("selected")) return "Seleccionados"
  if (e.includes("declin") || e.includes("rechaz")) return "Declinados"
  if (e.includes("lider_coach") || e.includes("líder coach")) return "Lider Coach"
  if (e.includes("lider_guardiao") || e.includes("lider guardião")) return "Lider Guardião"
  if (e.includes("mejora") || e.includes("melhoria")) return "Mejora Continua"
  if (e.includes("coordenacao") || e.includes("coordinacion")) return "Coordinación"
  if (e.includes("jefe") || e.includes("gerencia") || e.includes("diretoria")) return "Gerencia"
  return etapa
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const email = req.nextUrl.searchParams.get("email") ?? session.user?.email ?? ""
  const perfil = await obtenerPerfil(session.accessToken, email)
  if (!perfil) return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 })

  let rows: string[][]
  try {
    rows = await getSheetData(session.accessToken, SHEET_ID, `${HOJA}!A:Z`)
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
  if (rows.length < 2) return NextResponse.json({ total: 0, porEtapa: {}, metas: {} })

  const headers = rows[0]
  const idx = (n: string) => headers.findIndex(h => (h ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") === n.toLowerCase())

  const iEtapa    = idx("etapa atual")
  const iNombreA  = idx("nombre asesor")
  const iLider    = idx("lider socio")
  const iCoord    = idx("coordinador")
  const iJefatura = idx("jefatura")

  // Mapa Jefatura → meta de implementación (%). La hoja Metas tiene "Jefatura | Meta" (decimal "0,27")
  const metaMap: Record<string, number> = {}
  try {
    const metasRows = await getSheetData(session.accessToken, SHEET_ID, `${HOJA_METAS}!A:B`)
    metasRows.slice(1).forEach(r => {
      const jef = (r[0] ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim()
      const valor = parseFloat((r[1] ?? "").replace(",", ".")) || 0
      if (jef) metaMap[jef] = Math.round(valor * 100)
    })
  } catch { /* si falla, se usa el fallback META_IMPLEMENTACION */ }

  const metaDeJefatura = (jef: string) =>
    metaMap[(jef ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim()] ?? META_IMPLEMENTACION
  const iProblema = headers.findIndex(h => (h ?? "").toLowerCase().includes("problema") || (h ?? "").toLowerCase().includes("situação"))
  const iPropuesta = headers.findIndex(h => (h ?? "").toLowerCase().includes("proposta") || (h ?? "").toLowerCase().includes("propuesta"))

  const nombrePersona = (perfil.persona.nombre ?? "").toLowerCase().trim()
  const esCoord = ["coordinador", "jefatura", "gerente"].includes(perfil.rol?.toLowerCase())

  const ideas = rows.slice(1).filter(r => {
    const lider = (r[iLider] ?? "").toLowerCase().trim()
    const coord = (r[iCoord] ?? "").toLowerCase().trim()
    return esCoord ? coord === nombrePersona : lider === nombrePersona
  }).map(r => ({
    etapa:     normalizarEtapa(r[iEtapa] ?? ""),
    etapaRaw:  r[iEtapa] ?? "",
    asesor:    r[iNombreA]  ?? "",
    jefatura:  iJefatura >= 0 ? (r[iJefatura] ?? "") : "",
    problema:  iProblema >= 0 ? r[iProblema] : "",
    propuesta: iPropuesta >= 0 ? r[iPropuesta] : "",
  }))

  const total = ideas.length

  // Conteo por etapa normalizada
  const porEtapa: Record<string, number> = {}
  ideas.forEach(i => { porEtapa[i.etapa] = (porEtapa[i.etapa] ?? 0) + 1 })

  // Métricas clave
  const seleccionados = porEtapa["Seleccionados"] ?? 0
  const aplicados     = porEtapa["Aplicados"]     ?? 0
  const pctImplementacion = total > 0 ? Math.round((seleccionados / total) * 100) : 0
  const pctBacklog        = total > 0 ? Math.round((aplicados     / total) * 100) : 0

  // ── Meta de implementación dinámica por jefatura ──────────────────
  // Conteo de ideas por jefatura (para meta predominante / ponderada / desglose)
  const ideasPorJefatura: Record<string, number> = {}
  ideas.forEach(i => { if (i.jefatura) ideasPorJefatura[i.jefatura] = (ideasPorJefatura[i.jefatura] ?? 0) + 1 })
  const jefaturasPresentes = Object.keys(ideasPorJefatura)

  // Desglose por jefatura (lo usa el coordinador; también sirve al supervisor con 1 jefatura)
  const porJefatura = jefaturasPresentes.map(jef => {
    const ideasJef = ideas.filter(i => i.jefatura === jef)
    const t = ideasJef.length
    const sel = ideasJef.filter(i => i.etapa === "Seleccionados").length
    const pct = t > 0 ? Math.round((sel / t) * 100) : 0
    const meta = metaDeJefatura(jef)
    return { jefatura: jef, meta, total: t, seleccionados: sel, pctImpl: pct, cumple: pct >= meta }
  }).sort((a, b) => (a.pctImpl - a.meta) - (b.pctImpl - b.meta))

  // Meta a aplicar en el KPI global:
  // - Supervisor (1 jefatura): la de su jefatura predominante.
  // - Coordinador (varias): promedio ponderado por # de ideas (el desglose muestra el detalle real).
  const metaImplementacion = total > 0 && jefaturasPresentes.length > 0
    ? Math.round(jefaturasPresentes.reduce((s, jef) => s + metaDeJefatura(jef) * ideasPorJefatura[jef], 0) / total)
    : META_IMPLEMENTACION

  const metas = {
    implementacion: {
      valor: pctImplementacion,
      meta: metaImplementacion,
      cumple: pctImplementacion >= metaImplementacion,
      cantidad: seleccionados,
      multiJefatura: jefaturasPresentes.length > 1,
    },
    backlog: {
      valor: pctBacklog,
      meta: META_BACKLOG_MAX,
      cumple: pctBacklog <= META_BACKLOG_MAX,
      cantidad: aplicados,
    },
  }

  // Para coordinador: agrupar por supervisor
  let porSupervisor: { supervisor: string; total: number; pctImpl: number; pctBacklog: number }[] | undefined
  if (esCoord) {
    const supervisores = [...new Set(ideas.map(i => {
      const row = rows.slice(1).find(r => normalizarEtapa(r[iEtapa] ?? "") === i.etapa && (r[iNombreA] ?? "") === i.asesor)
      return row ? (row[iLider] ?? "") : ""
    }).filter(Boolean))]

    // Re-filtrar por supervisor
    porSupervisor = supervisores.map(sup => {
      const ideasSup = rows.slice(1)
        .filter(r => (r[iLider] ?? "").toLowerCase().trim() === sup.toLowerCase().trim() &&
                     (r[iCoord] ?? "").toLowerCase().trim() === nombrePersona)
        .map(r => normalizarEtapa(r[iEtapa] ?? ""))
      const t = ideasSup.length
      const sel = ideasSup.filter(e => e === "Seleccionados").length
      const apl = ideasSup.filter(e => e === "Aplicados").length
      return {
        supervisor: sup,
        total: t,
        pctImpl:    t > 0 ? Math.round((sel / t) * 100) : 0,
        pctBacklog: t > 0 ? Math.round((apl / t) * 100) : 0,
      }
    }).filter(s => s.total > 0)
  }

  return NextResponse.json({
    total,
    porEtapa,
    metas,
    porJefatura,
    ultimas5: ideas.slice(-5),
    porSupervisor,
  })
}
