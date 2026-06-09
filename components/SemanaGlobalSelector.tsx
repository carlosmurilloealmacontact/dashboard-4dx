"use client"

import { useSemanaGlobal } from "@/context/SemanaGlobalContext"

/**
 * Selector único de semana. Se coloca junto a los filtros (Rol/Servicio/Persona).
 * No muestra nada hasta que algún módulo haya reportado semanas.
 */
export default function SemanaGlobalSelector({ light = false }: { light?: boolean }) {
  const { semanaGlobal, setSemanaGlobal, semanasDisponibles } = useSemanaGlobal()

  if (semanasDisponibles.length === 0) return null

  const cls = light
    ? "bg-white border border-gray-300 text-xs text-gray-900 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
    : "bg-gray-800 border border-gray-700 text-xs text-white rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"

  return (
    <div className="flex items-center gap-2">
      <span className={`text-xs ${light ? "text-gray-600" : "text-gray-400"}`}>Semana:</span>
      <select
        className={cls}
        value={semanaGlobal ?? ""}
        onChange={e => setSemanaGlobal(e.target.value)}
      >
        {semanasDisponibles.map(s => (
          <option key={s} value={s}>Semana {s}</option>
        ))}
      </select>
    </div>
  )
}
