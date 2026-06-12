"use client"

import { useState } from "react"
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, Cell, LabelList,
} from "recharts"
import type { DatosInforme } from "@/lib/informes"
import {
  ORDEN_SECCIONES, SECCIONES_GRAFICA, COLORES, dividirSecciones, dataAgendaLider,
  type ResultadoInforme, type SerieBarra,
} from "@/lib/informe-render"

interface Props {
  supervisores: { nombre: string }[]
  email?: string
  permitirEnvioCorreo?: boolean
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
            <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} stackId={stacked ? "a" : undefined} radius={stacked ? undefined : [0, 4, 4, 0]}>
              <LabelList
                dataKey={s.key}
                position={stacked ? "inside" : "right"}
                fontSize={10}
                fill={stacked ? "#fff" : "#374151"}
                formatter={(v: string | number | boolean | null | undefined) => unit ? `${v}${unit}` : `${v ?? ""}`}
              />
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Gráfica por sección ────────────────────────────────────────────────────

function graficaSeccion(titulo: string, datos: DatosInforme) {
  switch (titulo) {
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
                <LabelList dataKey="dias" position="right" fontSize={10} fill="#374151" formatter={(v: string | number | boolean | null | undefined) => `${v ?? ""} d`} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )
    }
    default: {
      const cfg = SECCIONES_GRAFICA[titulo]
      if (!cfg) return null
      return <GraficaBarras data={cfg.dataFn(datos)} series={cfg.series} stacked={cfg.stacked} domain={cfg.domain} unit={cfg.unit} />
    }
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

export default function InformeIA({ supervisores, email, permitirEnvioCorreo }: Props) {
  const [supervisor, setSupervisor] = useState("")
  const [tipoInforme, setTipoInforme] = useState<"parcial" | "cierre">("parcial")
  const [semanas, setSemanas] = useState("")
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState("")
  const [resultado, setResultado] = useState<ResultadoInforme | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [correoDestino, setCorreoDestino] = useState("")
  const [enviandoCorreo, setEnviandoCorreo] = useState(false)
  const [estadoEnvio, setEstadoEnvio] = useState("")

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

  async function enviarCorreo() {
    if (!resultado) return
    const destino = correoDestino.trim()
    if (!destino) {
      setEstadoEnvio("Indica un correo destino")
      return
    }
    setEnviandoCorreo(true)
    setEstadoEnvio("")
    try {
      const res = await fetch("/api/informes/enviar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destino, resultado }),
      })
      const data = await res.json()
      if (!res.ok) {
        setEstadoEnvio(data?.error || "Error enviando el correo")
        return
      }
      setEstadoEnvio("✓ Correo enviado")
    } catch {
      setEstadoEnvio("Error de red")
    } finally {
      setEnviandoCorreo(false)
    }
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

      {resultado && permitirEnvioCorreo && (
        <div className="mt-3 bg-white border border-gray-200 rounded-lg p-3">
          <p className="text-xs text-gray-600 mb-2">Enviar este informe por correo (con gráficas incluidas en el cuerpo)</p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="email"
              placeholder="correo@ejemplo.com"
              className="text-sm border border-gray-300 rounded-md px-2 py-1.5 bg-white text-gray-900 flex-1 min-w-[200px]"
              value={correoDestino}
              onChange={e => setCorreoDestino(e.target.value)}
            />
            <button
              onClick={enviarCorreo}
              disabled={enviandoCorreo}
              className="text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium px-4 py-1.5 rounded-md transition"
            >
              {enviandoCorreo ? "Enviando..." : "Enviar por correo"}
            </button>
          </div>
          {estadoEnvio && <p className="text-xs text-gray-600 mt-2">{estadoEnvio}</p>}
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
