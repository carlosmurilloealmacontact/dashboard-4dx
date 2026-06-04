"use client"

import { useEffect, useState } from "react"
import { usePerfilContext } from "@/context/PerfilContext"
import { useModuloUrl } from "@/hooks/useModuloUrl"

interface Registro {
  fecha: string
  semana: string
  cumple: string
  cdr: string
  foco: string
}

interface Data {
  registros: Registro[]
  semanas: string[]
  resumen: {
    totalDias: number
    diasCumplidos: number
    pctCumplimiento: number
    ultimoCDR: string | null
  }
}

function parseFecha(f: string): Date | null {
  if (!f) return null
  const partes = f.split("/")
  if (partes.length !== 3) return null
  const [d, m, y] = partes
  return new Date(Number(y), Number(m) - 1, Number(d))
}

function esFinDeSemana(f: string): boolean {
  const fecha = parseFecha(f)
  if (!fecha) return false
  return fecha.getDay() === 0 || fecha.getDay() === 6
}

function formatCDR(valor: string | null): string {
  if (!valor) return "—"
  const n = parseFloat(valor)
  if (isNaN(n)) return "—"
  return n <= 1 ? `${Math.round(n * 100)}%` : `${Math.round(n)}%`
}

function colorCDR(valor: string | null): string {
  if (!valor) return "text-gray-500"
  const n = parseFloat(valor)
  const pct = n <= 1 ? n * 100 : n
  if (pct >= 80) return "text-green-400"
  if (pct >= 60) return "text-yellow-400"
  return "text-red-400"
}

export default function SeguimientoCoach() {
  const [data, setData] = useState<Data | null>(null)
  const [cargando, setCargando] = useState(true)
  const [semanaSeleccionada, setSemanaSeleccionada] = useState("")
  const url = useModuloUrl("/api/modulos/seguimiento-coach")

  useEffect(() => {
    fetch(url).then(r => r.json()).then(d => {
      setData(d)
      if (d.semanas?.length) setSemanaSeleccionada(String(d.semanas.at(-1)))
    }).finally(() => setCargando(false))
  }, [url])

  if (cargando) return <p className="text-xs text-gray-500 py-2">Cargando...</p>
  if (!data?.resumen || data.resumen.totalDias === 0) return <p className="text-xs text-gray-500 py-2">Sin registros.</p>

  const semanaActiva = semanaSeleccionada || String(data.semanas?.at(-1) ?? "")

  const registrosFiltrados = data.registros.filter(r => {
    if (esFinDeSemana(r.fecha)) return false
    return String(r.semana) === semanaActiva
  })

  const diasCumplidos = registrosFiltrados.filter(r => r.cumple === "1").length
  const totalDias = registrosFiltrados.length
  const pct = totalDias > 0 ? Math.round((diasCumplidos / totalDias) * 100) : 0
  const cdrSemana = registrosFiltrados.find(r => r.cdr && r.cdr !== "0")?.cdr ?? null

  // Foco más usado
  const conteo: Record<string, number> = {}
  registrosFiltrados.forEach(r => { if (r.foco) conteo[r.foco] = (conteo[r.foco] ?? 0) + 1 })
  const focoTop = Object.entries(conteo).sort((a, b) => b[1] - a[1])[0]

  return (
    <div className="space-y-4">
      {/* Selector semana */}
      {data.semanas?.length > 0 && (
        <select
          className="w-full bg-gray-800 border border-gray-700 text-xs text-white rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
          value={semanaActiva}
          onChange={e => setSemanaSeleccionada(e.target.value)}
        >
          {data.semanas.map(s => <option key={s} value={s}>Semana {s}</option>)}
        </select>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gray-800 rounded-lg p-3">
          <p className="text-xs text-gray-400">Cumplimiento Diálogo</p>
          <p className={`text-2xl font-bold ${pct >= 80 ? "text-green-400" : pct >= 60 ? "text-yellow-400" : "text-red-400"}`}>
            {pct}%
          </p>
          <p className="text-xs text-gray-500">{diasCumplidos} de {totalDias} días</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-3">
          <p className="text-xs text-gray-400">CDR Semanal</p>
          <p className={`text-2xl font-bold ${colorCDR(cdrSemana)}`}>{formatCDR(cdrSemana)}</p>
          <p className="text-xs text-gray-500">semana {semanaActiva}</p>
        </div>
      </div>

      {/* Barras Lun-Vie */}
      <div>
        <p className="text-xs text-gray-500 mb-2">Lun — Vie</p>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((numDia, i) => {
            const etiquetas = ["Lun", "Mar", "Mié", "Jue", "Vie"]
            const r = registrosFiltrados.find(reg => parseFecha(reg.fecha)?.getDay() === numDia)
            const color = !r ? "bg-gray-700" : r.cumple === "1" ? "bg-green-500" : "bg-red-500"
            return (
              <div key={numDia} className="flex-1 flex flex-col items-center gap-1">
                <div className={`w-full h-6 rounded ${color}`} />
                <span className="text-xs text-gray-600">{etiquetas[i]}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Foco más usado */}
      {focoTop && (
        <div className="bg-gray-800 rounded-lg p-3">
          <p className="text-xs text-gray-400 mb-1">Foco más usado</p>
          <p className="text-sm text-white">{focoTop[0]}</p>
          <p className="text-xs text-gray-500">{focoTop[1]} {focoTop[1] === 1 ? "vez" : "veces"} esta semana</p>
        </div>
      )}
    </div>
  )
}



