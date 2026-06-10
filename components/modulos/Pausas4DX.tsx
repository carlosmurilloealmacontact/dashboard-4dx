"use client"

import { useEffect, useState } from "react"
import { useModuloUrl } from "@/hooks/useModuloUrl"
import { useModuloMetric } from "@/context/ModuloMetricContext"
import { useSemanaGlobal } from "@/context/SemanaGlobalContext"

interface Registro {
  fecha: string
  agenteId: string
  agente: string
  tipo: string
  estado: string
  participo: boolean
  jefe: string
  duracionMin: number
}

function formatoDuracion(min: number): string {
  if (!min) return "Sin registro"
  const horas = Math.floor(min / 60)
  const minutos = Math.round(min % 60)
  return horas > 0 ? `${horas}h ${minutos}min` : `${minutos} min`
}

interface SupervisorResumen {
  supervisor: string
  totalAgentes: number
  pctDialogo: number
  pctCDR: number
}

interface Data {
  modo: "supervisor" | "coordinador"
  semanas: string[]
  semanaActual: string
  kpi: {
    dialogo: { pct: number; alertas: number }
    cdr:     { pct: number; alertas: number }
  }
  registros: Registro[]
  supervisoresResumen?: SupervisorResumen[]
}

const DIAS = [
  { num: 1, label: "Lun" },
  { num: 2, label: "Mar" },
  { num: 3, label: "Mié" },
  { num: 4, label: "Jue" },
  { num: 5, label: "Vie" },
]

function diaSemana(fechaStr: string): number {
  const [y, m, d] = fechaStr.split("-").map(Number)
  return new Date(y, m - 1, d).getDay()
}

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

interface GridPausaProps {
  titulo: string
  registros: Registro[]
  tipo: string
  agentes: { id: string; nombre: string }[]
}

