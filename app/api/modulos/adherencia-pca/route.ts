import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"
import { authOptions } from "@/lib/authOptions"
import { getSheetData } from "@/lib/sheets"
import { obtenerPerfil, cargarPersonas, type Persona } from "@/lib/jerarquia"
import { resolverSemana } from "@/lib/semana"

const SHEET_ID_PCA   = "1MZiP7K4JbElp3lM2n0Tr554WNN1RTfGlsgCB9uJ8tSw"
const HOJA_PCA       = "Detalle Eventos"

const SHEET_ID_PAUTA = "1MVyZW1N45iQgDiii6cnCFBCwFl4zk6B5s4ScqkwNF-U"
const HOJA_PAUTA     = "Alertas"

const META_DIARIA = 5

function parseCumplePct(v: string): number {
  return parseFloat((v ?? "").replace(",", ".").replace("%", "")) || 0
}

// Normaliza el número de semana quitando ceros a la izquierda, igual que
// normalizarSemana() en SemanaGlobalContext, para que "2" y "02" sean la
// misma semana al cruzar PCA/PTA ("Detalle Eventos") con Pauta ("Alertas").
function normSemana(s: string): string {
  const digitos = (s ?? "").replace(/\D/g, "")
  if (!digitos) return ""
  return String(Number(digitos))
}

