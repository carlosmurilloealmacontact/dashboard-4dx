"use client"

import { useEffect, useState } from "react"
import { useModuloUrl } from "@/hooks/useModuloUrl"
import { useModuloMetric } from "@/context/ModuloMetricContext"
import { useSemanaGlobal } from "@/context/SemanaGlobalContext"

interface Agente {
  asesor: string
  estado: string
  categoria: "sin_ingreso" | "abierto" | "cerrado_mejora" | "cerrado_sin_mejora"
}

interface SupervisorComp {
  supervisor: string
  total: number
  sinIngreso: number
  abiertos: number
  cerradoMejora: number
  agentes: Agente[]
}

interface Data {
  total: number
  semanaActual: string
  semanas: string[]
  resumen: { sinIngreso: number; abiertos: number; cerradoMejora: number; cerradoSin: number }
  agentes: Agente[]
  porSupervisor?: SupervisorComp[]
}

const CAT_CONFIG = {
  sin_ingreso:      { label: "Sin ingreso",       color: "text-red-400",    dot: "bg-red-500",    badge: "bg-red-900/40 text-red-300" },
  abierto:          { label: "Abierto",            color: "text-yellow-400", dot: "bg-yellow-500", badge: "bg-yellow-900/40 text-yellow-300" },
  cerrado_sin_mejora: { label: "Cerrado sin mejora", color: "text-gray-400", dot: "bg-gray-500",   badge: "bg-gray-700 text-gray-300" },
  cerrado_mejora:   { label: "Cerrado con mejora", color: "text-green-400",  dot: "bg-green-500",  badge: "bg-green-900/40 text-green-300" },
}

