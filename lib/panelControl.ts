import type { Persona } from "@/lib/jerarquia"
import { filtrarPorRol, supervisoresDeCoordinador } from "@/lib/equipoAdmin"
import { semanaISOActual } from "@/lib/semana"
import {
  normSemana,
  aggAdherencia4dx,
  aggPracticasLideres,
  aggPcaPta,
  aggCompromisos,
  aggQuiz,
  aggResolutividad,
  aggCompromisosCopilot,
  aggFeedback,
  type Adherencia4dxSemana,
  type PracticasLiderSemana,
  type PcaPtaSemana,
  type CompromisosSemana,
  type QuizSemana,
  type ResolutividadResumen,
  type CopilotSemana,
  type FeedbackResumen,
} from "@/lib/informes"

export const MODULOS_PANEL = [
  "adherencia", "practicas_lideres", "adherencia_pca", "compromisos", "quiz", "resolutividad", "pausas_4dx", "feedback",
] as const
export type ModuloPanel = typeof MODULOS_PANEL[number]

// Meta semanal de volumen de monitoreos (PCA/PTA + Pauta combinados), igual
// que META_SEMANAL_GLOBAL en app/api/modulos/adherencia-pca/route.ts.
const META_SEMANAL_MONITOREOS = 25
// Meta fija (%) de las prácticas de "cumplimiento diario acumulado" — se
// espera 100% al cierre de la semana (ver lib/informes-prompt.ts).
const META_CUMPLIMIENTO_DIARIO = 100
// Backlog de Resolutividad: "Aplicados" no debería superar el 10% de las ideas
// (igual que META_BACKLOG_MAX en app/api/modulos/resolutividad/route.ts) —
// aquí menor es mejor, al contrario que el resto de metas.
const META_BACKLOG_MAX = 10
// Pausas 4DX (Diálogo y CDR): la meta es lograr 80% de participación del
// equipo en cada práctica — NO 100% (a diferencia de las demás prácticas de
// cumplimiento diario) ni "sin meta fija" (a diferencia del CDR de Prácticas
// Líderes, que sí varía por servicio).
const META_PAUSAS_PARTICIPACION = 80

interface Item { pct: number; peso: number; meta?: number }

export interface Secundario {
  label: string
  texto: string
  tono: "ok" | "warn" | "bad" | "neutral"
}

export interface PracticaRollup {
  pct: number | null
  pctAnterior: number | null
  peso: number
  /** Meta objetivo en la misma unidad que `pct` (null si no aplica un número simple). */
  meta: number | null
  /** true = menor que la meta es mejor (ej. Backlog de Resolutividad). */
  metaInvertida?: boolean
  /** Meta que no se expresa como "%" comparable a pct (ej. "25 monitoreos/semana"). */
  metaTexto?: string
  /** Métrica complementaria de la misma práctica (ej. Backlog, CDR, Pendientes). */
  secundario?: Secundario
}

export interface CoordinadorRollup {
  coordinador: string
  servicio: string
  supervisores: number
  practicas: Record<ModuloPanel, PracticaRollup>
}

export interface PanelControlData {
  semanaActual: string
  semanaAnterior: string
  /** Semana ISO real de "hoy" — el panel nunca debe navegar más allá de esta. */
  semanaActualReal: string
  global: Record<ModuloPanel, PracticaRollup>
  porCoordinador: CoordinadorRollup[]
}

function rollupPct(items: Item[]): { pct: number | null; peso: number; meta: number | null } {
  const peso = items.reduce((s, i) => s + i.peso, 0)
  if (peso <= 0) return { pct: null, peso: 0, meta: null }
  const pct = Math.round(items.reduce((s, i) => s + i.pct * i.peso, 0) / peso)
  const conMeta = items.filter((i): i is Item & { meta: number } => i.meta != null)
  const pesoMeta = conMeta.reduce((s, i) => s + i.peso, 0)
  const meta = pesoMeta > 0 ? Math.round(conMeta.reduce((s, i) => s + i.meta * i.peso, 0) / pesoMeta) : null
  return { pct, peso, meta }
}

