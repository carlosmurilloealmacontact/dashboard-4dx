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
}

const COLOR_METRIC: Record<string, string> = {
  green:  "text-green-400",
  yellow: "text-yellow-400",
  red:    "text-red-400",
  blue:   "text-blue-400",
  white:  "text-white",
}

interface ModuloCardProps {
  id: string
  titulo: string
  icono: string
  descripcion: string
  equipo: Persona[]
  rol: RolNormalizado
}

function CardInner({ id, titulo, icono, descripcion, equipo }: ModuloCardProps) {
  const [expandido, setExpandido] = useState(false)
  const Componente = COMPONENTES[id]
  const { metric } = useModuloMetric()

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden transition-all hover:border-gray-700">
      <button
        className="w-full p-5 text-left flex items-start justify-between gap-3"
        onClick={() => setExpandido(!expandido)}
      >
        <div className="flex items-start gap-3">
          <span className="text-2xl">{icono}</span>
          <div>
            <p className="text-sm font-semibold text-white">{titulo}</p>
            <p className="text-xs text-gray-500 mt-0.5">{descripcion}</p>
          </div>
        </div>
        <span className="text-gray-600 text-xs mt-1">{expandido ? "▲" : "▼"}</span>
      </button>

      {/* KPI visible sin expandir */}
      <div className="px-5 pb-3 flex items-center gap-4 border-t border-gray-800 pt-3">
        {metric ? (
          <>
            <div>
              <p className="text-xs text-gray-500">Esta semana</p>
              <p className={`text-lg font-bold ${COLOR_METRIC[metric.color ?? "white"]}`}>
                {metric.valor}
              </p>
            </div>
            {metric.alerta !== undefined && metric.alerta > 0 && (
              <div>
                <p className="text-xs text-gray-500">Alertas</p>
                <span className="text-xs bg-red-900 text-red-300 px-2 py-0.5 rounded-full font-medium">
                  {metric.alerta}
                </span>
              </div>
            )}
          </>
        ) : (
          <>
            <div>
              <p className="text-xs text-gray-500">Esta semana</p>
              <p className="text-lg font-bold text-gray-600">—</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Estado</p>
              <span className={`text-xs px-2 py-0.5 rounded-full ${Componente ? "bg-blue-900 text-blue-300" : "bg-gray-800 text-gray-400"}`}>
                {Componente ? "Cargando..." : "Sin datos"}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Componente siempre montado para que cargue datos y publique KPI */}
      {Componente && (
        <div className={expandido ? "px-5 pb-5 border-t border-gray-800 pt-4" : "hidden"}>
          <Suspense fallback={<p className="text-xs text-gray-500 py-2">Cargando...</p>}>
            <Componente />
          </Suspense>
        </div>
      )}

      {/* Panel expandible sin componente */}
      {expandido && !Componente && (
        <div className="px-5 pb-5 border-t border-gray-800 pt-4">
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {equipo.length > 0 ? (
              equipo.map(p => (
                <div key={p.cedula} className="flex items-center justify-between py-1">
                  <span className="text-xs text-gray-300">{p.nombre}</span>
                  <span className="text-xs text-gray-600">{p.servicio}</span>
                </div>
              ))
            ) : (
              <p className="text-xs text-gray-500 text-center py-4">Próximamente.</p>
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
