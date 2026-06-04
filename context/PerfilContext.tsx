"use client"

import { createContext, useContext } from "react"
import type { PerfilUsuario } from "@/lib/jerarquia"

interface PerfilContextValue {
  perfil: PerfilUsuario | null
  emailOverride?: string   // usado en preview para simular otro usuario
  teamEmail?: string       // usado por coaches para ver el equipo de un coordinador
}

const PerfilContext = createContext<PerfilContextValue>({ perfil: null })

export function PerfilProvider({
  children,
  perfil,
  emailOverride,
  teamEmail,
}: {
  children: React.ReactNode
  perfil: PerfilUsuario | null
  emailOverride?: string
  teamEmail?: string
}) {
  return (
    <PerfilContext.Provider value={{ perfil, emailOverride, teamEmail }}>
      {children}
    </PerfilContext.Provider>
  )
}

export function usePerfilContext() {
  return useContext(PerfilContext)
}