function itemsDeMapaSemanal<T extends { semana: string }>(
  mapa: Map<string, T[]>,
  supervisores: string[],
  sem: string,
  extraer: (fila: T) => Item | null,
): Item[] {
  return supervisores
    .map(sup => (mapa.get(sup) ?? []).find(f => f.semana === sem))
    .filter((f): f is T => f != null)
    .map(extraer)
    .filter((i): i is Item => i != null && i.peso > 0)
}

function itemAdherencia(f: Adherencia4dxSemana): Item | null {
  return f.totalRegistros > 0 ? { pct: f.pct, peso: f.totalRegistros, meta: META_CUMPLIMIENTO_DIARIO } : null
}
function itemPracticasLideres(f: PracticasLiderSemana): Item | null {
  return f.totalDias > 0 ? { pct: f.pct, peso: f.totalDias, meta: META_CUMPLIMIENTO_DIARIO } : null
}
// El % de Monitoreos de Calidad es cumplimiento de la META DE VOLUMEN semanal
// (monitoreos hechos / 25 esperados), no la nota de calidad de la hoja — igual
// definición que app/api/modulos/adherencia-pca/route.ts (pctMeta). Se
// recalcula aquí porque PcaPtaSemana.pct (lib/informes.ts, usado por el
// Informe IA) todavía trae la nota de calidad antigua.
function itemPcaPta(f: PcaPtaSemana): Item | null {
  if (f.diasConDatos <= 0 && f.totalMonitoreos <= 0) return null
  const pct = Math.min(100, Math.round((f.totalMonitoreos / META_SEMANAL_MONITOREOS) * 100))
  return { pct, peso: 1 }
}
function itemCompromisos(f: CompromisosSemana): Item | null {
  return f.total > 0 ? { pct: Math.round(((f.total - f.sinIngreso) / f.total) * 100), peso: f.total, meta: META_CUMPLIMIENTO_DIARIO } : null
}
function itemQuiz(f: QuizSemana): Item | null {
  return f.total > 0 ? { pct: Math.round((f.presento / f.total) * 100), peso: f.total, meta: META_CUMPLIMIENTO_DIARIO } : null
}
// % Implementación (Seleccionados / total) — meta dinámica por jefatura, ya
// calculada por aggResolutividad (fallback 23% si la jefatura no está en la
// hoja "Metas"). NO es lo mismo que Backlog (Aplicados) — ver itemBacklog.
function itemImplementacion(f: ResolutividadResumen): Item | null {
  return f.total > 0 ? { pct: f.pctImpl, peso: f.total, meta: f.metaImpl } : null
}
// % Backlog (Aplicados / total) — aquí menor es mejor, meta fija ≤10%.
function itemBacklog(f: ResolutividadResumen): Item | null {
  return f.total > 0 ? { pct: f.pctBacklog, peso: f.total, meta: META_BACKLOG_MAX } : null
}
// Diálogo: práctica diaria L-V, misma meta 100% que el resto de "cumplimiento
// diario acumulado". Se pondera igual entre supervisores (peso 1) porque
// CopilotSemana no expone el total de registros diarios usado en el % ya
// calculado.
function itemPausasDialogo(f: CopilotSemana): Item | null {
  return { pct: f.pctDialogo, peso: 1, meta: META_PAUSAS_PARTICIPACION }
}
// CDR de Pausas 4DX (distinto del CDR de Prácticas Líderes, ese sí sin meta
// fija): meta 80% de participación, igual que Diálogo.
function itemPausasCDR(f: CopilotSemana): Item | null {
  return { pct: f.pctCDR, peso: 1, meta: META_PAUSAS_PARTICIPACION }
}
function itemFeedbackGestionado(f: FeedbackResumen): Item | null {
  return f.total > 0 ? { pct: Math.round((f.gestionados / f.total) * 100), peso: f.total } : null
}

