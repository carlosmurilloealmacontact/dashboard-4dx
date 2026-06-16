"use client"

import { useState, useEffect } from "react"
import ModuloCard from "@/components/ModuloCard"
import CoachTeamView from "@/components/CoachTeamView"
import { MODULOS_POR_ROL } from "@/lib/roles"
import type { PerfilUsuario } from "@/lib/jerarquia"
import { PerfilProvider } from "@/context/PerfilContext"
import { SemanaGlobalProvider } from "@/context/SemanaGlobalContext"
import SemanaGlobalSelector from "@/components/SemanaGlobalSelector"
import { modulosPorIds } from "@/lib/modulos"

const USUARIOS_DEMO = [
  { nombre: "MYRYAM LUCERO CASTRO LINARES", email: "lucero.castro@latam.com", rol: "coach" },
  { nombre: "HERNANDEZ URREGO CRISTIAN ENRIQUE", email: "cristianenriquehernandez.almacontact@outsourcing-account.com", rol: "coordinador" },
  { nombre: "CARDONA BARRAGAN CATALINA", email: "catalinacarona.almacontact@outsourcing-account.com", rol: "supervisor" },
]

export default function RealDemoPage() {
  const [usuarioSeleccionado, setUsuarioSeleccionado] = useState(USUARIOS_DEMO[0].email)
  const [perfil, setPerfil] = useState<PerfilUsuario | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    let activo = true
    fetch(`/api/jerarquia/test?email=${encodeURIComponent(usuarioSeleccionado)}`)
      .then(res => res.json())
      .then(data => {
        if (!activo) return
        setError("")
        if (data.error) {
          setError(data.error)
          setPerfil(null)
        } else {
          setPerfil(data)
        }
      })
      .catch(err => {
        if (!activo) return
        setError(String(err))
        setPerfil(null)
      })
      .finally(() => {
        if (activo) setCargando(false)
      })
    return () => { activo = false }
  }, [usuarioSeleccionado])

  const modulosVisibles = perfil
    ? modulosPorIds(MODULOS_POR_ROL[perfil.rol as keyof typeof MODULOS_POR_ROL] ?? [])
    : []

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-200 px-6 py-4 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Dashboard 4DX - Vista Real</h1>
          <p className="text-xs text-gray-600">Datos cargados desde Google Sheets</p>
        </div>
        <select
          value={usuarioSeleccionado}
          onChange={e => {
            setCargando(true)
            setError("")
            setUsuarioSeleccionado(e.target.value)
          }}
          className="bg-white border border-gray-300 text-xs text-gray-900 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
        >
          {USUARIOS_DEMO.map(u => (
            <option key={u.email} value={u.email}>
              {u.nombre.split(" ").slice(0, 3).join(" ")} ({u.rol})
            </option>
          ))}
        </select>
      </header>

      <main className="px-6 py-8 max-w-7xl mx-auto">
        {cargando && (
          <div className="flex items-center justify-center py-12">
            <p className="text-gray-600">Cargando perfil...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-700 text-sm">Error: {error}</p>
          </div>
        )}

        {perfil && !cargando && (
          <>
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900">Hola, {perfil.persona.nombre.split(" ")[0]} 👋</h2>
              <div className="flex gap-2 mt-2 flex-wrap">
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full capitalize">
                  {perfil.rol}
                </span>
                <span className="text-xs text-gray-600">{perfil.persona.cargo}</span>
                <span className="text-xs text-gray-600">{perfil.persona.servicio}</span>
                {perfil.equipo.length > 0 && (
                  <span className="text-xs text-gray-600">{perfil.equipo.length} personas en equipo</span>
                )}
              </div>
              <p className="text-gray-600 text-sm mt-2">
                {perfil.equipo.length > 0
                  ? `Tu equipo tiene ${perfil.equipo.length} persona${perfil.equipo.length !== 1 ? "s" : ""} — aquí tienes su resumen.`
                  : "Aquí tienes el resumen de tu panel."}
              </p>
            </div>

            {modulosVisibles.length > 0 ? (
              // emailOverride hace que useModuloUrl agregue ?email=... a todas las llamadas de módulos
              <PerfilProvider perfil={perfil} emailOverride={usuarioSeleccionado}>
                <SemanaGlobalProvider>
                  <div className="mb-4 flex justify-end">
                    <SemanaGlobalSelector light />
                  </div>
                  <div className="flex flex-col gap-2 mb-8">
                    {modulosVisibles.map(modulo => (
                      <ModuloCard
                        key={modulo.id}
                        {...modulo}
                        equipo={perfil.equipo}
                        rol={perfil.rol}
                      />
                    ))}
                  </div>

                  {/* Vista de seguimiento de equipo para coaches */}
                  {perfil.rol === "coach" && (
                    <CoachTeamView perfilCoach={perfil} />
                  )}
                </SemanaGlobalProvider>
              </PerfilProvider>
            ) : (
              <p className="text-gray-600 text-sm">No hay módulos configurados para este rol.</p>
            )}
          </>
        )}
      </main>

      <footer className="border-t border-gray-200 mt-12 px-6 py-4 text-center">
        <p className="text-xs text-gray-600">
          Datos cargados en tiempo real desde Google Sheets. Estos son los usuarios que definiste para demostración.
        </p>
      </footer>
    </div>
  )
}