function GridPausa({ titulo, registros, tipo, agentes }: GridPausaProps) {
  const filas = registros.filter(r => r.tipo === tipo)
  const total = filas.length
  const participaron = filas.filter(r => r.participo).length
  const pct = total > 0 ? Math.round((participaron / total) * 100) : 0

  function getRegistro(agenteId: string, dia: number): Registro | undefined {
    return filas.find(r => r.agenteId === agenteId && diaSemana(r.fecha) === dia)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-gray-300">{titulo}</p>
        <span className={`text-xs font-bold ${colorPct(pct)}`}>{pct}%</span>
      </div>
      {agentes.length === 0 ? (
        <p className="text-xs text-gray-600">Sin registros</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className="text-left text-gray-500 font-normal pb-1 pr-2">Agente</th>
                {DIAS.map(d => (
                  <th key={d.num} className="text-center text-gray-500 font-normal pb-1 px-1 w-8">{d.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {agentes.map(({ id, nombre }) => (
                <tr key={id}>
                  <td className="py-1 pr-2 truncate max-w-[120px] text-gray-100">
                    {nombre.split(" ").slice(0, 3).join(" ")}
                  </td>
                  {DIAS.map(d => {
                    const r = getRegistro(id, d.num)
                    const color = !r ? "bg-gray-700" : r.participo ? "bg-green-500" : "bg-red-500"
                    return (
                      <td key={d.num} className="text-center py-1 px-1">
                        <div
                          className={`w-5 h-5 rounded mx-auto ${color}`}
                          title={r ? formatoDuracion(r.duracionMin) : "Sin registro"}
                        />
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-800">
                <td className="py-1 pr-2 text-gray-500">Participaron</td>
                {DIAS.map(d => {
                  const conDialogo = agentes.filter(({ id }) => getRegistro(id, d.num)?.participo).length
                  return (
                    <td key={d.num} className="text-center py-1 px-1 text-gray-300 font-medium">
                      {conDialogo}
                    </td>
                  )
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

export default function Pausas4DX() {
  const [data, setData] = useState<Data | null>(null)
  const [cargando, setCargando] = useState(true)
  const [supervisorDetalle, setSupervisorDetalle] = useState<string | null>(null)
  const { semanaGlobal, reportWeeks } = useSemanaGlobal()
  const base = useModuloUrl("/api/modulos/pausas-4dx")
  const url = semanaGlobal ? `${base}${base.includes("?") ? "&" : "?"}semana=${semanaGlobal}` : base
  const { setMetric } = useModuloMetric()

  useEffect(() => {
    fetch(url).then(r => r.json()).then(d => {
      setData(d)
      if (Array.isArray(d.semanas)) reportWeeks("pausas-4dx", d.semanas)
      if (d.kpi) {
        const min = Math.min(d.kpi.dialogo.pct, d.kpi.cdr.pct)
        const alertas = d.kpi.dialogo.alertas + d.kpi.cdr.alertas
        setMetric({
          valor: `D${d.kpi.dialogo.pct}% · CDR${d.kpi.cdr.pct}%`,
          alerta: alertas,
          color: min >= 80 ? "green" : min >= 60 ? "yellow" : "red",
        })
      } else {
        setMetric({ valor: "—", color: "white" })
      }
    }).finally(() => setCargando(false))
  }, [url, setMetric, reportWeeks])

  if (cargando && !data) return <p className="text-xs text-gray-500 py-2">Cargando...</p>
  if (!data?.kpi) return <p className="text-xs text-gray-500 py-2">Sin registros.</p>

  const { kpi, registros, semanaActual } = data

  // ── VISTA COORDINADOR ──────────────────────────────────────────
  if (data.modo === "coordinador") {
    const resumen = data.supervisoresResumen ?? []

    if (supervisorDetalle) {
      const regSup = registros.filter(r => r.jefe.toLowerCase() === supervisorDetalle.toLowerCase())
      const agentes = [
        ...new Map(regSup.map(r => [r.agenteId, { id: r.agenteId, nombre: r.agente }])).values()
      ]
      return (
        <div className="space-y-4">
          <button className="text-xs text-gray-500 hover:text-white" onClick={() => setSupervisorDetalle(null)}>
            ← Volver
          </button>
          <p className="text-xs text-white font-medium truncate">
            {supervisorDetalle.split(" ").slice(0, 3).join(" ")}
          </p>
          <GridPausa titulo="Diálogo 4DX" registros={regSup} tipo="Diálogo" agentes={agentes} />
          <div className="border-t border-gray-800 pt-4">
            <GridPausa titulo="Pausa CDR" registros={regSup} tipo="CDR" agentes={agentes} />
          </div>
          <Leyenda />
        </div>
      )
    }

    return (
      <div className="space-y-4">
        {/* KPI global */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-800 rounded-lg p-3">
            <p className="text-xs text-gray-400">Diálogo 4DX</p>
            <p className={`text-2xl font-bold ${colorPct(kpi.dialogo.pct)}`}>{kpi.dialogo.pct}%</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-3">
            <p className="text-xs text-gray-400">Pausa CDR</p>
            <p className={`text-2xl font-bold ${colorPct(kpi.cdr.pct)}`}>{kpi.cdr.pct}%</p>
          </div>
        </div>

        {/* Por supervisor */}
        <div className="space-y-2">
          <p className="text-xs text-gray-500">Por supervisor — sem. {semanaActual}</p>
          {resumen.map((sv, i) => (
            <button key={i}
              className="w-full bg-gray-800 rounded-lg p-3 text-left hover:border hover:border-gray-600"
              onClick={() => setSupervisorDetalle(sv.supervisor)}
            >
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs text-gray-300 truncate max-w-[160px]">
                  {sv.supervisor.split(" ").slice(0, 3).join(" ")}
                </span>
                <span className="text-xs text-gray-500">{sv.totalAgentes} ag.</span>
              </div>
              <div className="flex gap-3 items-center">
                <div className="flex-1">
                  <p className="text-xs text-gray-500 mb-0.5">Diálogo</p>
                  <div className="bg-gray-700 rounded-full h-1.5">
                    <div className={`h-1.5 rounded-full ${barColor(sv.pctDialogo)}`} style={{ width: `${sv.pctDialogo}%` }} />
                  </div>
                </div>
                <span className={`text-xs font-bold w-10 text-right ${colorPct(sv.pctDialogo)}`}>{sv.pctDialogo}%</span>
              </div>
              <div className="flex gap-3 items-center mt-1">
                <div className="flex-1">
                  <p className="text-xs text-gray-500 mb-0.5">CDR</p>
                  <div className="bg-gray-700 rounded-full h-1.5">
                    <div className={`h-1.5 rounded-full ${barColor(sv.pctCDR)}`} style={{ width: `${sv.pctCDR}%` }} />
                  </div>
                </div>
                <span className={`text-xs font-bold w-10 text-right ${colorPct(sv.pctCDR)}`}>{sv.pctCDR}%</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    )
  }

  // ── VISTA SUPERVISOR ───────────────────────────────────────────
  const agentes = [
    ...new Map(registros.map(r => [r.agenteId, { id: r.agenteId, nombre: r.agente }])).values()
  ]

  return (
    <div className="space-y-4">
      {/* KPI */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gray-800 rounded-lg p-3">
          <p className="text-xs text-gray-400">Diálogo 4DX</p>
          <p className={`text-2xl font-bold ${colorPct(kpi.dialogo.pct)}`}>{kpi.dialogo.pct}%</p>
          {kpi.dialogo.alertas > 0 && (
            <p className="text-xs text-red-400 mt-0.5">⚠ {kpi.dialogo.alertas} sin participar</p>
          )}
        </div>
        <div className="bg-gray-800 rounded-lg p-3">
          <p className="text-xs text-gray-400">Pausa CDR</p>
          <p className={`text-2xl font-bold ${colorPct(kpi.cdr.pct)}`}>{kpi.cdr.pct}%</p>
          {kpi.cdr.alertas > 0 && (
            <p className="text-xs text-red-400 mt-0.5">⚠ {kpi.cdr.alertas} sin participar</p>
          )}
        </div>
      </div>

      {/* Grid Diálogo */}
      <GridPausa titulo="Diálogo 4DX — Lun/Vie" registros={registros} tipo="Diálogo" agentes={agentes} />

      {/* Grid CDR */}
      <div className="border-t border-gray-800 pt-4">
        <GridPausa titulo="Pausa CDR — Lun/Vie" registros={registros} tipo="CDR" agentes={agentes} />
      </div>

      <Leyenda />
    </div>
  )
}

function Leyenda() {
  return (
    <div className="flex gap-3 text-xs text-gray-500 pt-1">
      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-500 inline-block" />Participó</span>
      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500 inline-block" />No participó</span>
      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-700 inline-block" />Sin dato</span>
    </div>
  )
}
