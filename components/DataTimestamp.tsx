"use client"

import { useEffect, useState } from "react"

export default function DataTimestamp() {
  const [hora, setHora] = useState<string | null>(null)

  useEffect(() => {
    const ahora = new Date()
    const hoy = ahora.toLocaleDateString("es-CO", { day: "numeric", month: "short" })
    const tiempo = ahora.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })
    setHora(`${hoy}, ${tiempo}`)
  }, [])

  if (!hora) return null

  return (
    <span className="text-xs text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full whitespace-nowrap">
      🕐 Datos al: {hora}
    </span>
  )
}
