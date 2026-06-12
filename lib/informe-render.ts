// Lógica compartida para renderizar el Informe IA, usada tanto en el
// dashboard (components/InformeIA.tsx) como en el correo
// (lib/informe-email.ts). No depende de React ni de Recharts.

import type { DatosInforme } from "@/lib/informes"

export interface SerieBarra { key: string; name: string; color: string }

export interface ResultadoInforme {
  alcance: { tipo: "coordinador" | "supervisor"; nombre: string }
  semanas: string[]
  tipoInforme: "parcial" | "cierre"
  texto: string
  datos: DatosInforme
}

export const COLORES = {
  azul: "#3b82f6",
  verde: "#16a34a",
  rojo: "#dc2626",
  ambar: "#f59e0b",
  gris: "#9ca3af",
  morado: "#8b5cf6",
}

// "Apellidos Apellidos Nombres Nombres" -> usa las últimas 1-2 palabras como
// etiqueta corta para los ejes de las gráficas.
export function nombreCorto(nombre: string): string {
  const partes = (nombre ?? "").trim().split(/\s+/)
  if (partes.length <= 2) return partes.join(" ")
  return partes.slice(-2).join(" ")
}

// Divide el texto de la IA en secciones por encabezados "## Título".
export function dividirSecciones(texto: string): Map<string, string[]> {
  const secciones = new Map<string, string[]>()
  let actual: string[] | null = null
  texto.split("\n").forEach(linea => {
    if (linea.startsWith("## ")) {
      actual = []
      secciones.set(linea.slice(3).trim(), actual)
    } else if (actual) {
      actual.push(linea)
    }
  })
  return secciones
}

function ultimaSemana<T>(porSemana: { semana: string }[], semanas: string[], campo: (p: { semana: string }) => T): { semana: string; valor: T } | null {
  const sem = semanas[semanas.length - 1]
  const fila = porSemana.find(p => p.semana === sem)
  if (!fila) return null
  return { semana: sem, valor: campo(fila) }
}

export type FilaGrafica = Record<string, string | number | null>

export function dataAdherencia4dx(datos: DatosInforme): FilaGrafica[] {
  return datos.porSupervisor
    .map(s => {
      const f = ultimaSemana(s.porSemana, datos.semanas, p => (p as typeof s.porSemana[number]).adherencia4dx)?.valor
      return f ? { supervisor: nombreCorto(s.supervisor), pct: f.pct } : null
    })
    .filter((d): d is { supervisor: string; pct: number } => d !== null)
}

export function dataPracticasLideres(datos: DatosInforme): FilaGrafica[] {
  return datos.porSupervisor
    .map(s => {
      const f = ultimaSemana(s.porSemana, datos.semanas, p => (p as typeof s.porSemana[number]).practicasLideres)?.valor
      return f ? { supervisor: nombreCorto(s.supervisor), pct: f.pct, cdr: f.cdr ?? 0 } : null
    })
    .filter((d): d is { supervisor: string; pct: number; cdr: number } => d !== null)
}

export function dataMonitoreosCalidad(datos: DatosInforme): FilaGrafica[] {
  return datos.porSupervisor
    .map(s => {
      const f = ultimaSemana(s.porSemana, datos.semanas, p => (p as typeof s.porSemana[number]).pcaPta)?.valor
      return f ? { supervisor: nombreCorto(s.supervisor), pct: f.pct, dias: f.diasConDatos } : null
    })
    .filter((d): d is { supervisor: string; pct: number; dias: number } => d !== null)
}

export function dataResolutividad(datos: DatosInforme): FilaGrafica[] {
  return datos.porSupervisor
    .map(s => s.resolutividad ? { supervisor: nombreCorto(s.supervisor), pctImpl: s.resolutividad.pctImpl, pctBacklog: s.resolutividad.pctBacklog } : null)
    .filter((d): d is { supervisor: string; pctImpl: number; pctBacklog: number } => d !== null)
}

export function dataFeedback(datos: DatosInforme): FilaGrafica[] {
  return datos.porSupervisor
    .map(s => s.feedback && s.feedback.total > 0
      ? { supervisor: nombreCorto(s.supervisor), nuevos: s.feedback.nuevos, gestionados: s.feedback.gestionados, rechazados: s.feedback.rechazados }
      : null)
    .filter((d): d is { supervisor: string; nuevos: number; gestionados: number; rechazados: number } => d !== null)
}

export function dataCompromisos(datos: DatosInforme): FilaGrafica[] {
  return datos.porSupervisor
    .map(s => {
      const f = ultimaSemana(s.porSemana, datos.semanas, p => (p as typeof s.porSemana[number]).compromisos)?.valor
      return f ? { supervisor: nombreCorto(s.supervisor), sinIngreso: f.sinIngreso, abiertos: f.abiertos, cerradoMejora: f.cerradoMejora, cerradoSin: f.cerradoSin } : null
    })
    .filter((d): d is { supervisor: string; sinIngreso: number; abiertos: number; cerradoMejora: number; cerradoSin: number } => d !== null)
}

