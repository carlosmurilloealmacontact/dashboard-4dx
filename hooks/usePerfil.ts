"use client"

import { useSession } from "next-auth/react"
import { useEffect, useState } from "react"
import type { PerfilUsuario } from "@/lib/jerarquia"

export function usePerfil() {
  const { data: session, status } = useSession()
  const [perfil, setPerfil] = useState<PerfilUsuario | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (status !== "authenticated") return

    fetch("/api/jerarquia")
      .then(res => res.json())
      .then(data => {
        if (data.error) setError(data.error)
        else setPerfil(data)
      })
      .catch(() => setError("Error al cargar el perfil"))
      .finally(() => setCargando(false))
  }, [status])

  return { perfil, cargando, error, session }
}
