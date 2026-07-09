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
  // true = el usuario genuinamente no está registrado (404). false = no se
  // pudo cargar la base de personas por un problema transitorio (ej. cuota
  // de Sheets) — se ve igual desde el resultado ("sin perfil") pero NO es lo
  // mismo, y mostrar el mismo aviso confunde: la solución de un 404 es
  // corregir la hoja; la de un fallo transitorio es simplemente recargar.
  const [noEncontrado, setNoEncontrado] = useState(false)

  useEffect(() => {
    if (status === "loading") return

    if (status === "unauthenticated") {
      router.push("/login")
      return
    }

    if (status !== "authenticated") return

    fetch("/api/jerarquia")
      .then(async res => {
        const data = await res.json()
        if (data.error) {
          setError(data.error)
          setNoEncontrado(res.status === 404)
        } else {
          setPerfil(data)
        }
      })
      .catch(() => { setError("Error al cargar el perfil"); setNoEncontrado(false) })
      .finally(() => setCargando(false))
  }, [status, router])

  return { perfil, cargando, error, noEncontrado, session }
}