export default function Compromisos() {
  const [data, setData] = useState<Data | null>(null)
  const [cargando, setCargando] = useState(true)
  const [filtro, setFiltro] = useState<string>("todos")
  const [supervisorExpandido, setSupervisorExpandido] = useState<string | null>(null)
  const { semanaGlobal, reportWeeks } = useSemanaGlobal()
  const base = useModuloUrl("/api/modulos/compromisos")
  const url = semanaGlobal ? `${base}${base.includes("?") ? "&" : "?"}semana=${semanaGlobal}` : base
  const { setMetric } = useModuloMetric()

  useEffect(() => {
    fetch(url).then(r => r.json()).then(d => {
      setData(d)
      if (Array.isArray(d.semanas)) reportWeeks("compromisos", d.semanas)
      if (d.resumen) {
        const ingresados = d.total - d.resumen.sinIngreso
        setMetric({
          valor: `${ingresados} de ${d.total} ingresados`,
          alerta: d.resumen.sinIngreso,
          color: d.resumen.sinIngreso > 0 ? "yellow" : "green",
        })
      } else {
        setMetric({ valor: "—", color: "white" })
      }
    }).finally(() => setCargando(false))
  }, [url, setMetric, reportWeeks])

  if (cargando) return <p className="text-xs text-gray-500 py-2">Cargando...</p>
  if (!data?.resumen) return <p className="text-xs text-gray-500 py-2">Sin datos.</p>

  const { resumen, agentes } = data
  const semanaActiva = semanaGlobal ?? data.semanaActual
  const agentesFiltrados = filtro === "todos" ? agentes : agentes.filter(a => a.categoria === filtro)

  return (
    <div className="space-y-4">
      {semanaActiva && (
        <p className="text-xs text-gray-500">Semana {semanaActiva}</p>
      )}

      {/* Resumen por estado — clickeables para filtrar */}
      <div className="grid grid-cols-2 gap-2">
        {([
          ["sin_ingreso",    resumen.sinIngreso],
          ["abierto",        resumen.abiertos],
          ["cerrado_mejora", resumen.cerradoMejora],
          ["cerrado_sin_mejora", resumen.cerradoSin],
        ] as [string, number][]).map(([cat, count]) => {
          const cfg = CAT_CONFIG[cat as keyof typeof CAT_CONFIG]
          const activo = filtro === cat
          return (
            <button
              key={cat}
              onClick={() => setFiltro(activo ? "todos" : cat)}
              className={`rounded-lg p-2 text-left border transition ${activo ? "border-white" : "border-gray-700"} bg-gray-800`}
            >
              <div className="flex items-center gap-1.5 mb-0.5">
                <div className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                <span className="text-xs text-gray-400 truncate">{cfg.label}</span>
              </div>
              <p className={`text-xl font-bold ${cfg.color}`}>{count}</p>
            </button>
          )
        })}
      </div>

      {/* Alerta sin ingreso */}
      {resumen.sinIngreso > 0 && (
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-3">
          <p className="text-xs text-red-400 font-medium">
            ⚠ {resumen.sinIngreso} persona{resumen.sinIngreso !== 1 ? "s" : ""} sin ingresar compromiso esta semana
          </p>
        </div>
      )}

      {/* Vista coordinador: por supervisor */}
      {data.porSupervisor && data.porSupervisor.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">Por supervisor</p>
          {data.porSupervisor.map((sv, i) => {
            const expandido = supervisorExpandido === sv.supervisor
            return (
              <div key={i} className="bg-gray-800 rounded-lg overflow-hidden">
                <button
                  className="w-full p-3 text-left"
                  onClick={() => setSupervisorExpandido(expandido ? null : sv.supervisor)}
                >
                  <div className="flex justify-between items-center mb-1">
                    <p className="text-xs text-gray-300 truncate">{sv.supervisor.split(" ").slice(0, 3).join(" ")}</p>
                    <span className="text-gray-600 text-xs">{expandido ? "▲" : "▼"}</span>
                  </div>
                  <div className="flex gap-3 text-xs">
                    {sv.sinIngreso > 0 && <span className="text-red-400">⚠ {sv.sinIngreso} sin ingreso</span>}
                    <span className="text-yellow-400">{sv.abiertos} abiertos</span>
                    <span className="text-green-400">{sv.cerradoMejora} con mejora</span>
                  </div>
                </button>
                {expandido && (
                  <div className="px-3 pb-3 border-t border-gray-700 pt-2 space-y-1 max-h-56 overflow-y-auto">
                    {sv.agentes.map((a, j) => {
                      const cfg = CAT_CONFIG[a.categoria]
                      const esAlerta = a.categoria === "sin_ingreso"
                      return (
                        <div key={j} className="flex items-center justify-between py-1.5 px-2 rounded bg-gray-900">
                          <div className="flex items-center gap-2 min-w-0">
                            {esAlerta && <span className="text-red-400 text-xs flex-shrink-0">⚠</span>}
                            <span className={`text-xs truncate ${esAlerta ? "text-red-400 font-medium" : "text-gray-300"}`}>
                              {a.asesor.split(" ").slice(0, 3).join(" ")}
                            </span>
                          </div>
                          <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ml-2 ${cfg.badge}`}>
                            {cfg.label}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Lista de agentes */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <p className="text-xs text-gray-500">
            {filtro === "todos" ? `${data.total} agentes` : `${agentesFiltrados.length} ${CAT_CONFIG[filtro as keyof typeof CAT_CONFIG]?.label ?? ""}`}
          </p>
          {filtro !== "todos" && (
            <button className="text-xs text-gray-600 hover:text-white" onClick={() => setFiltro("todos")}>
              Ver todos
            </button>
          )}
        </div>
        <div className="space-y-1 max-h-56 overflow-y-auto">
          {agentesFiltrados.map((a, i) => {
            const cfg = CAT_CONFIG[a.categoria]
            const esAlerta = a.categoria === "sin_ingreso"
            return (
              <div key={i} className="flex items-center justify-between py-1.5 px-2 rounded bg-gray-800">
                <div className="flex items-center gap-2 min-w-0">
                  {esAlerta && <span className="text-red-400 text-xs flex-shrink-0">⚠</span>}
                  <span className={`text-xs truncate ${esAlerta ? "text-red-400 font-medium" : "text-gray-300"}`}>
                    {a.asesor.split(" ").slice(0, 3).join(" ")}
                  </span>
                </div>
                <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ml-2 ${cfg.badge}`}>
                  {cfg.label}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}



