"use client"

import { useEffect, useState } from "react"
import { usePerfilContext } from "@/context/PerfilContext"
import { useModuloUrl } from "@/hooks/useModuloUrl"
import { useModuloMetric } from "@/context/ModuloMetricContext"
import { useSemanaGlobal } from "@/context/SemanaGlobalContext"

interface PorTipo {
  pcapta: { pct: number; total: number }
  pauta: { pct: number; total: number }
}

interface Dia {
  dia: number
  semana: string
  total: number
  cumple: string
  cumpleMeta: boolean
  porTipo?: { pcapta: { total: number; cumple: number }; pauta: { total: number; cumple: number } }
}

interface DiaSemana {
  dia: number
  total: number
  cumpleMeta: boolean
}

interface SupervisorRow {
  supervisor: string
  dias: number
  promCumple: number
  totalMonitoreos: number
  diasConMeta: number
  porTipo?: PorTipo
  diasSemana?: DiaSemana[]
}

interface Data {
  modo: "supervisor" | "coordinador"
  semanas: string[]
  semanaActual: string
  kpi: { pct: number; totalMonitoreos: number; diasConMeta?: number; meta?: number; porTipo?: PorTipo }
  dias?: Dia[]
  porSupervisor?: SupervisorRow[]
}

const META = 5
const DIAS_LABEL = ["", "Lun", "Mar", "Mié", "Jue", "Vie"]

function colorPct(n: number) {
  if (n >= 80) return "text-green-400"
  if (n >= 60) return "text-yellow-400"
  return "text-red-400"
}

function barColor(n: number) {
  if (n >= 80) return "bg-green-500"
  if (n >= 60) return "bg-yellow-500"
  return "bg-red-500"
}

// Grilla compacta Lun-Vie con el conteo de monitoreos diarios de un equipo vs. la meta
function GridDiasEquipo({ diasSemana }: { diasSemana?: DiaSemana[] }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(numDia => {
        const dia = diasSemana?.find(d => d.dia === numDia)
        const count = dia?.total ?? null
        const color = count === null ? "bg-gray-700"
          : count >= META ? "bg-green-500"
          : count >= Math.ceil(META / 2) ? "bg-yellow-500"
          : "bg-red-500"
        return (
          <div key={numDia} className="flex-1 flex flex-col items-center gap-1">
            <div className={`w-full h-4 rounded ${color}`} />
            <span className="text-xs text-gray-600">{DIAS_LABEL[numDia]}</span>
          </div>
        )
      })}
    </div>
  )
}

function DesglosePorTipo({ porTipo }: { porTipo?: PorTipo }) {
  if (!porTipo) return null
  const { pcapta, pauta } = porTipo
  if (pcapta.total === 0 && pauta.total === 0) return null
  return (
    <div className="flex gap-3 text-xs text-gray-500">
      {pcapta.total > 0 && (
        <span>
          PCA/PTA: <span className={`font-semibold ${colorPct(pcapta.pct)}`}>{pcapta.pct}%</span> ({pcapta.total})
        </span>
      )}
      {pauta.total > 0 && (
        <span>
          Pauta: <span className={`font-semibold ${colorPct(pauta.pct)}`}>{pauta.pct}%</span> ({pauta.total})
        </span>
      )}
    </div>
  )
}

