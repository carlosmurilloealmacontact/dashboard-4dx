"use client"

import { useEffect, useState } from "react"
import { usePerfilContext } from "@/context/PerfilContext"
import { useModuloUrl } from "@/hooks/useModuloUrl"
import { useModuloMetric } from "@/context/ModuloMetricContext"
import { useSemanaGlobal, normalizarSemana } from "@/context/SemanaGlobalContext"

interface Dims {
  preparacion: string; involucramiento: string; herramientas: string
  alineacion: string; reconocimiento: string; retroalimentacion: string
  seguimiento: string; tips: string; resumen: string
}

interface Confirmacion {
  fecha: string; ritual: string; pontos: string; oport: string; liderAcomp: string; dims: Dims
}

interface ConfLigera {
  fecha: string; semana: string; liderAcomp: string; ritual: string
}

interface CoachRow {
  coach: string
  total: number
  estaSemana: number
  confirmaciones: ConfLigera[]
}

interface Data {
  modo?: "coordinador"
  total: number
  esSupervisor: boolean
  semanaActual: string
  semanas?: string[]
  deEstaSemana: number
  alertaSupervisor: string | null
  alertaCoach: string | null
  promedios: Record<string, number | null>
  dimMasAfectada: { key: string; label: string; valor: number } | null
  confirmaciones?: ConfLigera[]
  ultimas5: Confirmacion[]
  porCoach?: CoachRow[]
}

const DIMS_LABELS: Record<string, string> = {
  preparacion: "Preparación", involucramiento: "Involucramiento",
  herramientas: "Herramientas", alineacion: "Alineación",
  reconocimiento: "Reconocimiento", retroalimentacion: "Retroalimentación",
  seguimiento: "Seguimiento", tips: "Tips", resumen: "Resumen",
}

function textoANumero(v: string): number | null {
  if (!v) return null
  const lower = v.toLowerCase()
  if (lower === "1" || lower.includes("completa")) return 100
  if (lower.includes("parcial")) return 50
  if (lower.includes("observado") || lower === "0") return 0
  const n = parseFloat(v)
  return isNaN(n) ? null : n <= 1 ? Math.round(n * 100) : Math.round(n)
}

function colorPct(n: number | null) {
  if (n === null) return "text-gray-500"
  if (n >= 80) return "text-green-400"
  if (n >= 60) return "text-yellow-400"
  return "text-red-400"
}

