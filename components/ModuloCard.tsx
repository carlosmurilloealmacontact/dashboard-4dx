"use client"

import { useState, lazy, Suspense } from "react"
import type { Persona, RolNormalizado } from "@/lib/jerarquia"
import { MetricProvider, useModuloMetric } from "@/context/ModuloMetricContext"

const COMPONENTES: Partial<Record<string, React.LazyExoticComponent<() => React.ReactElement>>> = {
  practicas_lideres:    lazy(() => import("./modulos/PracticasLideres")),
  practicas_coach:      lazy(() => import("./modulos/SeguimientoCoach")),
  adherencia:           lazy(() => import("./modulos/Adherencia4DX")),
  adherencia_pca:       lazy(() => import("./modulos/AdherenciaPCA")),
  confirmaciones_rol:   lazy(() => import("./modulos/ConfirmacionesRol")),
  resolutividad:        lazy(() => import("./modulos/Resolutividad")),
  compromisos:          lazy(() => import("./modulos/Compromisos")),
  quiz:                 lazy(() => import("./modulos/QuizSemanal")),
  feedback:             lazy(() => import("./modulos/Feedback")),
  estoy_enterado:       lazy(() => import("./modulos/EstoyEnterado")),
  pausas_4dx:           lazy(() => import("./modulos/Pausas4DX")),
  agenda_lider:         lazy(() => import("./modulos/AgendaLider")),
}

const COLOR_METRIC: Record<string, string> = {
  green:  "text-green-600",
  yellow: "text-amber-500",
  red:    "text-red-500",
  blue:   "text-blue-500",
  white:  "text-gray-500",
}

interface ModuloCardProps {
  id: string
  titulo: string
  icono: string
  descripcion: string
  equipo: Persona[]
  rol: RolNormalizado
  servicio?: string
}

function CardInner({ id, titulo, icono, descripcion, equipo, servicio }: ModuloCardProps) {
  const [expandido, setExpandido] = useState(false)
  const Componente = COMPONENTES[id]
  const { metric } = useModuloMetric()

  return (
    <div className={`bg-white border rounded-xl overflow-hidden transition-colors ${expandido ? "border-gray-300" : "border-gray-200 hover:border-gray-300"}`}>
      {/* ── Fila principal (siempre visible) ─────────────────────── */}
      <button
        className="w-full px-4 py-3.5 text-left flex items-center gap-3 hover:bg-gray-50 transition-colors"
        onClick={() => setExpandido(!expandido)}
      >
        {/* Ícono */}
        <span className="text-xl w-7 text-center flex-shrink-0 select-none">{icono}</span>

        {/* Título + descripción */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 leading-tight truncate">{titulo}</p>
          <p className="text-xs text-gray-400 mt-0.5 truncate">{descripcion}</p>
        </div>

        {/* Métrica de la semana (inline) */}
        <div className="flex items-center gap-2 flex-shrink-0 text-right">
          {metric ? (
            <>
              <span className={`text-sm font-bold tabular-nums ${COLOR_METRIC[metric.color ?? "white"]}`}>
                {metric.valor}
              </span>
              {metric.alerta !== undefined && metric.alerta > 0 && (
                <span className="text-xs bg-red-50 text-red-500 border border-red-200 px-1.5 py-0.5 rounded-full font-semibold leading-none">
                  ⚠&nbsp;{metric.alerta}
                </span>
              )}
            </>
          ) : Componente ? (
            <span className="text-xs text-gray-300 tracking-widest">···</span>
          ) : (
            <span className="text-xs text-gray-300">—</span>
          )}
        </div>

        {/* Chevron */}
        <svg
          className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform duration-200 ${expandido ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* ── Contenido del módulo ──────────────────────────────────── */}
      {Componente && (
        <div className={expandido ? "border-t border-gray-100 px-4 pb-5 pt-4" : "hidden"}>
          <Suspense fallback={<p className="text-xs text-gray-400 py-3 text-center">Cargando...</p>}>
            <Componente />
          </Suspense>
        </div>
      )}

      {expandido && !Componente && (
        <div className="border-t border-gray-100 px-4 pb-5 pt-4">
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {equipo.length > 0 ? (
              equipo.map(p => (
                <div key={p.cedula} className="flex items-center justify-between py-1">
                  <span className="text-xs text-gray-700">{p.nombre}</span>
                  <span className="text-xs text-gray-400">{p.servicio}</span>
                </div>
              ))
            ) : (
              <p className="text-xs text-gray-400 text-center py-4">Próximamente.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function ModuloCard(props: ModuloCardProps) {
  return (
    <MetricProvider>
      <CardInner {...props} />
    </MetricProvider>
  )
}