export function dataQuiz(datos: DatosInforme): FilaGrafica[] {
  return datos.porSupervisor
    .map(s => {
      const f = ultimaSemana(s.porSemana, datos.semanas, p => (p as typeof s.porSemana[number]).quiz)?.valor
      if (!f || f.total === 0) return null
      return {
        supervisor: nombreCorto(s.supervisor),
        pctPresento: Math.round((f.presento / f.total) * 100),
        pctAprueba: f.presento > 0 ? Math.round((f.aprueba / f.presento) * 100) : 0,
      }
    })
    .filter((d): d is { supervisor: string; pctPresento: number; pctAprueba: number } => d !== null)
}

export function dataEstoyEnterado(datos: DatosInforme): FilaGrafica[] {
  return datos.porSupervisor
    .map(s => {
      const f = ultimaSemana(s.porSemana, datos.semanas, p => (p as typeof s.porSemana[number]).estoyEnterado)?.valor
      return f && f.total > 0 ? { supervisor: nombreCorto(s.supervisor), pctClaro: f.pctClaro } : null
    })
    .filter((d): d is { supervisor: string; pctClaro: number } => d !== null)
}

export function dataPausas4dx(datos: DatosInforme): FilaGrafica[] {
  return datos.porSupervisor
    .map(s => {
      const f = ultimaSemana(s.porSemana, datos.semanas, p => (p as typeof s.porSemana[number]).compromisosCopilot)?.valor
      return f ? { supervisor: nombreCorto(s.supervisor), pctDialogo: f.pctDialogo, pctCDR: f.pctCDR } : null
    })
    .filter((d): d is { supervisor: string; pctDialogo: number; pctCDR: number } => d !== null)
}

export function dataAgendaLider(datos: DatosInforme): { supervisor: string; dias: number }[] {
  return datos.porSupervisor
    .map(s => s.agendaLiderArchivo ? { supervisor: nombreCorto(s.supervisor), dias: s.agendaLiderArchivo.diasDesdeModificacion } : null)
    .filter((d): d is { supervisor: string; dias: number } => d !== null)
}

export interface SeccionGrafica {
  dataFn: (datos: DatosInforme) => FilaGrafica[]
  series: SerieBarra[]
  stacked?: boolean
  domain?: [number, number]
  unit?: string
}

// Configuración de gráfica de barras por sección del informe.
// "Agenda del líder" y "Confirmaciones de Rol" tienen renderizado especial
// (ver components/InformeIA.tsx y lib/informe-email.ts).
export const SECCIONES_GRAFICA: Record<string, SeccionGrafica> = {
  "Adherencia 4DX": {
    dataFn: dataAdherencia4dx,
    series: [{ key: "pct", name: "% cumplimiento", color: COLORES.azul }],
    domain: [0, 100], unit: "%",
  },
  "Prácticas Líderes": {
    dataFn: dataPracticasLideres,
    series: [{ key: "pct", name: "% cumplimiento", color: COLORES.azul }, { key: "cdr", name: "CDR", color: COLORES.morado }],
    domain: [0, 100], unit: "%",
  },
  "Monitoreos de Calidad": {
    dataFn: dataMonitoreosCalidad,
    series: [{ key: "pct", name: "% cumplimiento", color: COLORES.azul }, { key: "dias", name: "Días con datos (de 5)", color: COLORES.ambar }],
  },
  "Circuito de Resolutividad": {
    dataFn: dataResolutividad,
    series: [{ key: "pctImpl", name: "% implementadas", color: COLORES.verde }, { key: "pctBacklog", name: "% backlog", color: COLORES.ambar }],
    domain: [0, 100], unit: "%",
  },
  "Feedback Interfábricas": {
    dataFn: dataFeedback,
    series: [{ key: "nuevos", name: "Sin gestionar", color: COLORES.rojo }, { key: "gestionados", name: "Gestionados", color: COLORES.verde }, { key: "rechazados", name: "Rechazados", color: COLORES.gris }],
    stacked: true,
  },
  "Compromisos": {
    dataFn: dataCompromisos,
    series: [{ key: "sinIngreso", name: "Sin ingreso", color: COLORES.rojo }, { key: "abiertos", name: "Abiertos", color: COLORES.ambar }, { key: "cerradoMejora", name: "Cerrado con mejora", color: COLORES.verde }, { key: "cerradoSin", name: "Cerrado sin mejora", color: COLORES.gris }],
    stacked: true,
  },
  "Quiz Semanal": {
    dataFn: dataQuiz,
    series: [{ key: "pctPresento", name: "% presentó", color: COLORES.azul }, { key: "pctAprueba", name: "% aprobó", color: COLORES.verde }],
    domain: [0, 100], unit: "%",
  },
  "Estoy Enterado": {
    dataFn: dataEstoyEnterado,
    series: [{ key: "pctClaro", name: "% con claridad", color: COLORES.azul }],
    domain: [0, 100], unit: "%",
  },
  "Pausas 4DX": {
    dataFn: dataPausas4dx,
    series: [{ key: "pctDialogo", name: "% Diálogo", color: COLORES.azul }, { key: "pctCDR", name: "% CDR", color: COLORES.morado }],
    domain: [0, 100], unit: "%",
  },
}

export const ORDEN_SECCIONES = [
  "Resumen ejecutivo",
  "Adherencia 4DX",
  "Prácticas Líderes",
  "Monitoreos de Calidad",
  "Circuito de Resolutividad",
  "Feedback Interfábricas",
  "Compromisos",
  "Confirmaciones de Rol",
  "Quiz Semanal",
  "Estoy Enterado",
  "Pausas 4DX",
  "Agenda del líder",
  "Plan de acción",
]
