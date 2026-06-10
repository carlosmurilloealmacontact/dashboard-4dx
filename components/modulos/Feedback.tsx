"use client"

import { useEffect, useState } from "react"
import { usePerfilContext } from "@/context/PerfilContext"
import { useModuloUrl } from "@/hooks/useModuloUrl"
import { useModuloMetric } from "@/context/ModuloMetricContext"

interface FeedbackItem {
  etapaRaw: string
  estado: "nuevo" | "gestionado" | "rechazado"
  quien: string
  asesor: string
  motivo: string
  causa: string
  feedback: string
  semana: string
}

interface SupervisorFeed {
  supervisor: string
  total: number
  nuevos: number
  gestionados: number
  rechazados: number
  items: FeedbackItem[]
}

interface Data {
  total: number
  esCoord: boolean
  resumen: { nuevos: number; gestionados: number; rechazados: number }
  causaTop: [string, number][]
  feedbacks: FeedbackItem[]
  porSupervisor?: SupervisorFeed[]
}

const ESTADO_CONFIG = {
  nuevo:      { label: "Nuevo",      color: "bg-orange-600", text: "text-orange-400", bg: "bg-orange-900/20 border-orange-800" },
  gestionado: { label: "Gestionado", color: "bg-blue-600",   text: "text-blue-400",   bg: "bg-blue-900/20 border-blue-800" },
  rechazado:  { label: "Rechazado",  color: "bg-red-600",    text: "text-red-400",    bg: "bg-red-900/20 border-red-800" },
}

