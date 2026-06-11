import { getSheetData } from "@/lib/sheets"
import { obtenerAgendaLider, type AgendaLiderArchivo } from "@/lib/drive"

/**
 * Normaliza un número de semana quitando ceros a la izquierda y cualquier
 * prefijo no numérico (ej. "W24" -> "24", "02" -> "2"), igual que
 * normalizarSemana() en SemanaGlobalContext, para poder cruzar semanas
 * entre hojas con formatos distintos.
 */
export function normSemana(s: string | number | null | undefined): string {
  const digitos = String(s ?? "").replace(/\D/g, "")
  if (!digitos) return ""
  return String(Number(digitos))
}

const idxFactory = (headers: string[]) => (n: string) =>
  headers.findIndex(h => (h ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") === n.toLowerCase())

/**
 * Normaliza nombres de personas para comparar entre hojas de distintos sistemas
 * fuente (jerarquía, Detalle Eventos, Pausas 4DX, Resumen_Lideres, Confirmaciones
 * de Rol), que pueden traer distinto formato de mayúsculas/acentos/espacios.
 */
function normNombre(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Busca, dentro de `supervisoresEquipo` (nombres "canónicos" de la jerarquía),
 * el que coincide (normalizando acentos/espacios) con `raw` —el nombre tal como
 * viene de una hoja de otro sistema fuente. Devuelve el nombre canónico para
 * usarlo como llave y poder cruzar con las demás prácticas.
 */
function matchSupervisor(raw: string | null | undefined, supervisoresEquipo: string[]): string | null {
  const norm = normNombre(raw)
  if (!norm) return null
  return supervisoresEquipo.find(s => normNombre(s) === norm) ?? null
}

function categorizarEstadoCompromiso(estado: string): "sin_ingreso" | "abierto" | "cerrado_mejora" | "cerrado_sin_mejora" {
  const e = (estado ?? "").trim().toLowerCase()
  if (!e || e.includes("sin ingreso")) return "sin_ingreso"
  if (e.includes("con cumplimiento") || e.includes("con mejora")) return "cerrado_mejora"
  if (e.includes("sin cumplimiento") || e.includes("sin mejora") || e.startsWith("cerrado")) return "cerrado_sin_mejora"
  return "abierto"
}

function condensarEstadoFeedback(etapa: string): "nuevo" | "gestionado" | "rechazado" {
  const e = etapa.toLowerCase().trim()
  if (e.includes("declin") || e.includes("rechaz")) return "rechazado"
  if (e === "seleccionado" || e.includes("gestion")) return "gestionado"
  return "nuevo"
}

function presentoQuiz(v: string) {
  const s = (v ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim()
  if (s.includes("no presento")) return false
  return s.includes("presento")
}
function aproboQuiz(puntuacion: string) {
  return parseInt(puntuacion ?? "0") >= 30
}

function normalizarEtapaResolutividad(etapa: string): string {
  const e = etapa.toLowerCase().trim()
  if (e.includes("aplicad") || e.includes("applied")) return "Aplicados"
  if (e.includes("selecion") || e.includes("seleccion") || e.includes("selected")) return "Seleccionados"
  if (e.includes("declin") || e.includes("rechaz")) return "Declinados"
  return etapa
}

export interface Adherencia4dxSemana {
  semana: string
  pct: number
  totalAgentes: number
  totalRegistros: number
}

export interface PracticasLiderSemana {
  semana: string
  pct: number
  cdr: number | null
  totalDias: number
}

export interface PcaPtaSemana {
  semana: string
  pct: number
  totalMonitoreos: number
  diasConDatos: number
}

export interface CompromisosSemana {
  semana: string
  total: number
  sinIngreso: number
  abiertos: number
  cerradoMejora: number
  cerradoSin: number
}

export interface QuizSemana {
  semana: string
  total: number
  presento: number
  noPresento: number
  aprueba: number
}

export interface EstoyEnteradoSemana {
  semana: string
  total: number
  si: number
  no: number
  sinRespuesta: number
  pctClaro: number
}

export interface CopilotSemana {
  semana: string
  pctDialogo: number
  pctCDR: number
  agentesConFaltaDialogo: number
  agentesConFaltaCDR: number
}

export interface ResolutividadResumen {
  total: number
  pctImpl: number
  pctBacklog: number
}

export interface FeedbackResumen {
  total: number
  nuevos: number
  gestionados: number
  rechazados: number
}

export interface ConfirmacionesCoordinador {
  totalEstaSemana: number
  meta: number
  cumpleMeta: boolean
  ultimoIngreso: string | null
  diasDesdeUltimoIngreso: number | null
}

export interface TendenciaMetrica {
  actual: number
  anterior: number
  delta: number
  direccion: "mejora" | "empeora" | "igual"
}

export interface Tendencia {
  adherencia4dx: { pct: TendenciaMetrica } | null
  practicasLideres: { pct: TendenciaMetrica } | null
  pcaPta: { pct: TendenciaMetrica } | null
  compromisos: { pctSinIngreso: TendenciaMetrica; pctCerradoMejora: TendenciaMetrica } | null
  quiz: { pctPresento: TendenciaMetrica; pctAprueba: TendenciaMetrica } | null
  estoyEnterado: { pctClaro: TendenciaMetrica } | null
  compromisosCopilot: { pctDialogo: TendenciaMetrica; pctCDR: TendenciaMetrica } | null
}

const round1 = (n: number) => Math.round(n * 10) / 10

function tendenciaMetrica(actual: number, anterior: number, mayorEsMejor: boolean): TendenciaMetrica {
  const delta = round1(actual - anterior)
  const direccion: TendenciaMetrica["direccion"] = delta === 0 ? "igual" : (delta > 0) === mayorEsMejor ? "mejora" : "empeora"
  return { actual: round1(actual), anterior: round1(anterior), delta, direccion }
}

interface DatosSemana {
  adherencia4dx: Adherencia4dxSemana | null
  practicasLideres: PracticasLiderSemana | null
  pcaPta: PcaPtaSemana | null
  compromisos: CompromisosSemana | null
  quiz: QuizSemana | null
  estoyEnterado: EstoyEnteradoSemana | null
  compromisosCopilot: CopilotSemana | null
}

/**
 * Compara los datos de una semana contra la semana inmediatamente anterior
 * y devuelve los deltas por práctica. Devuelve `null` por práctica si falta
 * el dato actual o el anterior (sin registros esa semana).
 */
export function calcularTendencia(actual: DatosSemana, anterior: DatosSemana | undefined): Tendencia {
  const a: DatosSemana = anterior ?? {
    adherencia4dx: null, practicasLideres: null, pcaPta: null, compromisos: null, quiz: null, estoyEnterado: null, compromisosCopilot: null,
  }

  const adherencia4dx = (actual.adherencia4dx && a.adherencia4dx)
    ? { pct: tendenciaMetrica(actual.adherencia4dx.pct, a.adherencia4dx.pct, true) }
    : null

  const practicasLideres = (actual.practicasLideres && a.practicasLideres)
    ? { pct: tendenciaMetrica(actual.practicasLideres.pct, a.practicasLideres.pct, true) }
    : null

  const pcaPta = (actual.pcaPta && a.pcaPta)
    ? { pct: tendenciaMetrica(actual.pcaPta.pct, a.pcaPta.pct, true) }
    : null

  const compromisos = (actual.compromisos && a.compromisos && actual.compromisos.total > 0 && a.compromisos.total > 0)
    ? {
        pctSinIngreso: tendenciaMetrica(
          (actual.compromisos.sinIngreso / actual.compromisos.total) * 100,
          (a.compromisos.sinIngreso / a.compromisos.total) * 100,
          false,
        ),
        pctCerradoMejora: tendenciaMetrica(
          (actual.compromisos.cerradoMejora / actual.compromisos.total) * 100,
          (a.compromisos.cerradoMejora / a.compromisos.total) * 100,
          true,
        ),
      }
    : null

  const quiz = (actual.quiz && a.quiz && actual.quiz.total > 0 && a.quiz.total > 0)
    ? {
        pctPresento: tendenciaMetrica(
          (actual.quiz.presento / actual.quiz.total) * 100,
          (a.quiz.presento / a.quiz.total) * 100,
          true,
        ),
        pctAprueba: tendenciaMetrica(
          actual.quiz.presento > 0 ? (actual.quiz.aprueba / actual.quiz.presento) * 100 : 0,
          a.quiz.presento > 0 ? (a.quiz.aprueba / a.quiz.presento) * 100 : 0,
          true,
        ),
      }
    : null

  const estoyEnterado = (actual.estoyEnterado && a.estoyEnterado && actual.estoyEnterado.total > 0 && a.estoyEnterado.total > 0)
    ? { pctClaro: tendenciaMetrica(actual.estoyEnterado.pctClaro, a.estoyEnterado.pctClaro, true) }
    : null

  const compromisosCopilot = (actual.compromisosCopilot && a.compromisosCopilot)
    ? {
        pctDialogo: tendenciaMetrica(actual.compromisosCopilot.pctDialogo, a.compromisosCopilot.pctDialogo, true),
        pctCDR: tendenciaMetrica(actual.compromisosCopilot.pctCDR, a.compromisosCopilot.pctCDR, true),
      }
    : null

  return { adherencia4dx, practicasLideres, pcaPta, compromisos, quiz, estoyEnterado, compromisosCopilot }
}

export interface DatosInforme {
  alcance: { tipo: "coordinador" | "supervisor"; nombre: string }
  semanas: string[]
  porSupervisor: {
    supervisor: string
    porSemana: (DatosSemana & { semana: string; tendencia: Tendencia })[]
    resolutividad: ResolutividadResumen | null
    feedback: FeedbackResumen | null
    agendaLiderArchivo: AgendaLiderArchivo | null
  }[]
  confirmacionesCoordinador: ConfirmacionesCoordinador
}

/**
 * Agrega los datos de las prácticas 4DX por supervisor y semana, incluyendo
 * tendencia vs. la semana anterior. Usado tanto por /api/informes (datos
 * crudos) como por /api/informes/generar (narrativa IA).
 */
export async function construirDatosInforme(
  accessToken: string,
  nombreCoord: string,
  supervisoresEquipo: string[],
  semanas: string[],
  soloSupervisor?: string,
): Promise<DatosInforme> {
  const semanaPrevia = String(Number(semanas[0]) - 1)
  const semanasFetch = [...new Set([semanaPrevia, ...semanas])]

  const equipoParaSoporte = soloSupervisor ? [soloSupervisor] : supervisoresEquipo

  const [
    adherencia4dx, practicasLideres, pcaPta, compromisos, quiz, estoyEnterado, compromisosCopilot,
    resolutividad, feedback, confirmacionesCoordinador, agendaLiderArchivo,
  ] = await Promise.all([
    aggAdherencia4dx(accessToken, nombreCoord, equipoParaSoporte, semanasFetch),
    aggPracticasLideres(accessToken, nombreCoord, equipoParaSoporte, semanasFetch),
    aggPcaPta(accessToken, nombreCoord, equipoParaSoporte, semanasFetch),
    aggCompromisos(accessToken, nombreCoord, semanasFetch, soloSupervisor),
    aggQuiz(accessToken, nombreCoord, semanasFetch, soloSupervisor),
    aggEstoyEnterado(accessToken, equipoParaSoporte, semanasFetch, soloSupervisor),
    aggCompromisosCopilot(accessToken, nombreCoord, equipoParaSoporte, semanasFetch),
    aggResolutividad(accessToken, nombreCoord, soloSupervisor),
    aggFeedback(accessToken, equipoParaSoporte, soloSupervisor),
    aggConfirmacionesCoordinador(accessToken, nombreCoord),
    obtenerAgendaLider(accessToken, nombreCoord, equipoParaSoporte),
  ])

  const supervisores = soloSupervisor
    ? [soloSupervisor]
    : [...new Set([
        ...adherencia4dx.keys(), ...practicasLideres.keys(), ...pcaPta.keys(),
        ...compromisos.keys(), ...quiz.keys(), ...estoyEnterado.keys(), ...compromisosCopilot.keys(),
        ...resolutividad.keys(), ...feedback.keys(),
      ])]

  const buscar = <T extends { semana: string }>(mapa: Map<string, T[]>, sup: string, sem: string): T | null =>
    (mapa.get(sup) ?? []).find(f => f.semana === sem) ?? null

  const porSupervisor = supervisores.map(sup => ({
    supervisor: sup,
    porSemana: semanas.map(sem => {
      const datosSemana: DatosSemana = {
        adherencia4dx: buscar(adherencia4dx, sup, sem),
        practicasLideres: buscar(practicasLideres, sup, sem),
        pcaPta: buscar(pcaPta, sup, sem),
        compromisos: buscar(compromisos, sup, sem),
        quiz: buscar(quiz, sup, sem),
        estoyEnterado: buscar(estoyEnterado, sup, sem),
        compromisosCopilot: buscar(compromisosCopilot, sup, sem),
      }
      const semAnterior = String(Number(sem) - 1)
      const datosAnterior: DatosSemana = {
        adherencia4dx: buscar(adherencia4dx, sup, semAnterior),
        practicasLideres: buscar(practicasLideres, sup, semAnterior),
        pcaPta: buscar(pcaPta, sup, semAnterior),
        compromisos: buscar(compromisos, sup, semAnterior),
        quiz: buscar(quiz, sup, semAnterior),
        estoyEnterado: buscar(estoyEnterado, sup, semAnterior),
        compromisosCopilot: buscar(compromisosCopilot, sup, semAnterior),
      }
      return {
        semana: sem,
        ...datosSemana,
        tendencia: calcularTendencia(datosSemana, datosAnterior),
      }
    }),
    resolutividad: resolutividad.get(sup) ?? null,
    feedback: feedback.get(sup) ?? null,
    agendaLiderArchivo: agendaLiderArchivo.get(sup) ?? null,
  }))

  return {
    alcance: soloSupervisor
      ? { tipo: "supervisor", nombre: soloSupervisor }
      : { tipo: "coordinador", nombre: nombreCoord },
    semanas,
    porSupervisor,
    confirmacionesCoordinador,
  }
}

/**
 * Trae el histórico de "Adherencia 4DX" (hoja "Cumplimiento_Diario_MCI", igual
 * que /api/modulos/adherencia-4dx) y agrupa por (supervisor, semana): % de
 * registros diarios cumplidos (cumple_dia >= 1).
 */
export async function aggAdherencia4dx(
  accessToken: string,
  nombreCoord: string,
  supervisoresEquipo: string[],
  semanas: string[],
): Promise<Map<string, Adherencia4dxSemana[]>> {
  const SHEET_ID = "1UN-wQKOh1z9M4K4LUJiY1prj26Lo2taVR-szVhx-Gso"
  const HOJA = "Cumplimiento_Diario_MCI"
  const rows = await getSheetData(accessToken, SHEET_ID, `${HOJA}!A:J`)
  const resultado = new Map<string, Adherencia4dxSemana[]>()
  if (rows.length < 2) return resultado

  const headers = rows[0]
  const idx = idxFactory(headers)
  const iSemana = idx("semana")
  const iBP     = idx("bp")
  const iJefe   = idx("jefe_inmediato")
  const iCoord  = idx("coordinador")
  const iCumple = idx("cumple_dia")

  const coordNorm = normNombre(nombreCoord)
  const semSet = new Set(semanas)

  const buckets = new Map<string, { total: number; cumplieron: number; bps: Set<string> }>()
  rows.slice(1).forEach(r => {
    if (normNombre(r[iCoord]) !== coordNorm) return
    const sup = matchSupervisor(r[iJefe], supervisoresEquipo)
    if (!sup) return
    const sem = normSemana(r[iSemana])
    if (!semSet.has(sem)) return
    const key = `${sup}|||${sem}`
    if (!buckets.has(key)) buckets.set(key, { total: 0, cumplieron: 0, bps: new Set() })
    const b = buckets.get(key)!
    b.total++
    b.bps.add(r[iBP] ?? "")
    if ((parseFloat((r[iCumple] ?? "").replace(",", ".")) || 0) >= 1) b.cumplieron++
  })

  buckets.forEach((b, key) => {
    const [sup, sem] = key.split("|||")
    const fila: Adherencia4dxSemana = {
      semana: sem,
      pct: b.total > 0 ? Math.round((b.cumplieron / b.total) * 100) : 0,
      totalAgentes: b.bps.size,
      totalRegistros: b.total,
    }
    if (!resultado.has(sup)) resultado.set(sup, [])
    resultado.get(sup)!.push(fila)
  })

  resultado.forEach(filas => filas.sort((a, b) => Number(a.semana) - Number(b.semana)))
  return resultado
}

/**
 * Trae el histórico de "Prácticas Líderes" (hoja "Resumen_Lideres_Diario_Historico_8Sem",
 * igual que getPracticasLideres) y agrupa por (lider, semana): % de días con
 * agenda/práctica cumplida y CDR simulado promedio.
 */
export async function aggPracticasLideres(
  accessToken: string,
  nombreCoord: string,
  supervisoresEquipo: string[],
  semanas: string[],
): Promise<Map<string, PracticasLiderSemana[]>> {
  const SHEET_ID = "1UN-wQKOh1z9M4K4LUJiY1prj26Lo2taVR-szVhx-Gso"
  const HOJA = "Resumen_Lideres_Diario_Historico_8Sem"
  const rows = await getSheetData(accessToken, SHEET_ID, `${HOJA}!A:L`)
  const resultado = new Map<string, PracticasLiderSemana[]>()
  if (rows.length < 2) return resultado

  const headers = rows[0]
  const idx = idxFactory(headers)
  const iLider  = idx("lider")
  const iJefe   = idx("jefe_inmediato")
  const iSemana = idx("semana")
  const iCumple = idx("cumple")
  const iCDR    = idx("cdr_sim")

  // "Jefe_Inmediato" es el coordinador y "Lider" es el supervisor (igual que
  // en getPracticasLideres, vista coordinador).
  const coordNorm = normNombre(nombreCoord)
  const semSet = new Set(semanas)

  const buckets = new Map<string, { totalDias: number; cumplidos: number; cdrVals: number[] }>()
  rows.slice(1).forEach(r => {
    if (normNombre(r[iJefe]) !== coordNorm) return
    const lider = matchSupervisor(r[iLider], supervisoresEquipo)
    if (!lider) return
    const sem = normSemana(r[iSemana])
    if (!semSet.has(sem)) return
    const key = `${lider}|||${sem}`
    if (!buckets.has(key)) buckets.set(key, { totalDias: 0, cumplidos: 0, cdrVals: [] })
    const b = buckets.get(key)!
    b.totalDias++
    if ((r[iCumple] ?? "") === "1") b.cumplidos++
    const cdrRaw = r[iCDR] ?? ""
    if (cdrRaw && cdrRaw !== "0") {
      const n = parseFloat(cdrRaw.replace(",", "."))
      if (!isNaN(n)) b.cdrVals.push(n <= 1 ? n * 100 : n)
    }
  })

  buckets.forEach((b, key) => {
    const [lider, sem] = key.split("|||")
    const fila: PracticasLiderSemana = {
      semana: sem,
      pct: b.totalDias > 0 ? Math.round((b.cumplidos / b.totalDias) * 100) : 0,
      cdr: b.cdrVals.length > 0 ? Math.round(b.cdrVals.reduce((s, v) => s + v, 0) / b.cdrVals.length) : null,
      totalDias: b.totalDias,
    }
    if (!resultado.has(lider)) resultado.set(lider, [])
    resultado.get(lider)!.push(fila)
  })

  resultado.forEach(filas => filas.sort((a, b) => Number(a.semana) - Number(b.semana)))
  return resultado
}

/**
 * Trae el histórico de "Adherencia PCA/PTA" (hoja "Detalle Eventos", Panel Lea)
 * y agrupa por (jefe inmediato, semana): % de cumplimiento ponderado por
 * gestiones del día y total de monitoreos de la semana.
 */
export async function aggPcaPta(
  accessToken: string,
  nombreCoord: string,
  supervisoresEquipo: string[],
  semanas: string[],
): Promise<Map<string, PcaPtaSemana[]>> {
  const SHEET_ID = "1MZiP7K4JbElp3lM2n0Tr554WNN1RTfGlsgCB9uJ8tSw"
  const HOJA = "Detalle Eventos"
  const rows = await getSheetData(accessToken, SHEET_ID, `${HOJA}!A:P`)
  const resultado = new Map<string, PcaPtaSemana[]>()
  if (rows.length < 2) return resultado

  const headers = rows[0]
  const idx = idxFactory(headers)
  const iNombre = idx("nombre")
  const iJefe   = idx("jefe inmediato")
  const iOrigen = idx("origen")
  const iDia    = idx("dia semana")
  const iSemana = idx("semana")
  const iTotal  = idx("total gestion dia")
  const iCumple = idx("cumplimiento dia")

  // En "Detalle Eventos", "Jefe Inmediato" es el coordinador y "Nombre" es el
  // supervisor evaluado (igual que en /api/modulos/adherencia-pca).
  const coordNorm = normNombre(nombreCoord)
  const semSet = new Set(semanas)

  // supervisor|||semana|||dia|||origen -> {total, cumple} (varias filas-evento por día/origen -> máximo)
  const porDiaOrigen = new Map<string, { total: number; cumple: number }>()
  rows.slice(1).forEach(r => {
    if (normNombre(r[iJefe]) !== coordNorm) return
    const sup = matchSupervisor(r[iNombre], supervisoresEquipo)
    if (!sup) return
    const sem = normSemana(r[iSemana])
    if (!semSet.has(sem)) return
    const dia = parseInt(r[iDia] ?? "0") || 0
    if (!dia) return
    const total = parseInt(r[iTotal] ?? "0") || 0
    const cumple = parseFloat((r[iCumple] ?? "").replace(",", ".").replace("%", "")) || 0
    const key = `${sup}|||${sem}|||${dia}|||${r[iOrigen] ?? ""}`
    const prev = porDiaOrigen.get(key)
    porDiaOrigen.set(key, {
      total:  prev ? Math.max(prev.total, total) : total,
      cumple: cumple || prev?.cumple || 0,
    })
  })

  // Combinar PCA + PTA por día: sumar totales, promediar cumplimiento ponderado
  const porDia = new Map<string, { total: number; sumaPonderada: number }>()
  porDiaOrigen.forEach((val, key) => {
    const [jefe, sem, dia] = key.split("|||")
    const diaKey = `${jefe}|||${sem}|||${dia}`
    const prev = porDia.get(diaKey) ?? { total: 0, sumaPonderada: 0 }
    porDia.set(diaKey, {
      total: prev.total + val.total,
      sumaPonderada: prev.sumaPonderada + val.cumple * val.total,
    })
  })

  // Agrupar por jefe + semana
  const porSemana = new Map<string, { totalMonitoreos: number; sumaPct: number; diasConDatos: number }>()
  porDia.forEach((val, key) => {
    const [jefe, sem] = key.split("|||")
    const semKey = `${jefe}|||${sem}`
    const prev = porSemana.get(semKey) ?? { totalMonitoreos: 0, sumaPct: 0, diasConDatos: 0 }
    if (val.total > 0) {
      porSemana.set(semKey, {
        totalMonitoreos: prev.totalMonitoreos + val.total,
        sumaPct: prev.sumaPct + (val.sumaPonderada / val.total),
        diasConDatos: prev.diasConDatos + 1,
      })
    } else {
      porSemana.set(semKey, prev)
    }
  })

  porSemana.forEach((val, key) => {
    const [jefe, sem] = key.split("|||")
    const fila: PcaPtaSemana = {
      semana: sem,
      pct: val.diasConDatos > 0 ? Math.round(val.sumaPct / val.diasConDatos) : 0,
      totalMonitoreos: val.totalMonitoreos,
      diasConDatos: val.diasConDatos,
    }
    if (!resultado.has(jefe)) resultado.set(jefe, [])
    resultado.get(jefe)!.push(fila)
  })

  resultado.forEach(filas => filas.sort((a, b) => Number(a.semana) - Number(b.semana)))
  return resultado
}

/**
 * Trae el histórico de "Compromisos" y agrupa por (supervisor, semana).
 * Solo incluye las semanas pedidas en `semanas` (ya normalizadas con normSemana).
 */
export async function aggCompromisos(
  accessToken: string,
  coordinador: string,
  semanas: string[],
  soloSupervisor?: string,
): Promise<Map<string, CompromisosSemana[]>> {
  const SHEET_ID = "1eGoB7lIMvOfMB71g3S0IQZx5xtbNzwcOFSEqnXG4IuU"
  const HOJA = "historico"
  const rows = await getSheetData(accessToken, SHEET_ID, `${HOJA}!A:H`)
  const resultado = new Map<string, CompromisosSemana[]>()
  if (rows.length < 2) return resultado

  const headers = rows[0]
  const idx = idxFactory(headers)
  const iSemana  = idx("semana")
  const iEstado  = idx("estado compromiso")
  const iNombreA = idx("nombre asesor")
  const iLider   = idx("lider")
  const iCoord   = idx("coordinador")

  const nombreCoord = coordinador.toLowerCase().trim()
  const semSet = new Set(semanas)

  // lider|semana -> asesor -> categoria (último estado gana mejor categoría)
  const buckets = new Map<string, Map<string, ReturnType<typeof categorizarEstadoCompromiso>>>()
  rows.slice(1).forEach(r => {
    if ((r[iCoord] ?? "").toLowerCase().trim() !== nombreCoord) return
    const lider = r[iLider] ?? ""
    if (soloSupervisor && lider.toLowerCase().trim() !== soloSupervisor.toLowerCase().trim()) return
    const sem = normSemana(r[iSemana])
    if (!semSet.has(sem)) return
    const asesor = r[iNombreA] ?? ""
    if (!asesor || !lider) return
    const key = `${lider}|||${sem}`
    if (!buckets.has(key)) buckets.set(key, new Map())
    const porAg = buckets.get(key)!
    const cat = categorizarEstadoCompromiso(r[iEstado] ?? "")
    const prioridad = { cerrado_mejora: 4, abierto: 3, cerrado_sin_mejora: 2, sin_ingreso: 1 }
    if (!porAg.has(asesor) || prioridad[cat] > prioridad[porAg.get(asesor)!]) {
      porAg.set(asesor, cat)
    }
  })

  buckets.forEach((porAg, key) => {
    const [lider, sem] = key.split("|||")
    const cats = [...porAg.values()]
    const fila: CompromisosSemana = {
      semana: sem,
      total: cats.length,
      sinIngreso: cats.filter(c => c === "sin_ingreso").length,
      abiertos: cats.filter(c => c === "abierto").length,
      cerradoMejora: cats.filter(c => c === "cerrado_mejora").length,
      cerradoSin: cats.filter(c => c === "cerrado_sin_mejora").length,
    }
    if (!resultado.has(lider)) resultado.set(lider, [])
    resultado.get(lider)!.push(fila)
  })

  resultado.forEach(filas => filas.sort((a, b) => Number(a.semana) - Number(b.semana)))
  return resultado
}

/**
 * Trae el histórico del Quiz Semanal y agrupa por (supervisor, semana).
 */
export async function aggQuiz(
  accessToken: string,
  coordinador: string,
  semanas: string[],
  soloSupervisor?: string,
): Promise<Map<string, QuizSemana[]>> {
  const SHEET_ID = "1ElOVG-6SQZt_ZjnWKY7vUcWK78Zgm4dr4xZv3a5iA2k"
  const HOJA = "Data2"
  const rows = await getSheetData(accessToken, SHEET_ID, `${HOJA}!A:AY`)
  const resultado = new Map<string, QuizSemana[]>()
  if (rows.length < 2) return resultado

  const headers = rows[0]
  const idx = idxFactory(headers)
  const iSemana = idx("semana")
  const iJefe   = idx("jefe_inmediato")
  const iCoord  = idx("coordinador")
  const iPres   = idx("presentacion")
  const iPunt   = idx("puntuacion")

  const nombreCoord = coordinador.toLowerCase().trim()
  const semSet = new Set(semanas)

  const buckets = new Map<string, { total: number; presento: number; aprueba: number }>()
  rows.slice(1).forEach(r => {
    if ((r[iCoord] ?? "").toLowerCase().trim() !== nombreCoord) return
    const jefe = r[iJefe] ?? ""
    if (soloSupervisor && jefe.toLowerCase().trim() !== soloSupervisor.toLowerCase().trim()) return
    const sem = normSemana(r[iSemana])
    if (!semSet.has(sem)) return
    if (!jefe) return
    const key = `${jefe}|||${sem}`
    if (!buckets.has(key)) buckets.set(key, { total: 0, presento: 0, aprueba: 0 })
    const b = buckets.get(key)!
    b.total++
    const presento = presentoQuiz(r[iPres] ?? "")
    if (presento) b.presento++
    if (presento && aproboQuiz(r[iPunt] ?? "")) b.aprueba++
  })

  buckets.forEach((b, key) => {
    const [jefe, sem] = key.split("|||")
    const fila: QuizSemana = {
      semana: sem,
      total: b.total,
      presento: b.presento,
      noPresento: b.total - b.presento,
      aprueba: b.aprueba,
    }
    if (!resultado.has(jefe)) resultado.set(jefe, [])
    resultado.get(jefe)!.push(fila)
  })

  resultado.forEach(filas => filas.sort((a, b) => Number(a.semana) - Number(b.semana)))
  return resultado
}

/**
 * Trae el histórico de "Estoy Enterado" (hoja "Base_Dashboard", igual que
 * /api/modulos/estoy-enterado) y agrupa por (jefe inmediato, semana): cuántos
 * asesores respondieron "sí" tienen claridad sobre los temas de la semana.
 */
export async function aggEstoyEnterado(
  accessToken: string,
  supervisoresEquipo: string[],
  semanas: string[],
  soloSupervisor?: string,
): Promise<Map<string, EstoyEnteradoSemana[]>> {
  const SHEET_ID = "1sxqnABVcemnPaWivLHmW1SDChBSBQyBYGTAN3sb9q44"
  const HOJA = "Base_Dashboard"
  const rows = await getSheetData(accessToken, SHEET_ID, `${HOJA}!A:I`)
  const resultado = new Map<string, EstoyEnteradoSemana[]>()
  if (rows.length < 2) return resultado

  const headers = rows[0]
  const idx = idxFactory(headers)
  const iJefe     = idx("jefe inmediato")
  const iSemana   = idx("semana")
  const iClaridad = idx("claridad")

  const semSet = new Set(semanas)

  const buckets = new Map<string, { total: number; si: number; no: number; sinResp: number }>()
  rows.slice(1).forEach(r => {
    const sup = matchSupervisor(r[iJefe], supervisoresEquipo)
    if (!sup) return
    if (soloSupervisor && normNombre(sup) !== normNombre(soloSupervisor)) return
    const sem = normSemana(r[iSemana])
    if (!semSet.has(sem)) return
    const key = `${sup}|||${sem}`
    if (!buckets.has(key)) buckets.set(key, { total: 0, si: 0, no: 0, sinResp: 0 })
    const b = buckets.get(key)!
    b.total++
    const c = (r[iClaridad] ?? "").toLowerCase().trim()
    if (c === "si" || c === "sí") b.si++
    else if (c === "no") b.no++
    else if (c.includes("sin")) b.sinResp++
  })

  buckets.forEach((b, key) => {
    const [sup, sem] = key.split("|||")
    const fila: EstoyEnteradoSemana = {
      semana: sem,
      total: b.total,
      si: b.si,
      no: b.no,
      sinRespuesta: b.sinResp,
      pctClaro: b.total > 0 ? Math.round((b.si / b.total) * 100) : 0,
    }
    if (!resultado.has(sup)) resultado.set(sup, [])
    resultado.get(sup)!.push(fila)
  })

  resultado.forEach(filas => filas.sort((a, b) => Number(a.semana) - Number(b.semana)))
  return resultado
}

/**
 * Resumen acumulado (no es por semana — la hoja no tiene columna semana) de
 * Resolutividad/CDR por supervisor: % implementación y % backlog.
 */
export async function aggResolutividad(
  accessToken: string,
  coordinador: string,
  soloSupervisor?: string,
): Promise<Map<string, ResolutividadResumen>> {
  const SHEET_ID = "1tmFJQ4EJaUTCbogu11klf7GSzXpzevn7gw3U84Rw3zM"
  const HOJA = "Datos"
  const rows = await getSheetData(accessToken, SHEET_ID, `${HOJA}!A:Z`)
  const resultado = new Map<string, ResolutividadResumen>()
  if (rows.length < 2) return resultado

  const headers = rows[0]
  const idx = idxFactory(headers)
  const iEtapa = idx("etapa atual")
  const iLider = idx("lider socio")
  const iCoord = idx("coordinador")

  const nombreCoord = coordinador.toLowerCase().trim()

  const buckets = new Map<string, string[]>() // lider -> etapas normalizadas
  rows.slice(1).forEach(r => {
    if ((r[iCoord] ?? "").toLowerCase().trim() !== nombreCoord) return
    const lider = r[iLider] ?? ""
    if (soloSupervisor && lider.toLowerCase().trim() !== soloSupervisor.toLowerCase().trim()) return
    if (!lider) return
    if (!buckets.has(lider)) buckets.set(lider, [])
    buckets.get(lider)!.push(normalizarEtapaResolutividad(r[iEtapa] ?? ""))
  })

  buckets.forEach((etapas, lider) => {
    const t = etapas.length
    const sel = etapas.filter(e => e === "Seleccionados").length
    const apl = etapas.filter(e => e === "Aplicados").length
    resultado.set(lider, {
      total: t,
      pctImpl: t > 0 ? Math.round((sel / t) * 100) : 0,
      pctBacklog: t > 0 ? Math.round((apl / t) * 100) : 0,
    })
  })

  return resultado
}

/**
 * Resumen acumulado (no es por semana — son pendientes vigentes, igual que
 * /api/modulos/feedback) de Feedback Interfábricas por supervisor: cuántos
 * feedbacks tiene su equipo sin gestionar, gestionados y rechazados.
 */
export async function aggFeedback(
  accessToken: string,
  supervisoresValidos: string[],
  soloSupervisor?: string,
): Promise<Map<string, FeedbackResumen>> {
  const SHEET_ID = "1gd_ldwaaCCVVTV4iSh7oW9GHLyntWmmBQmfOo8Z1WtU"
  const HOJA = "Data"
  const rows = await getSheetData(accessToken, SHEET_ID, `${HOJA}!A:AA`)
  const resultado = new Map<string, FeedbackResumen>()
  if (rows.length < 2) return resultado

  const headers = rows[0]
  const idx = idxFactory(headers)
  const iEtapa = idx("etapa atual")
  const iJefe  = idx("jefe inmediato")

  const buckets = new Map<string, { total: number; nuevos: number; gestionados: number; rechazados: number }>()
  rows.slice(1).forEach(r => {
    const jefe = matchSupervisor(r[iJefe], supervisoresValidos)
    if (!jefe) return
    if (soloSupervisor && normNombre(jefe) !== normNombre(soloSupervisor)) return
    if (!buckets.has(jefe)) buckets.set(jefe, { total: 0, nuevos: 0, gestionados: 0, rechazados: 0 })
    const b = buckets.get(jefe)!
    b.total++
    const estado = condensarEstadoFeedback(r[iEtapa] ?? "")
    b[`${estado}s` as "nuevos" | "gestionados" | "rechazados"]++
  })

  buckets.forEach((b, jefe) => resultado.set(jefe, b))
  return resultado
}

// Semana ISO (jueves de la semana) a partir de una fecha "yyyy-mm-dd", igual
// que en /api/modulos/pausas-4dx, para cruzar "Pausas 4DX Raw" (sin columna semana).
function fechaAIsoSemanaPausas(fechaStr: string): string {
  const [y, m, d] = (fechaStr ?? "").split("-").map(Number)
  if (!y || !m || !d) return ""
  const date = new Date(y, m - 1, d)
  const thu = new Date(date)
  thu.setDate(date.getDate() + (4 - (date.getDay() || 7)))
  const yearStart = new Date(thu.getFullYear(), 0, 1)
  return String(Math.ceil(((thu.getTime() - yearStart.getTime()) / 86400000 + 1) / 7))
}

/**
 * Trae el histórico de "Compromisos Copilot" (hoja "Pausas 4DX Raw": pausas de
 * Diálogo y CDR) y agrupa por (jefe_inmediato, semana): % de participación en
 * cada tipo de pausa y cantidad de agentes con al menos una falta.
 */
export async function aggCompromisosCopilot(
  accessToken: string,
  nombreCoord: string,
  supervisoresEquipo: string[],
  semanas: string[],
): Promise<Map<string, CopilotSemana[]>> {
  const SHEET_ID = "17Jftow3b5V9AFhndlt1MNe6ZBKQD1xBCrQfNqM0vDl4"
  const HOJA = "Pausas 4DX Raw"
  const rows = await getSheetData(accessToken, SHEET_ID, `'${HOJA}'!A:J`)
  const resultado = new Map<string, CopilotSemana[]>()
  if (rows.length < 2) return resultado

  const headers = rows[0]
  const idx = idxFactory(headers)
  const iFecha    = idx("fecha")
  const iAgenteId = idx("agente_id")
  const iTipo     = idx("tipo")
  const iEstado   = idx("estado")
  const iJefe     = idx("jefe_inmediato")
  const iCoord    = idx("coordinador")

  // "Coordinador" filtra el equipo y "Jefe_Inmediato" es el supervisor (igual
  // que en /api/modulos/pausas-4dx, vista coordinador).
  const coordNorm = normNombre(nombreCoord)
  const semSet = new Set(semanas)

  const buckets = new Map<string, {
    dialogo: { total: number; participo: number; faltantes: Set<string> }
    cdr: { total: number; participo: number; faltantes: Set<string> }
  }>()
  rows.slice(1).forEach(r => {
    if (normNombre(r[iCoord]) !== coordNorm) return
    const jefe = matchSupervisor(r[iJefe], supervisoresEquipo)
    if (!jefe) return
    const sem = normSemana(fechaAIsoSemanaPausas(r[iFecha] ?? ""))
    if (!semSet.has(sem)) return
    const tipo = r[iTipo] ?? ""
    if (tipo !== "Diálogo" && tipo !== "CDR") return
    const estado = (r[iEstado] ?? "").toLowerCase()
    const participo = tipo === "CDR"
      ? !estado.includes("sin cdr")
      : !estado.includes("sin diálogo") && !estado.includes("sin dialogo")
    const key = `${jefe}|||${sem}`
    if (!buckets.has(key)) buckets.set(key, {
      dialogo: { total: 0, participo: 0, faltantes: new Set() },
      cdr: { total: 0, participo: 0, faltantes: new Set() },
    })
    const b = buckets.get(key)!
    const grupo = tipo === "CDR" ? b.cdr : b.dialogo
    grupo.total++
    if (participo) grupo.participo++
    else grupo.faltantes.add(r[iAgenteId] ?? "")
  })

  buckets.forEach((b, key) => {
    const [jefe, sem] = key.split("|||")
    const fila: CopilotSemana = {
      semana: sem,
      pctDialogo: b.dialogo.total > 0 ? Math.round((b.dialogo.participo / b.dialogo.total) * 100) : 0,
      pctCDR: b.cdr.total > 0 ? Math.round((b.cdr.participo / b.cdr.total) * 100) : 0,
      agentesConFaltaDialogo: b.dialogo.faltantes.size,
      agentesConFaltaCDR: b.cdr.faltantes.size,
    }
    if (!resultado.has(jefe)) resultado.set(jefe, [])
    resultado.get(jefe)!.push(fila)
  })

  resultado.forEach(filas => filas.sort((a, b) => Number(a.semana) - Number(b.semana)))
  return resultado
}

function parseSheetDateConfirmacion(dateStr: string): Date | null {
  if (!dateStr) return null
  const s = dateStr.trim()
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
    return isNaN(d.getTime()) ? null : d
  }
  const parts = s.split("/")
  if (parts.length === 3) {
    const day = Number(parts[0])
    const month = Number(parts[1])
    const year = Number(parts[2].split(" ")[0].split("T")[0])
    if (!isNaN(day) && !isNaN(month) && !isNaN(year) && year > 1900) {
      const d = new Date(year, month - 1, day)
      return isNaN(d.getTime()) ? null : d
    }
  }
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

/**
 * Cumplimiento del propio coordinador en "Confirmaciones de Rol" como coach
 * de sus supervisores: cuántas confirmaciones hizo esta semana (meta: 2) y
 * cuándo fue su último ingreso a la hoja.
 */
export async function aggConfirmacionesCoordinador(
  accessToken: string,
  nombreCoord: string,
): Promise<ConfirmacionesCoordinador> {
  const SHEET_ID = "1UN-wQKOh1z9M4K4LUJiY1prj26Lo2taVR-szVhx-Gso"
  const HOJA = "Confirmaciones de Rol"
  const META_SEMANAL = 2
  const vacio: ConfirmacionesCoordinador = {
    totalEstaSemana: 0,
    meta: META_SEMANAL,
    cumpleMeta: false,
    ultimoIngreso: null,
    diasDesdeUltimoIngreso: null,
  }

  const rows = await getSheetData(accessToken, SHEET_ID, `${HOJA}!A:BJ`)
  if (rows.length < 2) return vacio

  const headers = rows[0]
  const iFecha = headers.findIndex(h => (h ?? "").toLowerCase().includes("criação") || (h ?? "").toLowerCase().includes("criacao"))

  // El nombre del coach está en la columna "Nombre" más cercana al índice 45 (AT),
  // ya que "Nombre" también aparece más temprano en la hoja con otro significado.
  const nombrePositions: number[] = []
  headers.forEach((h, i) => { if ((h ?? "").toLowerCase().trim() === "nombre") nombrePositions.push(i) })
  const iNombreCoach = nombrePositions.length > 0
    ? nombrePositions.reduce((closest, current) => Math.abs(current - 45) < Math.abs(closest - 45) ? current : closest)
    : -1
  if (iNombreCoach < 0) return vacio

  const coordNorm = normNombre(nombreCoord)

  // Semana actual: lunes 00:00 -> domingo 23:59
  const hoy = new Date()
  const diaSemana = hoy.getDay()
  const lunes = new Date(hoy)
  lunes.setDate(hoy.getDate() - (diaSemana === 0 ? 6 : diaSemana - 1))
  lunes.setHours(0, 0, 0, 0)
  const domingo = new Date(lunes)
  domingo.setDate(lunes.getDate() + 6)
  domingo.setHours(23, 59, 59, 999)

  let totalEstaSemana = 0
  let ultima: Date | null = null
  rows.slice(1).forEach(r => {
    if (normNombre(r[iNombreCoach]) !== coordNorm) return
    const fecha = parseSheetDateConfirmacion(iFecha >= 0 ? (r[iFecha] ?? "") : "")
    if (!fecha) return
    if (fecha >= lunes && fecha <= domingo) totalEstaSemana++
    if (!ultima || fecha > ultima) ultima = fecha
  })

  const diasDesdeUltimoIngreso = ultima
    ? Math.floor((hoy.getTime() - (ultima as Date).getTime()) / (1000 * 60 * 60 * 24))
    : null

  return {
    totalEstaSemana,
    meta: META_SEMANAL,
    cumpleMeta: totalEstaSemana >= META_SEMANAL,
    ultimoIngreso: ultima ? (ultima as Date).toISOString().slice(0, 10) : null,
    diasDesdeUltimoIngreso,
  }
}
