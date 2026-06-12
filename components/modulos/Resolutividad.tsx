"use client"

import { useEffect, useState } from "react"
import { usePerfilContext } from "@/context/PerfilContext"
import { useModuloUrl } from "@/hooks/useModuloUrl"
import { useModuloMetric } from "@/context/ModuloMetricContext"

interface Meta {
  valor: number
  meta: number
  cumple: boolean
  cantidad: number
  multiJefatura?: boolean
}

interface JefaturaRow {
  jefatura: string
  meta: number
  total: number
  seleccionados: number
  pctImpl: number
  cumple: boolean
}

interface Idea {
  etapa: string
  asesor: string
  problema: string
  propuesta: string
}

interface SupervisorRow {
  supervisor: string
  total: number
  pctImpl: number
  pctBacklog: number
  ideas: Idea[]
}

interface Data {
  total: number
  porEtapa: Record<string, number>
  metas: { implementacion: Meta; backlog: Meta }
  porJefatura?: JefaturaRow[]
  ultimas5: Idea[]
  porSupervisor?: SupervisorRow[]
}

const COLORES_ETAPA: Record<string, string> = {
  "Aplicados":       "bg-green-600",
  "Seleccionados":   "bg-blue-600",
  "Declinados":      "bg-red-600",
  "Lider Coach":     "bg-purple-600",
  "Lider Guardião":  "bg-indigo-600",
  "Mejora Continua": "bg-yellow-600",
  "Coordinación":    "bg-orange-600",
  "Gerencia":        "bg-gray-600",
}

function colorEtapa(e: string) { return COLORES_ETAPA[e] ?? "bg-gray-600" }

