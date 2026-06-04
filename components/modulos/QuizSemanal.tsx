"use client"

import { useEffect, useState } from "react"
import { usePerfilContext } from "@/context/PerfilContext"
import { useModuloUrl } from "@/hooks/useModuloUrl"
import { useModuloMetric } from "@/context/ModuloMetricContext"

interface Agente {
  nombre: string
  presento: boolean
  aprueba: boolean
}

interface SupervisorQuiz {
  supervisor: string
  total: number
  presento: number
  noPresento: number
  aprueba: number
}

interface Data {
  modo: "supervisor" | "coordinador"
  total: number
  semanaActual: string
  semanas: string[]
  resumen: { presento: number; noPresento: number; aprueba?: number; reprueba?: number }
  agentes?: Agente[]
  porSupervisor?: SupervisorQuiz[]
}

export default function QuizSemanal() {
  const [data, setData] = useState<Data | null>(null)
  const [cargando, setCargando] = useState(true)
  const url = useModuloUrl("/api/modulos/quiz")
  const { setMetric } = useModuloMetric()

  useEffect(() => {
    fetch(url).then(r => r.json()).then(d => {
      setData(d)
      if (d.resumen) {
        setMetric({
          valor: `${d.resumen.presento} presentaron`,
          alerta: d.resumen.noPresento,
          color: d.resumen.noPresento === 0 ? "green" : d.resumen.noPresento <= 3 ? "yellow" : "red",
        })
      }
    }).finally(() => setCargando(false))
  }, [url, setMetric])

  if (cargando) return <p className="text-xs text-gray-500 py-2">Cargando...</p>
  if (!data?.resumen || data.total === 0) return <p className="text-xs text-gray-500 py-2">Sin datos del quiz.</p>

  const { resumen } = data

  // ── VISTA COORDINADOR ──────────────────────────────────────────
  if (data.modo === "coordinador") {
    return (
      <div className="space-y-4">
        {/* KPI global */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-800 rounded-lg p-3">
            <p className="text-xs text-gray-400">Presentaron</p>
            <p className="text-2xl font-bold text-white">{resumen.presento}</p>
            <p className="text-xs text-gray-500">de {data.total} agentes</p>
          </div>
          <div className={`rounded-lg p-3 border ${resumen.noPresento > 0 ? "bg-red-900/20 border-red-800" : "bg-green-900/20 border-green-800"}`}>
            <p className="text-xs text-gray-400">Pendientes</p>
            <p className={`text-2xl font-bold ${resumen.noPresento > 0 ? "text-red-400" : "text-green-400"}`}>
              {resumen.noPresento}
            </p>
            <p className="text-xs text-gray-500">sem. {data.semanaActual}</p>
          </div>
        </div>

        {/* Por supervisor */}
        <div className="space-y-2">
          <p className="text-xs text-gray-500">Por equipo</p>
          {(data.porSupervisor ?? []).map((sv, i) => (
            <div key={i} className="bg-gray-800 rounded-lg p-3">
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs text-gray-300 truncate max-w-[150px]">
                  {sv.supervisor.split(" ").slice(0, 3).join(" ")}
                </span>
                {sv.noPresento > 0 && (
                  <span className="text-xs text-red-400">⚠ {sv.noPresento} pendientes</span>
                )}
              </div>
              <div className="flex gap-3 text-xs text-gray-500">
                <span className="text-green-400">{sv.presento} presentaron</span>
                <span className="text-blue-400">{sv.aprueba} aprobaron</span>
                <span>{sv.total} total</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── VISTA SUPERVISOR ───────────────────────────────────────────
  const agentes = data.agentes ?? []
  // Ordenar: no presentó primero, luego reprobó, luego aprobó
  const ordenados = [...agentes].sort((a, b) => {
    const peso = (x: Agente) => !x.presento ? 0 : !x.aprueba ? 1 : 2
    return peso(a) - peso(b)
  })

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gray-800 rounded-lg p-3">
          <p className="text-xs text-gray-400">Presentaron</p>
          <p className={`text-2xl font-bold ${resumen.presento === data.total ? "text-green-400" : "text-yellow-400"}`}>
            {resumen.presento}
          </p>
          <p className="text-xs text-gray-500">de {data.total}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-3">
          <p className="text-xs text-gray-400">Aprobaron</p>
          <p className={`text-2xl font-bold ${(resumen.aprueba ?? 0) === resumen.presento ? "text-green-400" : "text-yellow-400"}`}>
            {resumen.aprueba ?? 0}
          </p>
          <p className="text-xs text-gray-500">de {resumen.presento} que presentaron</p>
        </div>
      </div>

      {/* Alerta pendientes */}
      {resumen.noPresento > 0 && (
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-3">
          <p className="text-xs text-red-400 font-medium">
            ⚠ {resumen.noPresento} persona{resumen.noPresento !== 1 ? "s" : ""} sin presentar el quiz
          </p>
        </div>
      )}

      {/* Lista de agentes */}
      <div>
        <p className="text-xs text-gray-500 mb-2">Semana {data.semanaActual}</p>
        <div className="space-y-1 max-h-56 overflow-y-auto">
          {ordenados.map((a, i) => {
            const noPresento = !a.presento
            const reprueba = a.presento && !a.aprueba
            return (
              <div key={i} className="flex items-center justify-between py-1.5 px-2 rounded bg-gray-800">
                <div className="flex items-center gap-2 min-w-0">
                  {noPresento && <span className="text-red-400 text-xs">⚠</span>}
                  <span className={`text-xs truncate ${noPresento ? "text-red-400 font-medium" : reprueba ? "text-yellow-400" : "text-gray-300"}`}>
                    {a.nombre.split(" ").slice(0, 3).join(" ")}
                  </span>
                </div>
                <div className="flex gap-1 flex-shrink-0 ml-2">
                  {noPresento ? (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-red-900/40 text-red-300">No presentó</span>
                  ) : a.aprueba ? (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-green-900/40 text-green-300">✓ Aprobó</span>
                  ) : (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-900/40 text-yellow-300">✗ Reprobó</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}



