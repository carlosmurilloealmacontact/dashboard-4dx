"use client"

import { useState } from "react"
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, Cell,
} from "recharts"
import type { DatosInforme } from "@/lib/informes"

interface Props {
  supervisores: { nombre: string }[]
  email?: string
}

interface ResultadoInforme {
  alcance: { tipo: "coordinador" | "supervisor"; nombre: string }
  semanas: string[]
  tipoInforme: "parcial" | "cierre"
  texto: string
  datos: DatosInforme
}

// "Apellidos Apellidos Nombres Nombres" -> usa las últimas 1-2 palabras como
// etiqueta corta para los ejes de las gráficas.
function nombreCorto(nombre: string): string {
  const partes = (nombre ?? "").trim().split(/\s+/)
  if (partes.length <= 2) return partes.join(" ")
  return partes.slice(-2).join(" ")
}

// Convierte el subset de Markdown que devuelve la IA (**, -) a JSX simple.
function renderInline(s: string) {
  return s.split(/(\*\*[^*]+\*\*)/g).map((parte, j) =>
    parte.startsWith("**") && parte.endsWith("**")
      ? <strong key={j} className="font-semibold text-gray-900">{parte.slice(2, -2)}</strong>
      : <span key={j}>{parte}</span>
  )
}

function renderLineas(lineas: string[], keyPrefix: string) {
  return lineas.map((linea, i) => {
    if (linea.trim().startsWith("- ")) {
      return <li key={`${keyPrefix}-${i}`} className="text-sm text-gray-700 ml-4 list-disc">{renderInline(linea.trim().slice(2))}</li>
    }
    if (!linea.trim()) {
      return <div key={`${keyPrefix}-${i}`} className="h-2" />
    }
    return <p key={`${keyPrefix}-${i}`} className="text-sm text-gray-700">{renderInline(linea)}</p>
  })
}