export default function AdherenciaPCA() {
  const [data, setData] = useState<Data | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState("")
  const { semanaGlobal, reportWeeks } = useSemanaGlobal()
  const base = useModuloUrl("/api/modulos/adherencia-pca")
  const url = semanaGlobal ? `${base}${base.includes("?") ? "&" : "?"}semana=${semanaGlobal}` : base
  const { setMetric } = useModuloMetric()

  useEffect(() => {
    fetch(url).then(r => r.json()).then(d => {
      if (d.error) { setError(d.error); setMetric({ valor: "—", color: "white" }); return }
      setError("")
      setData(d)
      if (Array.isArray(d.semanas)) reportWeeks("adherencia-pca", d.semanas)
      if (d.kpi) {
        setMetric({
          valor: `${d.kpi.pct}%`,
          color: d.kpi.pct >= 80 ? "green" : d.kpi.pct >= 60 ? "yellow" : "red",
        })
      }
    }).finally(() => setCargando(false))
  }, [url, setMetric, reportWeeks])

  if (cargando && !data) return <p className="text-xs text-gray-500 py-2">Cargando...</p>
  if (error && !data) return <p className="text-xs text-red-400 py-2">Error: {error}</p>
  if (!data || !data.kpi) return <p className="text-xs text-gray-500 py-2">Sin registros.</p>

  const semanaActiva = data.semanaActual

  // ── VISTA COORDINADOR ──────────────────────────────────────────
  if (data.modo === "coordinador") {
    const supervisores = data.porSupervisor ?? []
    return (
      <div className="space-y-4">
        {/* KPI global */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-800 rounded-lg p-3">
            <p className="text-xs text-gray-400">Cumplimiento equipo</p>
            <p className={`text-2xl font-bold ${colorPct(data.kpi.pct)}`}>{data.kpi.pct}%</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-3">
            <p className="text-xs text-gray-400">Monitoreos sem.</p>
            <p className="text-2xl font-bold text-white">{data.kpi.totalMonitoreos}</p>
          </div>
        </div>

        <DesglosePorTipo porTipo={data.kpi.porTipo} />

        {/* Por supervisor */}
        <div className="space-y-2">
          <p className="text-xs text-gray-500">Por supervisor — sem. {semanaActiva}</p>
          {supervisores.map((sv, i) => (
            <div key={i} className="bg-gray-800 rounded-lg p-3">
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs text-gray-300 break-words mr-2">
                  {sv.supervisor}
                </span>
                <span className={`text-xs font-bold ${colorPct(sv.promCumple)}`}>{sv.promCumple}%</span>
              </div>
              <div className="flex-1 bg-gray-700 rounded-full h-1.5 mb-2">
                <div className={`h-1.5 rounded-full ${barColor(sv.promCumple)}`} style={{ width: `${sv.promCumple}%` }} />
              </div>
              <GridDiasEquipo diasSemana={sv.diasSemana} />
              <div className="flex gap-3 text-xs text-gray-600 mt-1">
                <span>{sv.totalMonitoreos} monitoreos</span>
                <span>{sv.diasConMeta}/{sv.dias} días con meta</span>
              </div>
              <div className="mt-1">
                <DesglosePorTipo porTipo={sv.porTipo} />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── VISTA SUPERVISOR ───────────────────────────────────────────
  const diasSemana = (data.dias ?? []).filter(d => String(d.semana) === semanaActiva)
  const totalMonitoreosSemana = diasSemana.reduce((s, d) => s + d.total, 0)
  const diasConMetaSemana = diasSemana.filter(d => d.cumpleMeta).length

  return (
    <div className="space-y-4">

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gray-800 rounded-lg p-3">
          <p className="text-xs text-gray-400">Cumplimiento</p>
          <p className={`text-2xl font-bold ${colorPct(data.kpi.pct)}`}>{data.kpi.pct}%</p>
          <p className="text-xs text-gray-500">{diasConMetaSemana} días con meta</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-3">
          <p className="text-xs text-gray-400">Monitoreos</p>
          <p className="text-2xl font-bold text-white">{totalMonitoreosSemana}</p>
          <p className="text-xs text-gray-500">meta: {META}/día</p>
        </div>
      </div>

      <DesglosePorTipo porTipo={data.kpi.porTipo} />

      {/* Barras por día con conteo vs meta */}
      <div>
        <p className="text-xs text-gray-500 mb-2">Monitoreos diarios (meta: {META})</p>
        <div className="flex gap-1 items-end">
          {[1, 2, 3, 4, 5].map((numDia) => {
            const dia = diasSemana.find(d => d.dia === numDia)
            const count = dia?.total ?? null
            const pct = count !== null ? Math.min((count / META) * 100, 100) : 0
            const color = count === null ? "bg-gray-700"
              : count >= META ? "bg-green-500"
              : count >= Math.ceil(META / 2) ? "bg-yellow-500"
              : "bg-red-500"
            return (
              <div key={numDia} className="flex-1 flex flex-col items-center gap-1">
                {count !== null && (
                  <span className={`text-xs font-medium ${count >= META ? "text-green-400" : count > 0 ? "text-yellow-400" : "text-red-400"}`}>
                    {count}
                  </span>
                )}
                <div className="w-full bg-gray-800 rounded h-16 flex flex-col justify-end overflow-hidden">
                  <div className={`w-full ${color} transition-all rounded`} style={{ height: `${Math.max(pct, count !== null ? 8 : 0)}%` }} />
                </div>
                <span className="text-xs text-gray-600">{DIAS_LABEL[numDia]}</span>
              </div>
            )
          })}
        </div>
        {/* Línea de meta visual */}
        <p className="text-xs text-gray-600 text-right mt-1">— meta: {META} monitoreos/día</p>
      </div>
    </div>
  )
}



