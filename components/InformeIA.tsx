"use client"

import { useState } from "react"

interface Props {
  supervisores: { nombre: string }[]
  email?: string
}

interface ResultadoInforme {
  alcance: { tipo: "coordinador" | "supervisor"; nombre: string }
  semanas: string[]
  tipoInforme: "parcial" | "cierre"
  texto: string
}

// Convierte el subset de Markdown que devuelve la IA (##, -, **) a JSX simple.
function renderTexto(texto: string) {
  return texto.split("\n").map((linea, i) => {
    const renderInline = (s: string) =>
      s.split(/(\*\*[^*]+\*\*)/g).map((parte, j) =>
        parte.startsWith("**") && parte.endsWith("**")
          ? <strong key={j} className="font-semibold text-gray-900">{parte.slice(2, -2)}</strong>
          : <span key={j}>{parte}</span>
      )

    if (linea.startsWith("## ")) {
      return <h3 key={i} className="text-sm font-bold text-gray-900 mt-4 mb-1 first:mt-0">{linea.slice(3)}</h3>
    }
    if (linea.trim().startsWith("- ")) {
      return <li key={i} className="text-sm text-gray-700 ml-4 list-disc">{renderInline(linea.trim().slice(2))}</li>
    }
    if (!linea.trim()) {
      return <div key={i} className="h-2" />
    }
    return <p key={i} className="text-sm text-gray-700">{renderInline(linea)}</p>
  })
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
        Genera un análisis narrativo del cumplimiento de tu equipo, con focos, tendencias y un plan de acción.
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
          <div className="flex items-start justify-between mb-2">
            <p className="text-xs text-gray-500">
              {resultado.alcance.tipo === "supervisor" ? "Supervisor" : "Coordinador"}: {resultado.alcance.nombre}
              {" · "}Semana(s): {resultado.semanas.join(", ")}
              {" · "}{resultado.tipoInforme === "parcial" ? "Parcial" : "Cierre"}
            </p>
            <button onClick={copiar} className="text-xs text-blue-600 hover:text-blue-800 flex-shrink-0">
              {copiado ? "✓ Copiado" : "Copiar"}
            </button>
          </div>
          <div>{renderTexto(resultado.texto)}</div>
        </div>
      )}
    </div>
  )
}