export default function Feedback() {
  const [data, setData] = useState<Data | null>(null)
  const [cargando, setCargando] = useState(true)
  const [expandido, setExpandido] = useState<number | null>(null)
  const [filtro, setFiltro] = useState<"todos" | "nuevo" | "gestionado" | "rechazado">("nuevo")
  const [supervisorExpandido, setSupervisorExpandido] = useState<string | null>(null)
  const [itemExpandido, setItemExpandido] = useState<number | null>(null)
  const url = useModuloUrl("/api/modulos/feedback")
  const { setMetric } = useModuloMetric()

  useEffect(() => {
    fetch(url).then(r => r.json()).then(d => {
      setData(d)
      if (d.resumen) {
        setMetric({
          valor: `${d.resumen.nuevos} nuevos`,
          alerta: d.resumen.nuevos,
          color: d.resumen.nuevos > 0 ? "red" : "green",
        })
      } else {
        setMetric({ valor: "—", color: "white" })
      }
    }).finally(() => setCargando(false))
  }, [url, setMetric])

  if (cargando) return <p className="text-xs text-gray-500 py-2">Cargando...</p>
  if (!data || data.total === 0 || !data.resumen) return <p className="text-xs text-gray-500 py-2">Sin feedbacks registrados.</p>

  const { resumen, causaTop, feedbacks = [], porSupervisor } = data
  const feedbacksFiltrados = filtro === "todos" ? feedbacks : feedbacks.filter(f => f.estado === filtro)

  return (
    <div className="space-y-4">
      {/* Resumen 3 estados */}
      <div className="grid grid-cols-3 gap-2">
        {(["nuevo", "gestionado", "rechazado"] as const).map(estado => {
          const cfg = ESTADO_CONFIG[estado]
          const count = resumen[`${estado}s` as keyof typeof resumen] as number
          return (
            <button
              key={estado}
              onClick={() => setFiltro(filtro === estado ? "todos" : estado)}
              className={`rounded-lg p-2 border text-center transition ${filtro === estado ? cfg.bg + " border-2" : "bg-gray-800 border-gray-700"}`}
            >
              <p className={`text-xl font-bold ${cfg.text}`}>{count}</p>
              <p className="text-xs text-gray-400">{cfg.label}{count !== 1 ? "s" : ""}</p>
            </button>
          )
        })}
      </div>

      {/* Alerta si hay nuevos sin gestionar */}
      {resumen.nuevos > 0 && (
        <div className="bg-orange-900/20 border border-orange-800 rounded-lg p-3">
          <p className="text-xs text-orange-400 font-medium">
            ⚠ {resumen.nuevos} feedback{resumen.nuevos !== 1 ? "s" : ""} sin gestionar
          </p>
          {causaTop.length > 0 && (
            <div className="mt-2 space-y-1">
              {causaTop.map(([causa, count]) => (
                <div key={causa} className="flex justify-between text-xs">
                  <span className="text-gray-400 truncate max-w-[170px]">{causa}</span>
                  <span className="text-orange-300 ml-2">{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Vista coordinador: por supervisor */}
      {data.esCoord && porSupervisor && porSupervisor.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">Por supervisor</p>
          {(porSupervisor ?? []).map((sv, i) => {
            const expandidoSup = supervisorExpandido === sv.supervisor
            return (
              <div key={i} className="bg-gray-800 rounded-lg overflow-hidden">
                <button
                  className="w-full p-3 text-left"
                  onClick={() => {
                    setSupervisorExpandido(expandidoSup ? null : sv.supervisor)
                    setItemExpandido(null)
                  }}
                >
                  <div className="flex justify-between items-center mb-1">
                    <p className="text-xs text-gray-300 truncate">{sv.supervisor.split(" ").slice(0, 3).join(" ")}</p>
                    <span className="text-gray-600 text-xs">{expandidoSup ? "▲" : "▼"}</span>
                  </div>
                  <div className="flex gap-3 text-xs">
                    <span className={sv.nuevos > 0 ? "text-orange-400" : "text-gray-500"}>
                      {sv.nuevos} nuevos
                    </span>
                    <span className="text-blue-400">{sv.gestionados} gestionados</span>
                    <span className="text-gray-500">{sv.rechazados} rechazados</span>
                  </div>
                </button>
                {expandidoSup && (
                  <div className="px-3 pb-3 border-t border-gray-700 pt-2 space-y-2 max-h-64 overflow-y-auto">
                    {sv.items.length === 0 && (
                      <p className="text-xs text-gray-500 text-center py-2">Sin feedbacks.</p>
                    )}
                    {sv.items.map((f, j) => {
                      const cfg = ESTADO_CONFIG[f.estado]
                      const expandidoItem = itemExpandido === j
                      return (
                        <div key={j} className="bg-gray-900 rounded-lg overflow-hidden">
                          <button
                            className="w-full px-3 py-2 text-left flex items-start gap-2 justify-between"
                            onClick={() => setItemExpandido(expandidoItem ? null : j)}
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-gray-300 truncate">
                                {f.asesor.split(" ").slice(0, 2).join(" ")}
                              </p>
                              <div className="flex gap-1 mt-0.5 flex-wrap">
                                <span className={`text-xs px-1.5 py-0.5 rounded text-white ${cfg.color}`}>
                                  {cfg.label}
                                </span>
                                {f.causa && (
                                  <span className="text-xs text-gray-500 truncate max-w-[120px]">{f.causa}</span>
                                )}
                              </div>
                            </div>
                            <span className="text-gray-600 text-xs mt-1">{expandidoItem ? "▲" : "▼"}</span>
                          </button>
                          {expandidoItem && (
                            <div className="px-3 pb-3 border-t border-gray-800">
                              <p className="text-xs text-gray-500 mt-2 mb-1">Sem. {f.semana} · {f.quien.split(" ").slice(0, 2).join(" ")}</p>
                              {f.feedback && <p className="text-xs text-gray-300">{f.feedback}</p>}
                            </div>
                          )}
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

      {/* Lista de feedbacks */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <p className="text-xs text-gray-500">
            {filtro === "todos" ? "Todos" : ESTADO_CONFIG[filtro].label + "s"}
            {" "}({feedbacksFiltrados.length})
          </p>
          {filtro !== "todos" && (
            <button className="text-xs text-gray-600 hover:text-white" onClick={() => setFiltro("todos")}>
              Ver todos
            </button>
          )}
        </div>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {feedbacksFiltrados.map((f, i) => {
            const cfg = ESTADO_CONFIG[f.estado]
            return (
              <div key={i} className="bg-gray-800 rounded-lg overflow-hidden">
                <button
                  className="w-full px-3 py-2 text-left flex items-start gap-2 justify-between"
                  onClick={() => setExpandido(expandido === i ? null : i)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-300 truncate">
                      {f.asesor.split(" ").slice(0, 2).join(" ")}
                    </p>
                    <div className="flex gap-1 mt-0.5 flex-wrap">
                      <span className={`text-xs px-1.5 py-0.5 rounded text-white ${cfg.color}`}>
                        {cfg.label}
                      </span>
                      {f.causa && (
                        <span className="text-xs text-gray-500 truncate max-w-[120px]">{f.causa}</span>
                      )}
                    </div>
                  </div>
                  <span className="text-gray-600 text-xs mt-1">{expandido === i ? "▲" : "▼"}</span>
                </button>
                {expandido === i && (
                  <div className="px-3 pb-3 border-t border-gray-700">
                    <p className="text-xs text-gray-500 mt-2 mb-1">Sem. {f.semana} · {f.quien.split(" ").slice(0, 2).join(" ")}</p>
                    {f.feedback && <p className="text-xs text-gray-300">{f.feedback}</p>}
                  </div>
                )}
              </div>
            )
          })}
          {feedbacksFiltrados.length === 0 && (
            <p className="text-xs text-gray-500 text-center py-2">Sin feedbacks en este estado.</p>
          )}
        </div>
      </div>
    </div>
  )
}



