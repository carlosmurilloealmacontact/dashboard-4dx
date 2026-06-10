"use client"

import { usePerfilContext } from "@/context/PerfilContext"

/**
 * Devuelve la URL correcta para un endpoint de módulo según el contexto:
 * - Si hay teamEmail (coach viendo un equipo): usa ese email
 * - Si hay emailOverride (preview): usa ese email
 * - Si no hay nada: llama al endpoint sin parámetro (usa la sesión del usuario)
 */
export function useModuloUrl(endpoint: string): string {
  const { emailOverride, teamEmail, servicio } = usePerfilContext()
  const email = teamEmail || emailOverride
  const params = new URLSearchParams()
  if (email) params.set("email", email)
  if (servicio) params.set("servicio", servicio)
  const query = params.toString()
  return query ? `${endpoint}?${query}` : endpoint
}