export default function ConfirmacionesRol() {
  const [data, setData] = useState<Data | null>(null)
  const [cargando, setCargando] = useState(true)
  const [expandida, setExpandida] = useState<number | null>(null)
  const { semanaGlobal, reportWeeks } = useSemanaGlobal()
  const url = useModuloUrl("/api/modulos/confirmaciones-rol")
  const { setMetric } = useModuloMetric()

  useEffect(() => {
    fetch(url).then(r => r.json()).then(d => {
      setData(d)
      if (Array.isArray(d.semanas)) reportWeeks("confirmaciones", d.semanas)
      if (typeof d.total !== "number") {
        setMetric({ valor: "—", color: "white" })
      } else if (d.esSupervisor) {
        setMetric({
          valor: `${d.total} recibidas`,
          alerta: d.dimMasAfectada && d.dimMasAfectada.valor < 80 ? 1 : 0,
          color: d.total > 0 ? "green" : "white",
        })
      } else if (d.modo === "coordinador") {
        setMetric({
          valor: `${d.deEstaSemana} realizadas`,
          alerta: d.deEstaSemana === 0 && d.total > 0 ? 1 : 0,
          color: d.deEstaSemana > 0 ? "green" : d.total > 0 ? "yellow" : "white",
        })
      }
    }).finally(() => setCargando(false))
  }, [url, setMetric, reportWeeks])

  // Para coach/coordinador, el indicador debe reflejar la semana seleccionada
  // (la misma que se muestra en el cuerpo del módulo), no siempre la semana actual.
  useEffect(() => {
    if (!data || data.esSupervisor || data.modo === "coordinador" || typeof data.total !== "number") return
    const semanaSel = semanaGlobal ?? normalizarSemana(data.semanaActual)
    const esActual = semanaSel === normalizarSemana(data.semanaActual)
    const conteo = (data.confirmaciones ?? []).filter(c => normalizarSemana(c.semana) === semanaSel).length
    setMetric({
      valor: `${conteo} realizadas`,
      alerta: esActual && conteo === 0 && data.total > 0 ? 1 : 0,
      color: conteo > 0 ? "green" : data.total > 0 ? "yellow" : "white",
    })
  }, [data, semanaGlobal, setMetric])

  if (cargando) return <p className="text-xs text-gray-500 py-2">Cargando...</p>

  // ── VISTA COORDINADOR — confirmaciones REALIZADAS por su equipo de coaches ──
  if (data?.modo === "coordinador") {
    const porCoach = data.porCoach ?? []
    const semanaSelNorm = semanaGlobal ?? normalizarSemana(data.semanaActual)
    const esSemanaActual = semanaSelNorm === normalizarSemana(data.semanaActual)
    if (porCoach.length === 0) return <p className="text-xs text-gray-500 py-2">Sin coaches en tu equipo.</p>

    return (
      <div className="space-y-4">
        {/* KPI */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white border border-gray-200 rounded-lg p-3">
            <p className="text-xs text-gray-600">{esSemanaActual ? "Esta semana" : `Semana ${semanaSelNorm}`}</p>
            <p className={`text-2xl font-bold ${data.deEstaSemana > 0 ? "text-green-600" : "text-red-600"}`}>
              {data.deEstaSemana}
            </p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-3">
            <p className="text-xs text-gray-600">Total equipo</p>
            <p className="text-2xl font-bold text-gray-900">{data.total}</p>
          </div>
        </div>

        {/* Por coach */}
        <div className="space-y-2">
          <p className="text-xs text-gray-600 mb-1">
            {esSemanaActual ? "Por coach — esta semana" : `Por coach — semana ${semanaSelNorm}`}
          </p>
          {porCoach.map((c, i) => {
            const confsSemana = c.confirmaciones.filter(conf => normalizarSemana(conf.semana) === semanaSelNorm)
            return (
              <div key={i} className="bg-white border border-gray-200 rounded-lg p-3">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-gray-700 break-words mr-2">
                    {c.coach}
                  </span>
                  <span className={`text-xs font-bold ${confsSemana.length > 0 ? "text-green-600" : "text-red-600"}`}>
                    {confsSemana.length} esta semana
                  </span>
                </div>
                {confsSemana.length > 0 ? (
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {confsSemana.map((conf, j) => (
                      <div key={j} className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded px-2 py-1">
                        <span className="text-xs text-gray-600 break-words mr-2">{conf.liderAcomp}</span>
                        {conf.ritual && <span className="text-xs text-gray-400 truncate max-w-[80px]">{conf.ritual}</span>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">Sin confirmaciones esta semana</p>
                )}
                <p className="text-xs text-gray-400 mt-1">{c.total} en total</p>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  if (!data || data.total === 0 || !data.ultimas5) return <p className="text-xs text-gray-500 py-2">Sin confirmaciones registradas.</p>

  // ── VISTA SUPERVISOR — confirmaciones RECIBIDAS ──────────────────
  if (data.esSupervisor) {
    const promediosDims = Object.entries(DIMS_LABELS).map(([key, label]) => ({
      key, label, prom: data.promedios[key] ?? null
    }))
    const promGeneral = (() => {
      const vals = Object.values(data.promedios).filter((v): v is number => v !== null)
      return vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b) / vals.length) : null
    })()

    return (
      <div className="space-y-4">
        {/* KPI */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white border border-gray-200 rounded-lg p-3">
            <p className="text-xs text-gray-600">Confirmaciones recibidas</p>
            <p className="text-2xl font-bold text-gray-900">{data.total}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-3">
            <p className="text-xs text-gray-600">Promedio general</p>
            <p className={`text-2xl font-bold ${colorPct(promGeneral)}`}>
              {promGeneral !== null ? `${promGeneral}%` : "—"}
            </p>
          </div>
        </div>

        {/* Alerta ítem más afectado */}
        {data.dimMasAfectada && data.dimMasAfectada.valor < 80 && (
          <div className="bg-yellow-900/20 border border-yellow-800 rounded-lg p-3">
            <p className="text-xs text-yellow-400 font-medium">⚠ Ítem más afectado</p>
            <p className="text-sm text-gray-900 mt-1">{data.dimMasAfectada.label}</p>
            <p className="text-xs text-gray-500">{data.dimMasAfectada.valor}% promedio</p>
          </div>
        )}

        {/* Dimensiones */}
        <div className="space-y-2">
          {promediosDims.map(({ key, label, prom }) => (
            <div key={key} className="flex items-center gap-2">
              <span className="text-xs text-gray-600 w-32 truncate">{label}</span>
              <div className="flex-1 bg-white border border-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${prom === null ? "bg-gray-700" : prom >= 80 ? "bg-green-500" : prom >= 60 ? "bg-yellow-500" : "bg-red-500"}`}
                  style={{ width: `${prom ?? 0}%` }}
                />
              </div>
              <span className={`text-xs w-8 text-right ${colorPct(prom)}`}>
                {prom !== null ? `${prom}%` : "—"}
              </span>
            </div>
          ))}
        </div>

        {/* Últimas confirmaciones */}
        <div>
          <p className="text-xs text-gray-500 mb-2">Últimas confirmaciones</p>
          <div className="space-y-2">
            {data.ultimas5.map((c, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <button className="w-full px-3 py-2 text-left flex justify-between items-center"
                  onClick={() => setExpandida(expandida === i ? null : i)}>
                  <span className="text-xs text-gray-700">Confirmación #{data.total - data.ultimas5.length + i + 1}</span>
                  <span className="text-gray-600 text-xs">{expandida === i ? "▲" : "▼"}</span>
                </button>
                {expandida === i && (
                  <div className="px-3 pb-3 space-y-2 border-t border-gray-200">
                    {c.pontos && <div><p className="text-xs text-green-400 mt-2 mb-1">✓ Puntos fuertes</p><p className="text-xs text-gray-700">{c.pontos}</p></div>}
                    {c.oport && <div><p className="text-xs text-yellow-400 mb-1">↗ Oportunidades</p><p className="text-xs text-gray-700">{c.oport}</p></div>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ── VISTA COACH/COORDINADOR — confirmaciones REALIZADAS ───────────
  const semanaSelNorm = semanaGlobal ?? normalizarSemana(data.semanaActual)
  const esSemanaActual = semanaSelNorm === normalizarSemana(data.semanaActual)
  const lista = data.confirmaciones ?? []
  const confirmacionesSemana = lista.filter(c => normalizarSemana(c.semana) === semanaSelNorm)
  const conteoSemana = confirmacionesSemana.length

  return (
    <div className="space-y-4">
      {/* KPI */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <p className="text-xs text-gray-600">{esSemanaActual ? "Esta semana" : `Semana ${semanaSelNorm}`}</p>
          <p className={`text-2xl font-bold ${conteoSemana > 0 ? "text-green-600" : "text-red-600"}`}>
            {conteoSemana}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <p className="text-xs text-gray-600">Total realizadas</p>
          <p className="text-2xl font-bold text-gray-900">{data.total}</p>
        </div>
      </div>

      {/* Alerta si no ha hecho esta semana (solo en la semana actual) */}
      {esSemanaActual && data.alertaCoach && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-xs text-red-700 font-medium">⚠ {data.alertaCoach}</p>
        </div>
      )}

      {/* Confirmaciones de la semana seleccionada */}
      <div>
        <p className="text-xs text-gray-600 mb-2">
          {esSemanaActual ? "Confirmaciones de esta semana" : `Confirmaciones de la semana ${semanaSelNorm}`}
        </p>
        {confirmacionesSemana.length > 0 ? (
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {confirmacionesSemana.map((c, i) => (
              <div key={i} className="flex items-center justify-between bg-white border border-gray-200 rounded px-3 py-2">
                <span className="text-xs text-gray-700 break-words mr-2">{c.liderAcomp}</span>
                {c.ritual && <span className="text-xs text-gray-500 truncate max-w-[80px]">{c.ritual}</span>}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-500">Sin confirmaciones esta semana</p>
        )}
      </div>
    </div>
  )
}