// Divide el texto de la IA en secciones por encabezados "## Título".
function dividirSecciones(texto: string): Map<string, string[]> {
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

const COLORES = {
  azul: "#3b82f6",
  verde: "#16a34a",
  rojo: "#dc2626",
  ambar: "#f59e0b",
  gris: "#9ca3af",
  morado: "#8b5cf6",
}

interface SerieBarra { key: string; name: string; color: string }

function GraficaBarras({ data, series, stacked, domain, unit }: {
  data: Record<string, string | number | null>[]
  series: SerieBarra[]
  stacked?: boolean
  domain?: [number, number]
  unit?: string
}) {
  if (data.length === 0) return null
  const altura = Math.max(120, data.length * 38 + 40)
  return (
    <div className="my-2" style={{ height: altura }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" domain={domain ?? [0, "auto"]} tick={{ fontSize: 11 }} unit={unit} />
          <YAxis type="category" dataKey="supervisor" width={100} tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v: number | string | readonly (number | string)[] | undefined) => unit ? `${v}${unit}` : (v ?? "")} />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
          {series.map(s => (
            <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} stackId={stacked ? "a" : undefined} radius={stacked ? undefined : [0, 4, 4, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Constructores de datos por gráfica, a partir de DatosInforme ──────────

function ultimaSemana<T>(porSemana: { semana: string }[], semanas: string[], campo: (p: { semana: string }) => T): { semana: string; valor: T } | null {
  const sem = semanas[semanas.length - 1]
  const fila = porSemana.find(p => p.semana === sem)
  if (!fila) return null
  return { semana: sem, valor: campo(fila) }
}

function dataAdherencia4dx(datos: DatosInforme) {
  return datos.porSupervisor
    .map(s => {
      const f = ultimaSemana(s.porSemana, datos.semanas, p => (p as typeof s.porSemana[number]).adherencia4dx)?.valor
      return f ? { supervisor: nombreCorto(s.supervisor), pct: f.pct } : null
    })
    .filter((d): d is { supervisor: string; pct: number } => d !== null)
}

function dataPracticasLideres(datos: DatosInforme) {
  return datos.porSupervisor
    .map(s => {
      const f = ultimaSemana(s.porSemana, datos.semanas, p => (p as typeof s.porSemana[number]).practicasLideres)?.valor
      return f ? { supervisor: nombreCorto(s.supervisor), pct: f.pct, cdr: f.cdr ?? 0 } : null
    })
    .filter((d): d is { supervisor: string; pct: number; cdr: number } => d !== null)
}

function dataMonitoreosCalidad(datos: DatosInforme) {
  return datos.porSupervisor
    .map(s => {
      const f = ultimaSemana(s.porSemana, datos.semanas, p => (p as typeof s.porSemana[number]).pcaPta)?.valor
      return f ? { supervisor: nombreCorto(s.supervisor), pct: f.pct, dias: f.diasConDatos } : null
    })
    .filter((d): d is { supervisor: string; pct: number; dias: number } => d !== null)
}

function dataResolutividad(datos: DatosInforme) {
  return datos.porSupervisor
    .map(s => s.resolutividad ? { supervisor: nombreCorto(s.supervisor), pctImpl: s.resolutividad.pctImpl, pctBacklog: s.resolutividad.pctBacklog } : null)
    .filter((d): d is { supervisor: string; pctImpl: number; pctBacklog: number } => d !== null)
}

function dataFeedback(datos: DatosInforme) {
  return datos.porSupervisor
    .map(s => s.feedback && s.feedback.total > 0
      ? { supervisor: nombreCorto(s.supervisor), nuevos: s.feedback.nuevos, gestionados: s.feedback.gestionados, rechazados: s.feedback.rechazados }
      : null)
    .filter((d): d is { supervisor: string; nuevos: number; gestionados: number; rechazados: number } => d !== null)
}

function dataCompromisos(datos: DatosInforme) {
  return datos.porSupervisor
    .map(s => {
      const f = ultimaSemana(s.porSemana, datos.semanas, p => (p as typeof s.porSemana[number]).compromisos)?.valor
      return f ? { supervisor: nombreCorto(s.supervisor), sinIngreso: f.sinIngreso, abiertos: f.abiertos, cerradoMejora: f.cerradoMejora, cerradoSin: f.cerradoSin } : null
    })
    .filter((d): d is { supervisor: string; sinIngreso: number; abiertos: number; cerradoMejora: number; cerradoSin: number } => d !== null)
}

function dataQuiz(datos: DatosInforme) {
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

function dataEstoyEnterado(datos: DatosInforme) {
  return datos.porSupervisor
    .map(s => {
      const f = ultimaSemana(s.porSemana, datos.semanas, p => (p as typeof s.porSemana[number]).estoyEnterado)?.valor
      return f && f.total > 0 ? { supervisor: nombreCorto(s.supervisor), pctClaro: f.pctClaro } : null
    })
    .filter((d): d is { supervisor: string; pctClaro: number } => d !== null)
}

function dataPausas4dx(datos: DatosInforme) {
  return datos.porSupervisor
    .map(s => {
      const f = ultimaSemana(s.porSemana, datos.semanas, p => (p as typeof s.porSemana[number]).compromisosCopilot)?.valor
      return f ? { supervisor: nombreCorto(s.supervisor), pctDialogo: f.pctDialogo, pctCDR: f.pctCDR } : null
    })
    .filter((d): d is { supervisor: string; pctDialogo: number; pctCDR: number } => d !== null)
}

function dataAgendaLider(datos: DatosInforme) {
  return datos.porSupervisor
    .map(s => s.agendaLiderArchivo ? { supervisor: nombreCorto(s.supervisor), dias: s.agendaLiderArchivo.diasDesdeModificacion } : null)
    .filter((d): d is { supervisor: string; dias: number } => d !== null)
}

// ── Gráfica por sección ────────────────────────────────────────────────────

function graficaSeccion(titulo: string, datos: DatosInforme) {
  switch (titulo) {
    case "Adherencia 4DX":
      return <GraficaBarras data={dataAdherencia4dx(datos)} series={[{ key: "pct", name: "% cumplimiento", color: COLORES.azul }]} domain={[0, 100]} unit="%" />
    case "Prácticas Líderes":
      return <GraficaBarras data={dataPracticasLideres(datos)} series={[{ key: "pct", name: "% cumplimiento", color: COLORES.azul }, { key: "cdr", name: "CDR", color: COLORES.morado }]} domain={[0, 100]} unit="%" />
    case "Monitoreos de Calidad":
      return <GraficaBarras data={dataMonitoreosCalidad(datos)} series={[{ key: "pct", name: "% cumplimiento", color: COLORES.azul }, { key: "dias", name: "Días con datos (de 5)", color: COLORES.ambar }]} />
    case "Circuito de Resolutividad":
      return <GraficaBarras data={dataResolutividad(datos)} series={[{ key: "pctImpl", name: "% implementadas", color: COLORES.verde }, { key: "pctBacklog", name: "% backlog", color: COLORES.ambar }]} domain={[0, 100]} unit="%" />
    case "Feedback Interfábricas":
      return <GraficaBarras data={dataFeedback(datos)} series={[{ key: "nuevos", name: "Sin gestionar", color: COLORES.rojo }, { key: "gestionados", name: "Gestionados", color: COLORES.verde }, { key: "rechazados", name: "Rechazados", color: COLORES.gris }]} stacked />
    case "Compromisos":
      return <GraficaBarras data={dataCompromisos(datos)} series={[{ key: "sinIngreso", name: "Sin ingreso", color: COLORES.rojo }, { key: "abiertos", name: "Abiertos", color: COLORES.ambar }, { key: "cerradoMejora", name: "Cerrado con mejora", color: COLORES.verde }, { key: "cerradoSin", name: "Cerrado sin mejora", color: COLORES.gris }]} stacked />
    case "Quiz Semanal":
      return <GraficaBarras data={dataQuiz(datos)} series={[{ key: "pctPresento", name: "% presentó", color: COLORES.azul }, { key: "pctAprueba", name: "% aprobó", color: COLORES.verde }]} domain={[0, 100]} unit="%" />
    case "Estoy Enterado":
      return <GraficaBarras data={dataEstoyEnterado(datos)} series={[{ key: "pctClaro", name: "% con claridad", color: COLORES.azul }]} domain={[0, 100]} unit="%" />
    case "Pausas 4DX":
      return <GraficaBarras data={dataPausas4dx(datos)} series={[{ key: "pctDialogo", name: "% Diálogo", color: COLORES.azul }, { key: "pctCDR", name: "% CDR", color: COLORES.morado }]} domain={[0, 100]} unit="%" />
    case "Agenda del líder": {
      const data = dataAgendaLider(datos)
      if (data.length === 0) return null
      const altura = Math.max(120, data.length * 38 + 40)
      return (
        <div className="my-2" style={{ height: altura }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} unit=" d" />
              <YAxis type="category" dataKey="supervisor" width={100} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number | string | readonly (number | string)[] | undefined) => `${v} días`} />
              <ReferenceLine x={7} stroke={COLORES.rojo} strokeDasharray="4 4" />
              <Bar dataKey="dias" name="Días sin actualizar" radius={[0, 4, 4, 0]}>
                {data.map((d, i) => <Cell key={i} fill={d.dias > 7 ? COLORES.rojo : COLORES.verde} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )
    }
    default:
      return null
  }
}

// Confirmaciones de Rol: barra de progreso simple (es un único valor del coordinador, no por supervisor).
function GraficaConfirmacionesRol({ datos }: { datos: DatosInforme }) {
  const c = datos.confirmacionesCoordinador
  const pct = Math.min(100, Math.round((c.totalEstaSemana / c.meta) * 100))
  return (
    <div className="my-2 bg-gray-50 border border-gray-200 rounded-lg p-3">
      <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
        <span>Acompañamientos esta semana</span>
        <span className="font-semibold text-gray-900">{c.totalEstaSemana} / {c.meta}</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2.5">
        <div className="h-2.5 rounded-full" style={{ width: `${pct}%`, backgroundColor: c.cumpleMeta ? COLORES.verde : COLORES.ambar }} />
      </div>
      {c.ultimoIngreso && (
        <p className="text-xs text-gray-500 mt-1">Último registro: {c.ultimoIngreso} ({c.diasDesdeUltimoIngreso} días)</p>
      )}
    </div>
  )
}

const ORDEN_SECCIONES = [
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

function InformeRenderizado({ resultado }: { resultado: ResultadoInforme }) {
  const secciones = dividirSecciones(resultado.texto)
  return (
    <div>
      {ORDEN_SECCIONES.map(titulo => {
        const lineas = secciones.get(titulo)
        if (!lineas) return null
        const grafica = titulo === "Confirmaciones de Rol"
          ? <GraficaConfirmacionesRol datos={resultado.datos} />
          : graficaSeccion(titulo, resultado.datos)
        return (
          <div key={titulo}>
            <h3 className="text-sm font-bold text-gray-900 mt-4 mb-1 first:mt-0">{titulo}</h3>
            {grafica}
            {renderLineas(lineas, titulo)}
          </div>
        )
      })}
    </div>
  )
}

export default function InformeIA({ supervisores, email }: Props) {
  const [supervisor, setSupervisor] = useState("")
  const [tipoInforme, setTipoInforme] = useState<"parcial" | "cierre">("parcial")
  const [semanas, setSemanas] = useState("")
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState("")
  const [resultado, setResultado] = useState<ResultadoInforme | null>(null)
  const [copiado, setCopiado] = useState(false)

  async function generar() {
    const semanasLimpias = semanas.trim()
    if (!semanasLimpias) {
      setError("Indica al menos una semana (ej: 24 o 22,23,24)")
      return
    }
    setCargando(true)
    setError("")
    setResultado(null)
    setCopiado(false)
    try {
      const params = new URLSearchParams({ semanas: semanasLimpias, tipo: tipoInforme })
      if (supervisor) params.set("supervisor", supervisor)
      if (email) params.set("email", email)
      const res = await fetch(`/api/informes/generar?${params.toString()}`)
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error || "Error generando el informe")
        return
      }
      setResultado(data)
    } catch {
      setError("Error de red")
    } finally {
      setCargando(false)
    }
  }

  async function copiar() {
    if (!resultado) return
    await navigator.clipboard.writeText(resultado.texto)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  return (
    <div className="mt-8 bg-gray-50 border border-gray-200 rounded-lg p-4">
      <h2 className="text-base font-semibold text-gray-900 mb-1">📊 Informe de cumplimiento (IA)</h2>
      <p className="text-xs text-gray-600 mb-4">
        Genera un análisis con gráficas del cumplimiento de tu equipo, con focos, tendencias y un plan de acción.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
        <div>
          <label className="block text-xs text-gray-600 mb-1">Alcance</label>
          <select
            className="w-full text-sm border border-gray-300 rounded-md px-2 py-1.5 bg-white text-gray-900"
            value={supervisor}
            onChange={e => setSupervisor(e.target.value)}
          >
            <option value="">Todo mi equipo</option>
            {supervisores.map(s => (
              <option key={s.nombre} value={s.nombre}>{s.nombre}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-gray-600 mb-1">Semana(s)</label>
          <input
            type="text"
            placeholder="ej: 24 o 22,23,24"
            className="w-full text-sm border border-gray-300 rounded-md px-2 py-1.5 bg-white text-gray-900"
            value={semanas}
            onChange={e => setSemanas(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-xs text-gray-600 mb-1">Tipo de informe</label>
          <select
            className="w-full text-sm border border-gray-300 rounded-md px-2 py-1.5 bg-white text-gray-900"
            value={tipoInforme}
            onChange={e => setTipoInforme(e.target.value as "parcial" | "cierre")}
          >
            <option value="parcial">Parcial (semana en curso)</option>
            <option value="cierre">Cierre (semana finalizada)</option>
          </select>
        </div>
      </div>

      <button
        onClick={generar}
        disabled={cargando}
        className="text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium px-4 py-2 rounded-md transition"
      >
        {cargando ? "Generando..." : "Generar informe"}
      </button>

      {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

      {resultado && (
        <div className="mt-4 bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-start justify-between mb-2 informe-toolbar">
            <p className="text-xs text-gray-500">
              {resultado.alcance.tipo === "supervisor" ? "Supervisor" : "Coordinador"}: {resultado.alcance.nombre}
              {" · "}Semana(s): {resultado.semanas.join(", ")}
              {" · "}{resultado.tipoInforme === "parcial" ? "Parcial" : "Cierre"}
            </p>
            <div className="flex items-center gap-3 flex-shrink-0">
              <button onClick={copiar} className="text-xs text-blue-600 hover:text-blue-800">
                {copiado ? "✓ Copiado" : "Copiar"}
              </button>
              <button onClick={() => window.print()} className="text-xs text-blue-600 hover:text-blue-800">
                Descargar PDF
              </button>
            </div>
          </div>
          <div id="informe-imprimible">
            <InformeRenderizado resultado={resultado} />
          </div>
        </div>
      )}

      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #informe-imprimible, #informe-imprimible * {
            visibility: visible;
          }
          #informe-imprimible {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
          }
        }
      `}</style>
    </div>
  )
}
