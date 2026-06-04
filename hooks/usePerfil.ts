"use client"

import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import type { PerfilUsuario } from "@/lib/jerarquia"

export function usePerfil() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [perfil, setPerfil] = useState<PerfilUsuario | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (status === "loading") return

    if (status === "unauthenticated") {
      router.push("/login")
      return
    }

    if (status !== "authenticated") return

    fetch("/api/jerarquia")
      .then(res => res.json())
      .then(data => {
        if (data.error) setError(data.error)
        else setPerfil(data)
      })
      .catch(() => setError("Error al cargar el perfil"))
      .finally(() => setCargando(false))
  }, [status, router])

  return { perfil, cargando, error, session }
}
