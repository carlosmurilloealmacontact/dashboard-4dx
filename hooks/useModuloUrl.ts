"use client"

import { usePerfilContext } from "@/context/PerfilContext"

/**
 * Devuelve la URL correcta para un endpoint de módulo según el contexto:
 * - Si hay teamEmail (coach viendo un equipo): usa ese email
 * - Si hay emailOverride (preview): usa ese email
 * - Si no hay nada: llama al endpoint sin parámetro (usa la sesión del usuario)
 */
export function useModuloUrl(endpoint: string): string {
  const { emailOverride, teamEmail } = usePerfilContext()
  const email = teamEmail || emailOverride
  return email ? `${endpoint}?email=${email}` : endpoint
}
