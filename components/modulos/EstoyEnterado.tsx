"use client"

import { useEffect, useState } from "react"
import { useModuloUrl } from "@/hooks/useModuloUrl"
import { useModuloMetric } from "@/context/ModuloMetricContext"
import { useSemanaGlobal } from "@/context/SemanaGlobalContext"

interface TemaData {
  tema: string
  total: number
  si: number
  no: number
  sinRespuesta: number
  pctClaro: number
  detalle: { si: string[]; no: string[]; sinRespuesta: string[] }
}

interface Data {
  total: number
  semanaActual: string
  semanas: string[]
  pctClaro: number
  porTema: TemaData[]
}

export default function EstoyEnterado() {
  const [data, setData] = useState<Data | null>(null)
  const [cargando, setCargando] = useState(true)
  const [temaSeleccionado, setTemaSeleccionado] = useState("__todos__")
  const { semanaGlobal, reportWeeks } = useSemanaGlobal()
  const base = useModuloUrl("/api/modulos/estoy-enterado")
  const url = semanaGlobal ? `${base}${base.includes("?") ? "&" : "?"}semana=${semanaGlobal}` : base
  const { setMetric } = useModuloMetric()

  useEffect(() => {
    fetch(url).then(r => r.json()).then(d => {
      setData(d)
      if (Array.isArray(d.semanas)) reportWeeks("estoy-enterado", d.semanas)
      setTemaSeleccionado("__todos__")
      if (typeof d.pctClaro === "number") {
        setMetric({
          valor: `${d.pctClaro}% claridad`,
          color: d.pctClaro >= 80 ? "green" : d.pctClaro >= 60 ? "yellow" : "red",
        })
      } else {
        setMetric({ valor: "—", color: "white" })
      }
    }).finally(() => setCargando(false))
  }, [url, setMetric, reportWeeks])

  if (cargando) return <p className="text-xs text-gray-500 py-2">Cargando...</p>
  if (!data || data.total === 0 || !data.porTema) return <p className="text-xs text-gray-500 py-2">Sin registros de briefings.</p>

  const temasVisibles = temaSeleccionado === "__todos__"
    ? data.porTema
    : data.porTema.filter(t => t.tema === temaSeleccionado)

  const temaActual = temaSeleccionado !== "__todos__"
    ? data.porTema.find(t => t.tema === temaSeleccionado)
    : null

  return (
    <div className="space-y-4">
      {/* Filtro: tema (la semana usa el selector global) */}
      <div className="space-y-2">
        {data.porTema.length > 1 && (
          <select
            className="w-full bg-gray-800 border border-gray-700 text-xs text-white rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
            value={temaSeleccionado}
            onChange={e => setTemaSeleccionado(e.target.value)}
          >
            <option value="__todos__">— Todos los temas —</option>
            {data.porTema.map(t => (
              <option key={t.tema} value={t.tema}>{t.tema}</option>
            ))}
          </select>
        )}
      </div>

      {/* KPI global o del tema seleccionado */}
      <div className="bg-gray-800 rounded-lg p-3 flex justify-between items-center">
        <div>
          <p className="text-xs text-gray-400">Claridad</p>
          <p className={`text-2xl font-bold ${(temaActual?.pctClaro ?? data.pctClaro) >= 80 ? "text-green-400" : (temaActual?.pctClaro ?? data.pctClaro) >= 60 ? "text-yellow-400" : "text-red-400"}`}>
            {temaActual?.pctClaro ?? data.pctClaro}%
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500">{temaActual?.total ?? data.total} respuestas</p>
          {temaActual && (
            <div className="flex gap-2 mt-1 justify-end text-xs">
              <span className="text-green-400">✓ {temaActual.si}</span>
              <span className="text-red-400">✗ {temaActual.no}</span>
              <span className="text-gray-500">— {temaActual.sinRespuesta}</span>
            </div>
          )}
        </div>
      </div>

      {/* Vista todos los temas */}
      {temaSeleccionado === "__todos__" && (
        <div className="space-y-3">
          {temasVisibles.map((t, i) => (
            <button
              key={i}
              className="w-full bg-gray-800 rounded-lg p-3 text-left hover:border hover:border-gray-600"
              onClick={() => setTemaSeleccionado(t.tema)}
            >
              <p className="text-xs text-white mb-2 line-clamp-1">{t.tema}</p>
              <div className="flex gap-2 items-center mb-1">
                <div className="flex-1 bg-gray-700 rounded-full h-1.5">
                  <div className="h-1.5 rounded-full bg-green-500" style={{ width: `${t.pctClaro}%` }} />
                </div>
                <span className={`text-xs w-8 text-right ${t.pctClaro >= 80 ? "text-green-400" : t.pctClaro >= 60 ? "text-yellow-400" : "text-red-400"}`}>
                  {t.pctClaro}%
                </span>
              </div>
              <div className="flex gap-3 text-xs text-gray-500">
                <span className="text-green-400">✓ {t.si}</span>
                <span className="text-red-400">✗ {t.no}</span>
                <span>— {t.sinRespuesta}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Vista tema específico — detalle de agentes */}
      {temaActual && (
        <div className="space-y-3">
          {temaActual.detalle.si.length > 0 && (
            <div>
              <p className="text-xs text-green-400 mb-1">✓ Claro ({temaActual.detalle.si.length})</p>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {temaActual.detalle.si.map((n, i) => (
                  <p key={i} className="text-xs text-gray-300 truncate">{n.split(" ").slice(0, 3).join(" ")}</p>
                ))}
              </div>
            </div>
          )}
          {temaActual.detalle.no.length > 0 && (
            <div>
              <p className="text-xs text-red-400 mb-1">✗ No claro ({temaActual.detalle.no.length})</p>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {temaActual.detalle.no.map((n, i) => (
                  <p key={i} className="text-xs text-gray-300 truncate">{n.split(" ").slice(0, 3).join(" ")}</p>
                ))}
              </div>
            </div>
          )}
          {temaActual.detalle.sinRespuesta.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-1">— Sin respuesta ({temaActual.detalle.sinRespuesta.length})</p>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {temaActual.detalle.sinRespuesta.map((n, i) => (
                  <p key={i} className="text-xs text-gray-400 truncate">{n.split(" ").slice(0, 3).join(" ")}</p>
                ))}
              </div>
            </div>
          )}
          <button
            className="text-xs text-gray-500 hover:text-white"
            onClick={() => setTemaSeleccionado("__todos__")}
          >
            ← Volver a todos los temas
          </button>
        </div>
      )}
    </div>
  )
}