function tono(pct: number | null, meta: number | null | undefined, metaInvertida?: boolean): Secundario["tono"] {
  if (pct == null) return "neutral"
  if (metaInvertida && meta != null) {
    if (pct <= meta) return "ok"
    if (pct <= meta * 1.5) return "warn"
    return "bad"
  }
  if (meta != null && meta !== 100) {
    const ratio = meta > 0 ? pct / meta : (pct > 0 ? 1 : 0)
    if (ratio >= 1) return "ok"
    if (ratio >= 0.7) return "warn"
    return "bad"
  }
  // Meta 100% (o sin meta, ej. Monitoreos ya normalizado 0-100): mismos
  // umbrales de color que el resto del dashboard (colorPct: verde ≥80, amarillo ≥50).
  if (pct >= 80) return "ok"
  if (pct >= 50) return "warn"
  return "bad"
}

/**
 * Agrega, para la semana pedida (y la anterior, para tendencia), el % de
 * cumplimiento de cada práctica por coordinador REAL (jefes inmediatos de los
 * 41 líderes, ver lib/equipoAdmin.ts) y el rollup global ponderado por el
 * tamaño de cada equipo — no un promedio de promedios.
 *
 * Reutiliza los mismos agg* de lib/informes.ts que ya usa el Informe IA por
 * coordinador; gracias a la caché compartida de lib/sheets.ts (30s, por
 * hoja+rango, ignora el token) recorrer varios coordinadores no dispara una
 * lectura de Sheets por cada uno — solo la primera pasada por hoja.
 */