export default function Resolutividad() {
  const [data, setData] = useState<Data | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState("")
  const [expandida, setExpandida] = useState<number | null>(null)
  const [supervisorExpandido, setSupervisorExpandido] = useState<string | null>(null)
  const [ideaExpandida, setIdeaExpandida] = useState<number | null>(null)
  const url = useModuloUrl("/api/modulos/resolutividad")
  const { setMetric } = useModuloMetric()

  useEffect(() => {
    let activo = true
    setCargando(true)
    fetch(url).then(r => r.json()).then(d => {
      if (!activo) return
      // Respuesta inválida/transitoria (error de Sheets, quota): NO pisar datos buenos
      if (d?.error || typeof d?.total !== "number" || !d?.metas) {
        setError(d?.error || "No se pudieron cargar los datos")
        return
      }
      setError("")
      setData(d)
      const cumpleImpl = d.metas.implementacion?.cumple
      const cumpleBack = d.metas.backlog?.cumple
      const ok = cumpleImpl && cumpleBack
      setMetric({
        valor: `${d.metas.implementacion?.valor ?? 0}%`,
        alerta: ok ? 0 : 1,
        color: ok ? "green" : "yellow",
      })
    }).catch(() => { if (activo) setError("Error de red") })
      .finally(() => { if (activo) setCargando(false) })
    return () => { activo = false }
  }, [url, setMetric])

  if (cargando && !data) return <p className="text-xs text-gray-500 py-2">Cargando...</p>
  // Solo mostramos error si todavía no hay datos buenos en pantalla
  if (!data && error) return <p className="text-xs text-yellow-500 py-2">No se pudo cargar (reintenta). {error}</p>
  if (!data || data.total === 0 || !data.metas) return <p className="text-xs text-gray-500 py-2">Sin ideas registradas.</p>

  const { metas, porEtapa = {}, ultimas5 = [], porSupervisor, porJefatura = [] } = data

  return (
    <div className="space-y-4">
      {/* Metas principales */}
      <div className="grid grid-cols-2 gap-3">
        {/* Meta implementación */}
        <div className={`rounded-lg p-3 border ${metas.implementacion.cumple ? "bg-green-900/20 border-green-800" : "bg-yellow-900/20 border-yellow-800"}`}>
          <p className="text-xs text-gray-400 mb-1">Implementación</p>
          <p className={`text-2xl font-bold ${metas.implementacion.cumple ? "text-green-400" : "text-yellow-400"}`}>
            {metas.implementacion.valor}%
          </p>
          <p className="text-xs text-gray-500">{metas.implementacion.cantidad} ideas</p>
          <div className="mt-1 flex-1 bg-gray-700 rounded-full h-1">
            <div
              className={`h-1 rounded-full ${metas.implementacion.cumple ? "bg-green-500" : "bg-yellow-500"}`}
              style={{ width: `${Math.min(metas.implementacion.valor / metas.implementacion.meta * 100, 100)}%` }}
            />
          </div>
          <p className="text-xs text-gray-600 mt-0.5">
            meta: ≥{metas.implementacion.meta}%{metas.implementacion.multiJefatura ? " (prom.)" : ""}
          </p>
        </div>

        {/* Meta backlog */}
        <div className={`rounded-lg p-3 border ${metas.backlog.cumple ? "bg-green-900/20 border-green-800" : "bg-red-900/20 border-red-800"}`}>
          <p className="text-xs text-gray-400 mb-1">Backlog</p>
          <p className={`text-2xl font-bold ${metas.backlog.cumple ? "text-green-400" : "text-red-400"}`}>
            {metas.backlog.valor}%
          </p>
          <p className="text-xs text-gray-500">{metas.backlog.cantidad} ideas</p>
          <div className="mt-1 flex-1 bg-gray-700 rounded-full h-1">
            <div
              className={`h-1 rounded-full ${metas.backlog.cumple ? "bg-green-500" : "bg-red-500"}`}
              style={{ width: `${Math.min(metas.backlog.valor / metas.backlog.meta * 100, 100)}%` }}
            />
          </div>
          <p className="text-xs text-gray-600 mt-0.5">meta: ≤{metas.backlog.meta}%</p>
        </div>
      </div>

      {/* Total y distribución por etapa */}
      <div className="bg-gray-800 rounded-lg p-3">
        <p className="text-xs text-gray-400 mb-2">Total: <span className="text-white font-bold">{data.total}</span> ideas</p>
        <div className="space-y-1.5">
          {Object.entries(porEtapa).sort((a, b) => b[1] - a[1]).map(([etapa, count]) => {
            const pct = Math.round((count / data.total) * 100)
            return (
              <div key={etapa} className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${colorEtapa(etapa)}`} />
                <span className="text-xs text-gray-400 flex-1 truncate">{etapa}</span>
                <span className="text-xs text-white">{count}</span>
                <span className="text-xs text-gray-600 w-8 text-right">{pct}%</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Desglose por jefatura (cada jefatura con su meta dinámica) — solo si hay varias */}
      {porJefatura.length > 1 && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">Implementación por jefatura</p>
          {porJefatura.map((jf, i) => (
            <div key={i} className="bg-gray-800 rounded-lg p-3">
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs text-gray-300 break-words mr-2">{jf.jefatura}</span>
                <span className={`text-xs font-bold ${jf.cumple ? "text-green-400" : "text-yellow-400"}`}>
                  {jf.pctImpl}% / ≥{jf.meta}%
                </span>
              </div>
              <div className="flex-1 bg-gray-700 rounded-full h-1.5 mb-1">
                <div
                  className={`h-1.5 rounded-full ${jf.cumple ? "bg-green-500" : "bg-yellow-500"}`}
                  style={{ width: `${Math.min(jf.pctImpl / jf.meta * 100, 100)}%` }}
                />
              </div>
              <div className="flex gap-3 text-xs text-gray-600">
                <span>{jf.seleccionados}/{jf.total} seleccionadas</span>
                <span className={jf.cumple ? "text-green-400" : "text-yellow-400"}>
                  {jf.cumple ? "✓ cumple" : "✗ bajo meta"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Vista coordinador: por supervisor */}
      {porSupervisor && porSupervisor.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">Por supervisor</p>
          {porSupervisor.map((sv, i) => {
            const expandidoSup = supervisorExpandido === sv.supervisor
            return (
              <div key={i} className="bg-gray-800 rounded-lg overflow-hidden">
                <button
                  className="w-full p-3 text-left"
                  onClick={() => {
                    setSupervisorExpandido(expandidoSup ? null : sv.supervisor)
                    setIdeaExpandida(null)
                  }}
                >
                  <div className="flex justify-between items-center mb-1">
                    <p className="text-xs text-gray-300 break-words mr-2">{sv.supervisor}</p>
                    <span className="text-gray-600 text-xs">{expandidoSup ? "▲" : "▼"}</span>
                  </div>
                  <div className="flex gap-3 text-xs">
                    <span className={sv.pctImpl >= 23 ? "text-green-400" : "text-yellow-400"}>
                      Impl: {sv.pctImpl}%
                    </span>
                    <span className={sv.pctBacklog <= 10 ? "text-green-400" : "text-red-400"}>
                      Backlog: {sv.pctBacklog}%
                    </span>
                    <span className="text-gray-600">{sv.total} ideas</span>
                  </div>
                </button>
                {expandidoSup && (
                  <div className="px-3 pb-3 border-t border-gray-700 pt-2 space-y-2 max-h-64 overflow-y-auto">
                    {sv.ideas.map((idea, j) => {
                      const expandidaIdea = ideaExpandida === j
                      return (
                        <div key={j} className="bg-gray-900 rounded-lg overflow-hidden">
                          <button
                            className="w-full px-3 py-2 text-left flex items-start gap-2 justify-between"
                            onClick={() => setIdeaExpandida(expandidaIdea ? null : j)}
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-gray-300 break-words">{idea.asesor}</p>
                              <span className={`text-xs px-1.5 py-0.5 rounded mt-0.5 inline-block text-white ${colorEtapa(idea.etapa)}`}>
                                {idea.etapa}
                              </span>
                            </div>
                            <span className="text-gray-600 text-xs mt-1">{expandidaIdea ? "▲" : "▼"}</span>
                          </button>
                          {expandidaIdea && (
                            <div className="px-3 pb-3 space-y-2 border-t border-gray-800">
                              {idea.problema && (
                                <div>
                                  <p className="text-xs text-gray-500 mt-2 mb-1">Problema</p>
                                  <p className="text-xs text-gray-300 line-clamp-3">{idea.problema}</p>
                                </div>
                              )}
                              {idea.propuesta && (
                                <div>
                                  <p className="text-xs text-blue-400 mb-1">Propuesta</p>
                                  <p className="text-xs text-gray-300 line-clamp-3">{idea.propuesta}</p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                    {sv.ideas.length === 0 && (
                      <p className="text-xs text-gray-500 text-center py-2">Sin ideas.</p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Últimas ideas */}
      <div>
        <p className="text-xs text-gray-500 mb-2">Últimas ideas</p>
        <div className="space-y-2">
          {ultimas5.map((idea, i) => (
            <div key={i} className="bg-gray-800 rounded-lg overflow-hidden">
              <button
                className="w-full px-3 py-2 text-left flex items-start gap-2 justify-between"
                onClick={() => setExpandida(expandida === i ? null : i)}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-300 break-words">{idea.asesor}</p>
                  <span className={`text-xs px-1.5 py-0.5 rounded mt-0.5 inline-block text-white ${colorEtapa(idea.etapa)}`}>
                    {idea.etapa}
                  </span>
                </div>
                <span className="text-gray-600 text-xs mt-1">{expandida === i ? "▲" : "▼"}</span>
              </button>
              {expandida === i && (
                <div className="px-3 pb-3 space-y-2 border-t border-gray-700">
                  {idea.problema && (
                    <div>
                      <p className="text-xs text-gray-500 mt-2 mb-1">Problema</p>
                      <p className="text-xs text-gray-300 line-clamp-3">{idea.problema}</p>
                    </div>
                  )}
                  {idea.propuesta && (
                    <div>
                      <p className="text-xs text-blue-400 mb-1">Propuesta</p>
                      <p className="text-xs text-gray-300 line-clamp-3">{idea.propuesta}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}



