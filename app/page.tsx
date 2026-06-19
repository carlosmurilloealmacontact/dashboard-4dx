"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { signOut } from "next-auth/react"
import ModuloCard from "@/components/ModuloCard"
import CoachTeamView from "@/components/CoachTeamView"
import AdminView from "@/components/AdminView"
import InformeIA from "@/components/InformeIA"
import { SemanaGlobalProvider } from "@/context/SemanaGlobalContext"
import SemanaGlobalSelector from "@/components/SemanaGlobalSelector"
import DataTimestamp from "@/components/DataTimestamp"
import { usePerfil } from "@/hooks/usePerfil"
import { MODULOS_POR_ROL } from "@/lib/roles"
import { MODULOS_COORDINADOR_COACH, TODOS_MODULOS, modulosEnOrden, modulosPorIds } from "@/lib/modulos"

const ETIQUETAS_ROL: Record<string, string> = {
  gerente: "Gerente",
  jefatura: "Jefatura",
  coordinador: "Coordinador",
  coach: "Coach",
  supervisor: "Supervisor",
  asesor: "Asesor",
  desconocido: "Usuario",
}

export default function DashboardPage() {
  const { perfil, cargando, error, session } = usePerfil()
  const router = useRouter()

  useEffect(() => {
    if (!session && !cargando) router.push("/login")
  }, [session, cargando, router])

  if (cargando) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="text-gray-400 text-sm">Cargando tu panel...</div>
      </div>
    )
  }

  if (!session) return null

  // Coordinador con cargo "Coordinador Coach": ve los mismos módulos que un
  // coach (su equipo de coaches agrupado) y conserva los filtros de coordinador/servicio.
  const esCoordinadorCoach = perfil?.rol === "coordinador"
    && (perfil.persona.cargo ?? "").toLowerCase().includes("coach")

  // Módulos visibles según el rol
  const idsVisibles = perfil
    ? new Set(MODULOS_POR_ROL[perfil.rol] ?? [])
    : new Set(TODOS_MODULOS.map(m => m.id))

  const modulosVisibles = perfil
    ? esCoordinadorCoach
      ? modulosEnOrden(MODULOS_COORDINADOR_COACH)
      : modulosPorIds(idsVisibles)
    : TODOS_MODULOS

  // Formato en la hoja: "APELLIDO1 APELLIDO2 NOMBRE1 [NOMBRE2]"
  // Tomamos las palabras desde la posición 2 (los nombres de pila).
  const extraerNombres = (n: string) => {
    const partes = n.trim().split(/\s+/)
    const nombres = partes.length >= 3 ? partes.slice(2) : partes.slice(0, 1)
    return nombres.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(" ")
  }
  const nombreCorto = perfil
    ? extraerNombres(perfil.persona.nombre)
    : (session.user?.name?.split(" ")[0] ?? "Usuario")
  const etiquetaRol = perfil ? ETIQUETAS_ROL[perfil.rol] : ""
  const totalEquipo = perfil?.equipo.length ?? 0

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Dashboard 4DX</h1>
          <p className="text-xs text-gray-600">Almaexperience</p>
        </div>
        <div className="flex items-center gap-4">
          <DataTimestamp />
          <div className="text-right">
            <p className="text-sm text-gray-900">
              {perfil
                ? perfil.persona.nombre.split(/\s+/).map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(" ")
                : session.user?.name}
            </p>
            <div className="flex items-center gap-2 justify-end">
              {etiquetaRol && (
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                  {etiquetaRol}
                </span>
              )}
              {perfil?.persona.servicio && (
                <span className="text-xs text-gray-600">{perfil.persona.servicio}</span>
              )}
            </div>
          </div>
          <button
            onClick={async () => {
              // Primero borra el token de la BD
              await fetch("/api/auth/logout", { method: "POST" })
              // Luego borra la sesión
              await signOut({ callbackUrl: "/login" })
            }}
            className="text-xs text-gray-600 hover:text-gray-900 transition"
          >
            Salir
          </button>
        </div>
      </header>

      <main className="px-6 py-8 max-w-7xl mx-auto">
        {/* Vista administrativa para admins - PRIMERO */}
        {perfil?.rol?.toLowerCase() === "admin" ? (
          <AdminView perfilAdmin={perfil} />
        ) : (
          <SemanaGlobalProvider>
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900">Hola, {nombreCorto} 👋</h2>
              {error ? (
                <p className="text-yellow-600 text-sm mt-1">
                  ⚠️ Tu usuario no está en la base de datos — contacta a tu coordinador.
                </p>
              ) : (
                <p className="text-gray-600 text-sm mt-1">
                  {totalEquipo > 0
                    ? `Tu equipo tiene ${totalEquipo} persona${totalEquipo !== 1 ? "s" : ""} — aquí tienes su resumen.`
                    : "Aquí tienes el resumen de tu panel."}
                </p>
              )}
            </div>

            {modulosVisibles.length > 0 ? (
              <>
                <div className="mb-4 flex justify-end">
                  <SemanaGlobalSelector light />
                </div>
                <div className="flex flex-col gap-2">
                  {modulosVisibles.map((modulo) => (
                    <ModuloCard
                      key={modulo.id}
                      {...modulo}
                      equipo={perfil?.equipo ?? []}
                      rol={perfil?.rol ?? "desconocido"}
                    />
                  ))}
                </div>
              </>
            ) : (
              <p className="text-gray-600 text-sm">No hay módulos configurados para tu rol.</p>
            )}

            {/* Vista de seguimiento para coaches (y coordinadores con rol híbrido de coach) */}
            {perfil && (perfil.rol === "coach" || esCoordinadorCoach) ? (
              <CoachTeamView perfilCoach={perfil} />
            ) : null}

            {/* Informe de cumplimiento generado con IA, para coordinadores y jefaturas */}
            {perfil && ["coordinador", "jefatura", "gerente"].includes(perfil.rol) && (
              <InformeIA supervisores={perfil.supervisores} />
            )}

            <div className="mt-8 text-center text-xs text-gray-500">
              [Fin de página - rol: {perfil?.rol?.toLowerCase()}]
            </div>
          </SemanaGlobalProvider>
        )}
      </main>
    </div>
  )
}