export async function construirPanelControl(
  accessToken: string,
  equipoCompleto: Persona[],
  semanaParam?: string | null,
): Promise<PanelControlData> {
  const coordinadoresReales = filtrarPorRol(equipoCompleto, "coordinador")

  const semanaActualReal = String(semanaISOActual())
  const semanaSolicitada = semanaParam ? normSemana(semanaParam) : semanaActualReal
  // No dejar navegar a semanas futuras (todavía sin datos) — clamp defensivo,
  // además de que la UI deshabilita el botón "siguiente" en la semana real.
  const semanaActual = Number(semanaSolicitada) > Number(semanaActualReal) ? semanaActualReal : semanaSolicitada
  const semanaAnterior = String(Number(semanaActual) - 1)

  const mapaVacio = (): Record<ModuloPanel, Item[]> => ({
    adherencia: [], practicas_lideres: [], adherencia_pca: [], compromisos: [], quiz: [], resolutividad: [], pausas_4dx: [], feedback: [],
  })
  const globalActual = mapaVacio()
  const globalAnterior = mapaVacio()
  const globalBacklog: Item[] = []
  const globalCDR: Item[] = []
  let globalPendientes = 0

  const porCoordinador = await Promise.all(coordinadoresReales.map(async (coord): Promise<CoordinadorRollup> => {
    const supervisores = supervisoresDeCoordinador(equipoCompleto, coord.nombre).map(s => s.nombre)
    const semanas = [semanaAnterior, semanaActual]

    const [adherencia4dx, practicasLideres, pcaPta, compromisos, quiz, resolutividad, pausas, feedback] = await Promise.all([
      aggAdherencia4dx(accessToken, coord.nombre, supervisores, semanas),
      aggPracticasLideres(accessToken, coord.nombre, supervisores, semanas),
      aggPcaPta(accessToken, coord.nombre, supervisores, semanas),
      aggCompromisos(accessToken, coord.nombre, semanas),
      aggQuiz(accessToken, coord.nombre, semanas),
      aggResolutividad(accessToken, coord.nombre),
      aggCompromisosCopilot(accessToken, coord.nombre, supervisores, semanas),
      aggFeedback(accessToken, supervisores),
    ])

    const rAdherencia = {
      act: itemsDeMapaSemanal(adherencia4dx, supervisores, semanaActual, itemAdherencia),
      ant: itemsDeMapaSemanal(adherencia4dx, supervisores, semanaAnterior, itemAdherencia),
    }
    globalActual.adherencia.push(...rAdherencia.act)
    globalAnterior.adherencia.push(...rAdherencia.ant)

    const rPracticasLideres = {
      act: itemsDeMapaSemanal(practicasLideres, supervisores, semanaActual, itemPracticasLideres),
      ant: itemsDeMapaSemanal(practicasLideres, supervisores, semanaAnterior, itemPracticasLideres),
    }
    globalActual.practicas_lideres.push(...rPracticasLideres.act)
    globalAnterior.practicas_lideres.push(...rPracticasLideres.ant)

    const rPcaPta = {
      act: itemsDeMapaSemanal(pcaPta, supervisores, semanaActual, itemPcaPta),
      ant: itemsDeMapaSemanal(pcaPta, supervisores, semanaAnterior, itemPcaPta),
    }
    globalActual.adherencia_pca.push(...rPcaPta.act)
    globalAnterior.adherencia_pca.push(...rPcaPta.ant)

    const rCompromisos = {
      act: itemsDeMapaSemanal(compromisos, supervisores, semanaActual, itemCompromisos),
      ant: itemsDeMapaSemanal(compromisos, supervisores, semanaAnterior, itemCompromisos),
    }
    globalActual.compromisos.push(...rCompromisos.act)
    globalAnterior.compromisos.push(...rCompromisos.ant)

    const rQuiz = {
      act: itemsDeMapaSemanal(quiz, supervisores, semanaActual, itemQuiz),
      ant: itemsDeMapaSemanal(quiz, supervisores, semanaAnterior, itemQuiz),
    }
    globalActual.quiz.push(...rQuiz.act)
    globalAnterior.quiz.push(...rQuiz.ant)

    const rDialogo = {
      act: itemsDeMapaSemanal(pausas, supervisores, semanaActual, itemPausasDialogo),
      ant: itemsDeMapaSemanal(pausas, supervisores, semanaAnterior, itemPausasDialogo),
    }
    globalActual.pausas_4dx.push(...rDialogo.act)
    globalAnterior.pausas_4dx.push(...rDialogo.ant)

    const rCDR = itemsDeMapaSemanal(pausas, supervisores, semanaActual, itemPausasCDR)
    globalCDR.push(...rCDR)

    const itemsImplementacion = supervisores
      .map(sup => resolutividad.get(sup))
      .filter((f): f is ResolutividadResumen => f != null)
      .map(itemImplementacion)
      .filter((i): i is Item => i != null)
    globalActual.resolutividad.push(...itemsImplementacion)

    const itemsBacklog = supervisores
      .map(sup => resolutividad.get(sup))
      .filter((f): f is ResolutividadResumen => f != null)
      .map(itemBacklog)
      .filter((i): i is Item => i != null)
    globalBacklog.push(...itemsBacklog)

    const itemsFeedback = supervisores
      .map(sup => feedback.get(sup))
      .filter((f): f is FeedbackResumen => f != null)
      .map(itemFeedbackGestionado)
      .filter((i): i is Item => i != null)
    globalActual.feedback.push(...itemsFeedback)
    const pendientesEquipo = supervisores.reduce((s, sup) => s + (feedback.get(sup)?.nuevos ?? 0), 0)
    globalPendientes += pendientesEquipo

    const rollBacklog = rollupPct(itemsBacklog)
    const rollCDR = rollupPct(rCDR)

    const practicas: Record<ModuloPanel, PracticaRollup> = {
      adherencia: { ...rollupPct(rAdherencia.act), pctAnterior: rollupPct(rAdherencia.ant).pct },
      practicas_lideres: { ...rollupPct(rPracticasLideres.act), pctAnterior: rollupPct(rPracticasLideres.ant).pct },
      adherencia_pca: { ...rollupPct(rPcaPta.act), pctAnterior: rollupPct(rPcaPta.ant).pct, meta: null, metaTexto: `${META_SEMANAL_MONITOREOS} monitoreos/semana` },
      compromisos: { ...rollupPct(rCompromisos.act), pctAnterior: rollupPct(rCompromisos.ant).pct },
      quiz: { ...rollupPct(rQuiz.act), pctAnterior: rollupPct(rQuiz.ant).pct },
      // Resolutividad e Implementación: corte acumulado (sin columna semana en
      // la hoja) — no tiene tendencia semana a semana, igual que en el resto
      // del dashboard. El Backlog (Aplicados) se muestra como secundario para
      // dejar explícito que NO es lo mismo que el % de Implementación.
      resolutividad: {
        ...rollupPct(itemsImplementacion),
        pctAnterior: null,
        secundario: {
          label: "Backlog (Aplicados)",
          texto: rollBacklog.pct != null ? `${rollBacklog.pct}% · meta ≤${META_BACKLOG_MAX}%` : "sin datos",
          tono: tono(rollBacklog.pct, META_BACKLOG_MAX, true),
        },
      },
      pausas_4dx: {
        ...rollupPct(rDialogo.act),
        pctAnterior: rollupPct(rDialogo.ant).pct,
        secundario: {
          label: "CDR",
          texto: rollCDR.pct != null ? `${rollCDR.pct}% · meta ${META_PAUSAS_PARTICIPACION}%` : "sin datos",
          tono: tono(rollCDR.pct, rollCDR.meta),
        },
      },
      feedback: {
        ...rollupPct(itemsFeedback),
        pctAnterior: null,
        meta: null,
        secundario: {
          label: "Pendientes",
          texto: `${pendientesEquipo} sin gestionar`,
          tono: pendientesEquipo > 0 ? "warn" : "ok",
        },
      },
    }

    return {
      coordinador: coord.nombre,
      servicio: coord.servicio,
      supervisores: supervisores.length,
      practicas,
    }
  }))

  const rollBacklogGlobal = rollupPct(globalBacklog)
  const rollCDRGlobal = rollupPct(globalCDR)

  const global: Record<ModuloPanel, PracticaRollup> = {
    adherencia: { ...rollupPct(globalActual.adherencia), pctAnterior: rollupPct(globalAnterior.adherencia).pct },
    practicas_lideres: { ...rollupPct(globalActual.practicas_lideres), pctAnterior: rollupPct(globalAnterior.practicas_lideres).pct },
    adherencia_pca: { ...rollupPct(globalActual.adherencia_pca), pctAnterior: rollupPct(globalAnterior.adherencia_pca).pct, meta: null, metaTexto: `${META_SEMANAL_MONITOREOS} monitoreos/semana` },
    compromisos: { ...rollupPct(globalActual.compromisos), pctAnterior: rollupPct(globalAnterior.compromisos).pct },
    quiz: { ...rollupPct(globalActual.quiz), pctAnterior: rollupPct(globalAnterior.quiz).pct },
    resolutividad: {
      ...rollupPct(globalActual.resolutividad),
      pctAnterior: null,
      secundario: {
        label: "Backlog (Aplicados)",
        texto: rollBacklogGlobal.pct != null ? `${rollBacklogGlobal.pct}% · meta ≤${META_BACKLOG_MAX}%` : "sin datos",
        tono: tono(rollBacklogGlobal.pct, META_BACKLOG_MAX, true),
      },
    },
    pausas_4dx: {
      ...rollupPct(globalActual.pausas_4dx),
      pctAnterior: rollupPct(globalAnterior.pausas_4dx).pct,
      secundario: {
        label: "CDR",
        texto: rollCDRGlobal.pct != null ? `${rollCDRGlobal.pct}% · meta ${META_PAUSAS_PARTICIPACION}%` : "sin datos",
        tono: tono(rollCDRGlobal.pct, rollCDRGlobal.meta),
      },
    },
    feedback: {
      ...rollupPct(globalActual.feedback),
      pctAnterior: null,
      meta: null,
      secundario: {
        label: "Pendientes",
        texto: `${globalPendientes} sin gestionar`,
        tono: globalPendientes > 0 ? "warn" : "ok",
      },
    },
  }

  return {
    semanaActual,
    semanaAnterior,
    semanaActualReal,
    global,
    porCoordinador: porCoordinador.sort((a, b) => (a.practicas.adherencia.pct ?? -1) - (b.practicas.adherencia.pct ?? -1)),
  }
}