// Normaliza nombres para comparar entre hojas distintas (Detalle Eventos, Alertas,
// base de personas) que pueden tener distinto formato de mayúsculas/acentos/espacios.
function normNombre(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function parseSheetDate(dateStr: string): Date | null {
  if (!dateStr) return null
  const s = dateStr.trim()
  // Formato ISO: "2026-06-01" o "2026-06-01 12:02"
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
    return isNaN(d.getTime()) ? null : d
  }
  // Formato LATAM: "dd/mm/yyyy" o "dd/mm/yyyy HH:MM:SS"
  const parts = s.split("/")
  if (parts.length === 3) {
    const day   = Number(parts[0])
    const month = Number(parts[1])
    const year  = Number(parts[2].split(" ")[0].split("T")[0])
    if (!isNaN(day) && !isNaN(month) && !isNaN(year) && year > 1900) {
      const d = new Date(year, month - 1, day)
      return isNaN(d.getTime()) ? null : d
    }
  }
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

interface DiaTipo { total: number; cumple: number }
interface DiaCombinado {
  semana: string
  dia: number
  total: number
  cumple: number
  cumpleMeta: boolean
  pcapta: DiaTipo
  pauta: DiaTipo
}

function promedio(vals: number[]): number {
  return vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0
}

// Combina los registros PCA/PTA y Pauta de un mismo supervisor en un arreglo de
// días (semana + día 1-5) con totales y % de cumplimiento por tipo y combinado.
function combinarDias(
  pca: { semana: string; dia: number; origen: string; total: number; cumple: string }[],
  pauta: { semana: string; dia: number; nota: number }[]
): DiaCombinado[] {
  // PCA y PTA llegan en filas separadas (col "Origen"): varias filas-evento por
  // día/origen → tomar el MÁXIMO de "total" y el cumple asociado dentro de cada origen.
  const porDiaOrigen: Record<string, { total: number; cumple: number }> = {}
  pca.forEach(r => {
    if (!r.semana || !r.dia) return
    const key = `${r.semana}-${r.dia}-${r.origen}`
    const prev = porDiaOrigen[key]
    const cumple = parseCumplePct(r.cumple)
    porDiaOrigen[key] = {
      total:  prev ? Math.max(prev.total, r.total) : r.total,
      cumple: cumple || prev?.cumple || 0,
    }
  })

  // Combinar PCA + PTA por día: SUMAR los totales de cada origen y promediar el
  // cumplimiento ponderado por el total de cada uno.
  const acumDia: Record<string, { total: number; sumaPonderada: number }> = {}
  Object.entries(porDiaOrigen).forEach(([key, val]) => {
    const [semana, dia] = key.split("-")
    const diaKey = `${semana}-${dia}`
    const prev = acumDia[diaKey] ?? { total: 0, sumaPonderada: 0 }
    acumDia[diaKey] = {
      total: prev.total + val.total,
      sumaPonderada: prev.sumaPonderada + val.cumple * val.total,
    }
  })
  const porDiaPCA: Record<string, { total: number; cumple: number }> = {}
  Object.entries(acumDia).forEach(([diaKey, val]) => {
    porDiaPCA[diaKey] = {
      total: val.total,
      cumple: val.total > 0 ? Math.round(val.sumaPonderada / val.total) : 0,
    }
  })

  // Pauta: cada fila es un monitoreo individual → contar y promediar NotaFinal
  const porDiaPauta: Record<string, { total: number; notas: number[] }> = {}
  pauta.forEach(r => {
    if (!r.semana || !r.dia) return
    const key = `${r.semana}-${r.dia}`
    const prev = porDiaPauta[key] ?? { total: 0, notas: [] }
    prev.total += 1
    prev.notas.push(r.nota)
    porDiaPauta[key] = prev
  })

  const claves = new Set([...Object.keys(porDiaPCA), ...Object.keys(porDiaPauta)])
  const dias: DiaCombinado[] = [...claves].map(key => {
    const [semana, diaStr] = key.split("-")
    const dia = Number(diaStr)
    const pcaDia = porDiaPCA[key]
    const pautaDia = porDiaPauta[key]
    const pcaptaTotal = pcaDia?.total ?? 0
    const pcaptaCumple = pcaDia?.cumple ?? 0
    const pautaTotal = pautaDia?.total ?? 0
    const pautaCumple = pautaDia ? promedio(pautaDia.notas) : 0
    const total = pcaptaTotal + pautaTotal
    const cumple = total > 0
      ? Math.round((pcaptaCumple * pcaptaTotal + pautaCumple * pautaTotal) / total)
      : 0
    return {
      semana, dia, total, cumple,
      cumpleMeta: total >= META_DIARIA,
      pcapta: { total: pcaptaTotal, cumple: pcaptaCumple },
      pauta:  { total: pautaTotal, cumple: pautaCumple },
    }
  })

  return dias
}

function porTipoResumen(dias: DiaCombinado[]) {
  const conPCA = dias.filter(d => d.pcapta.total > 0)
  const conPauta = dias.filter(d => d.pauta.total > 0)
  return {
    pcapta: {
      pct: promedio(conPCA.map(d => d.pcapta.cumple)),
      total: dias.reduce((s, d) => s + d.pcapta.total, 0),
    },
    pauta: {
      pct: promedio(conPauta.map(d => d.pauta.cumple)),
      total: dias.reduce((s, d) => s + d.pauta.total, 0),
    },
  }
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const email = req.nextUrl.searchParams.get("email") ?? session.user?.email ?? ""
  const semanaParam = req.nextUrl.searchParams.get("semana")
  const perfil = await obtenerPerfil(session.accessToken, email)
  if (!perfil) return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 })

  const [pcaResult, pautaResult, personasResult] = await Promise.allSettled([
    getSheetData(session.accessToken, SHEET_ID_PCA, `${HOJA_PCA}!A:P`),
    getSheetData(session.accessToken, SHEET_ID_PAUTA, `'${HOJA_PAUTA}'!A:R`),
    cargarPersonas(session.accessToken),
  ])

  if (pcaResult.status === "rejected" && pautaResult.status === "rejected") {
    return NextResponse.json({ error: pcaResult.reason instanceof Error ? pcaResult.reason.message : String(pcaResult.reason) }, { status: 500 })
  }

  const rowsPCA = pcaResult.status === "fulfilled" ? pcaResult.value : []
  const rowsPauta = pautaResult.status === "fulfilled" ? pautaResult.value : []
  const personas = personasResult.status === "fulfilled" ? personasResult.value : []

  // Mapa BP (usuario_gestor_1) -> persona, para resolver el líder real que hizo
  // el monitoreo (jefe_inmediato del asesor evaluado), ya que la columna
  // "Supervisor" de Alertas en realidad es el jefe inmediato del evaluado.
  const personasPorBP = new Map<string, Persona>()
  personas.forEach(p => {
    const bp = (p.usuarioLatam ?? "").toString().trim().toLowerCase()
    if (bp) personasPorBP.set(bp, p)
  })

  const idxOf = (headers: string[], n: string) => headers.findIndex(h =>
    (h ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") === n.toLowerCase()
  )

  const rol = perfil.rol?.toLowerCase()
  const esAdmin = rol === "admin"
  const esCoord = esAdmin || ["coordinador", "jefatura", "gerente"].includes(rol)
  const nombrePersona = normNombre(perfil.persona.nombre ?? "")

  // ── Parsear PCA/PTA ("Detalle Eventos") ──────────────────────────────
  let registrosPCA: { nombre: string; dia: number; semana: string; origen: string; total: number; cumple: string }[] = []
  if (rowsPCA.length >= 2) {
    const headers = rowsPCA[0]
    const iNombre  = idxOf(headers, "nombre")
    const iJefe    = idxOf(headers, "jefe inmediato")
    const iOrigen  = idxOf(headers, "origen")
    const iDia     = idxOf(headers, "dia semana")
    const iSemana  = idxOf(headers, "semana")
    const iTotal   = idxOf(headers, "total gestion dia")
    const iCumple  = idxOf(headers, "cumplimiento dia")

    registrosPCA = rowsPCA.slice(1)
      .filter(r => {
        if (esAdmin) return true
        const col = esCoord ? (r[iJefe] ?? "") : (r[iNombre] ?? "")
        return normNombre(col) === nombrePersona
      })
      .map(r => ({
        nombre:  r[iNombre]  ?? "",
        dia:     parseInt(r[iDia] ?? "0") || 0,
        semana:  normSemana(r[iSemana] ?? ""),
        origen:  r[iOrigen]  ?? "",
        total:   parseInt(r[iTotal] ?? "0") || 0,
        cumple:  r[iCumple]  ?? "",
      }))
  }

  // ── Parsear Pauta de Calidad ("Alertas") ─────────────────────────────
  let registrosPauta: { nombre: string; dia: number; semana: string; nota: number }[] = []
  if (rowsPauta.length >= 2) {
    const headers = rowsPauta[0]
    const iSupervisor = idxOf(headers, "supervisor")
    const iBP         = idxOf(headers, "bp")
    const iEvaluador  = idxOf(headers, "evaluador")
    const iSemana     = idxOf(headers, "semana")
    const iFecha      = idxOf(headers, "fecha auditoria")
    const iNota       = idxOf(headers, "notafinal")

    registrosPauta = rowsPauta.slice(1)
      // El campo "Evaluador" indica quién hizo el monitoreo: solo cuentan los
      // hechos por LL.OO (el propio líder); QMOS y SUPERVISOR no se contabilizan.
      .filter(r => normNombre(r[iEvaluador] ?? "") === "ll.oo")
      .map(r => {
        const bp = (r[iBP] ?? "").toString().trim().toLowerCase()
        // La columna "Supervisor" es en realidad el jefe inmediato del evaluado.
        // El líder real que hizo el monitoreo es el jefe inmediato del asesor (BP).
        const lider = personasPorBP.get(bp)?.jefeInmediato || r[iSupervisor] || ""
        const fecha = parseSheetDate(r[iFecha] ?? "")
        return {
          nombre:  lider,
          dia:     fecha ? fecha.getDay() : 0, // 1=Lun .. 5=Vie
          semana:  normSemana(r[iSemana] ?? ""),
          nota:    parseCumplePct(r[iNota] ?? ""),
        }
      })
      .filter(r => {
        const lider = normNombre(r.nombre ?? "")
        if (!lider) return false
        if (esAdmin) return true
        if (esCoord) {
          return perfil.supervisores.some(s => normNombre(s.nombre ?? "") === lider)
        }
        return lider === nombrePersona
      })
      .filter(r => r.dia >= 1 && r.dia <= 5)
  }

  if (registrosPCA.length === 0 && registrosPauta.length === 0) {
    return NextResponse.json({ modo: esCoord ? "coordinador" : "supervisor", dias: [], semanas: [], porSupervisor: [] })
  }

  // ── Semanas disponibles (unión de ambas fuentes) ─────────────────────
  const semanas = [...new Set([
    ...registrosPCA.map(r => r.semana),
    ...registrosPauta.map(r => r.semana),
  ].filter(Boolean))].sort((a, b) => Number(a) - Number(b))

  const semanaActual = resolverSemana(semanaParam, semanas)

  const pcaSemana = registrosPCA.filter(r => r.semana === semanaActual)
  const pautaSemana = registrosPauta.filter(r => r.semana === semanaActual)

  if (esCoord) {
    // Vista coordinador/admin: agrupar por supervisor (nombre evaluado, normalizado
    // para fusionar el mismo supervisor aunque venga con distinto formato en cada hoja)
    const supervisoresMap = new Map<string, string>()
    pcaSemana.forEach(r => {
      if (r.nombre && !supervisoresMap.has(normNombre(r.nombre))) supervisoresMap.set(normNombre(r.nombre), r.nombre)
    })
    pautaSemana.forEach(r => {
      if (r.nombre && !supervisoresMap.has(normNombre(r.nombre))) supervisoresMap.set(normNombre(r.nombre), r.nombre)
    })

    const porSupervisor = [...supervisoresMap.entries()].map(([key, nombre]) => {
      const filasPCA = pcaSemana.filter(r => normNombre(r.nombre) === key)
        .map(({ dia, semana, origen, total, cumple }) => ({ dia, semana, origen, total, cumple }))
      const filasPauta = pautaSemana.filter(r => normNombre(r.nombre) === key)
        .map(({ dia, semana, nota }) => ({ dia, semana, nota }))

      const dias = combinarDias(filasPCA, filasPauta)
      const conDatos = dias.filter(d => d.total > 0)
      const promCumple = promedio(conDatos.map(d => d.cumple))
      const totalMonitoreos = dias.reduce((s, d) => s + d.total, 0)
      const diasConMeta = dias.filter(d => d.cumpleMeta).length

      return {
        supervisor: nombre,
        dias: dias.length,
        promCumple,
        totalMonitoreos,
        diasConMeta,
        porTipo: porTipoResumen(dias),
      }
    }).sort((a, b) => a.promCumple - b.promCumple)

    const pctGlobal = promedio(porSupervisor.map(p => p.promCumple))
    const totalMonitoreos = porSupervisor.reduce((s, p) => s + p.totalMonitoreos, 0)
    const diasGlobal = [...supervisoresMap.keys()].flatMap(key => combinarDias(
      pcaSemana.filter(r => normNombre(r.nombre) === key).map(({ dia, semana, origen, total, cumple }) => ({ dia, semana, origen, total, cumple })),
      pautaSemana.filter(r => normNombre(r.nombre) === key).map(({ dia, semana, nota }) => ({ dia, semana, nota })),
    ))

    const resCoord = NextResponse.json({
      modo: "coordinador",
      semanas,
      semanaActual,
      kpi: { pct: pctGlobal, totalMonitoreos, porTipo: porTipoResumen(diasGlobal) },
      porSupervisor,
    })
    resCoord.headers.set('Cache-Control', 'private, max-age=120, stale-while-revalidate=60')
    return resCoord
  }

  // ── Vista supervisor/coach: sus propios monitoreos ───────────────────
  const filasPCA = registrosPCA.map(({ dia, semana, origen, total, cumple }) => ({ dia, semana, origen, total, cumple }))
  const filasPauta = registrosPauta.map(({ dia, semana, nota }) => ({ dia, semana, nota }))
  const todosLosDias = combinarDias(filasPCA, filasPauta)

  const dias = todosLosDias.map(d => ({
    semana: d.semana,
    dia: d.dia,
    total: d.total,
    cumple: String(d.cumple),
    cumpleMeta: d.cumpleMeta,
    porTipo: { pcapta: d.pcapta, pauta: d.pauta },
  }))

  const diasSemanaActual = todosLosDias.filter(d => d.semana === semanaActual)
  const conDatos = diasSemanaActual.filter(d => d.total > 0)
  const pctPromedio = promedio(conDatos.map(d => d.cumple))
  const totalMonitoreosSemana = diasSemanaActual.reduce((s, d) => s + d.total, 0)
  const diasConMeta = diasSemanaActual.filter(d => d.cumpleMeta).length

  const response = NextResponse.json({
    modo: "supervisor",
    semanas,
    semanaActual,
    kpi: {
      pct: pctPromedio,
      totalMonitoreos: totalMonitoreosSemana,
      diasConMeta,
      meta: META_DIARIA,
      porTipo: porTipoResumen(diasSemanaActual),
    },
    dias,
  })

  // Caché corta: las hojas son grandes, sin caché agota la quota
  response.headers.set('Cache-Control', 'private, max-age=120, stale-while-revalidate=60')
  return response
}
