import { getSheetData } from "@/lib/sheets"

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

export interface FeedbackSemana {
  semana: string
  nuevos: number
  gestionados: number
  rechazados: number
}

export interface ResolutividadResumen {
  total: number
  pctImpl: number
  pctBacklog: number
}

export interface TendenciaMetrica {
  actual: number
  anterior: number
  delta: number
  direccion: "mejora" | "empeora" | "igual"
}

export interface Tendencia {
  compromisos: { pctSinIngreso: TendenciaMetrica; pctCerradoMejora: TendenciaMetrica } | null
  quiz: { pctPresento: TendenciaMetrica; pctAprueba: TendenciaMetrica } | null
  feedback: { nuevos: TendenciaMetrica } | null
}

const round1 = (n: number) => Math.round(n * 10) / 10

function tendenciaMetrica(actual: number, anterior: number, mayorEsMejor: boolean): TendenciaMetrica {
  const delta = round1(actual - anterior)
  const direccion: TendenciaMetrica["direccion"] = delta === 0 ? "igual" : (delta > 0) === mayorEsMejor ? "mejora" : "empeora"
  return { actual: round1(actual), anterior: round1(anterior), delta, direccion }
}

/**
 * Compara los datos de una semana contra la semana inmediatamente anterior
 * y devuelve los deltas por práctica. Devuelve `null` por práctica si falta
 * el dato actual o el anterior (sin registros esa semana).
 */
export function calcularTendencia(
  actual: { compromisos: CompromisosSemana | null; quiz: QuizSemana | null; feedback: FeedbackSemana | null },
  anterior: { compromisos: CompromisosSemana | null; quiz: QuizSemana | null; feedback: FeedbackSemana | null } | undefined,
): Tendencia {
  const a = anterior ?? { compromisos: null, quiz: null, feedback: null }

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

  const feedback = (actual.feedback && a.feedback)
    ? { nuevos: tendenciaMetrica(actual.feedback.nuevos, a.feedback.nuevos, false) }
    : null

  return { compromisos, quiz, feedback }
}

export interface DatosInforme {
  alcance: { tipo: "coordinador" | "supervisor"; nombre: string }
  semanas: string[]
  porSupervisor: {
    supervisor: string
    porSemana: {
      semana: string
      compromisos: CompromisosSemana | null
      quiz: QuizSemana | null
      feedback: FeedbackSemana | null
      tendencia: Tendencia
    }[]
    resolutividad: ResolutividadResumen | null
  }[]
}

/**
 * Agrega los datos de las 4 prácticas (Compromisos, Quiz, Feedback, Resolutividad)
 * por supervisor y semana, incluyendo tendencia vs. la semana anterior.
 * Usado tanto por /api/informes (datos crudos) como por /api/informes/generar (narrativa IA).
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

  const [compromisos, quiz, feedback, resolutividad] = await Promise.all([
    aggCompromisos(accessToken, nombreCoord, semanasFetch, soloSupervisor),
    aggQuiz(accessToken, nombreCoord, semanasFetch, soloSupervisor),
    aggFeedback(accessToken, supervisoresEquipo, semanasFetch, soloSupervisor),
    aggResolutividad(accessToken, nombreCoord, soloSupervisor),
  ])

  const supervisores = soloSupervisor
    ? [soloSupervisor]
    : [...new Set([...compromisos.keys(), ...quiz.keys(), ...feedback.keys(), ...resolutividad.keys()])]

  const buscar = <T extends { semana: string }>(mapa: Map<string, T[]>, sup: string, sem: string): T | null =>
    (mapa.get(sup) ?? []).find(f => f.semana === sem) ?? null

  const porSupervisor = supervisores.map(sup => ({
    supervisor: sup,
    porSemana: semanas.map(sem => {
      const datosSemana = {
        compromisos: buscar(compromisos, sup, sem),
        quiz:        buscar(quiz, sup, sem),
        feedback:    buscar(feedback, sup, sem),
      }
      const datosAnterior = {
        compromisos: buscar(compromisos, sup, String(Number(sem) - 1)),
        quiz:        buscar(quiz, sup, String(Number(sem) - 1)),
        feedback:    buscar(feedback, sup, String(Number(sem) - 1)),
      }
      return {
        semana: sem,
        ...datosSemana,
        tendencia: calcularTendencia(datosSemana, datosAnterior),
      }
    }),
    resolutividad: resolutividad.get(sup) ?? null,
  }))

  return {
    alcance: soloSupervisor
      ? { tipo: "supervisor", nombre: soloSupervisor }
      : { tipo: "coordinador", nombre: nombreCoord },
    semanas,
    porSupervisor,
  }
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
 * Trae el histórico de Feedback Interfábricas y agrupa por (supervisor, semana).
 * `supervisoresValidos`: nombres (lowercase, trim) del equipo del coordinador —
 * la hoja de feedback no tiene columna "coordinador", se filtra por jefe_inmediato.
 */
export async function aggFeedback(
  accessToken: string,
  supervisoresValidos: string[],
  semanas: string[],
  soloSupervisor?: string,
): Promise<Map<string, FeedbackSemana[]>> {
  const SHEET_ID = "1gd_ldwaaCCVVTV4iSh7oW9GHLyntWmmBQmfOo8Z1WtU"
  const HOJA = "Data"
  const rows = await getSheetData(accessToken, SHEET_ID, `${HOJA}!A:AA`)
  const resultado = new Map<string, FeedbackSemana[]>()
  if (rows.length < 2) return resultado

  const headers = rows[0]
  const idx = idxFactory(headers)
  const iEtapa = idx("etapa atual")
  const iJefe  = idx("jefe inmediato")
  const iSemana = idx("semana")

  const semSet = new Set(semanas)
  const validos = new Set(supervisoresValidos.map(s => s.toLowerCase().trim()))

  const buckets = new Map<string, { nuevos: number; gestionados: number; rechazados: number }>()
  rows.slice(1).forEach(r => {
    const jefe = r[iJefe] ?? ""
    const jefeNorm = jefe.toLowerCase().trim()
    if (!validos.has(jefeNorm)) return
    if (soloSupervisor && jefeNorm !== soloSupervisor.toLowerCase().trim()) return
    const sem = normSemana(r[iSemana])
    if (!semSet.has(sem)) return
    const key = `${jefe}|||${sem}`
    if (!buckets.has(key)) buckets.set(key, { nuevos: 0, gestionados: 0, rechazados: 0 })
    const b = buckets.get(key)!
    const estado = condensarEstadoFeedback(r[iEtapa] ?? "")
    b[`${estado}s` as "nuevos" | "gestionados" | "rechazados"]++
  })

  buckets.forEach((b, key) => {
    const [jefe, sem] = key.split("|||")
    const fila: FeedbackSemana = { semana: sem, ...b }
    if (!resultado.has(jefe)) resultado.set(jefe, [])
    resultado.get(jefe)!.push(fila)
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
