import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import { authOptions } from "@/lib/authOptions"
import { obtenerPerfil } from "@/lib/jerarquia"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken || !session?.user?.email) {
    return NextResponse.json({ error: "No autorizado — vuelve a iniciar sesión" }, { status: 401 })
  }

  try {
    const perfil = await obtenerPerfil(session.accessToken, session.user.email)
    if (!perfil) {
      return NextResponse.json(
        { error: `Usuario ${session.user.email} no encontrado en la base de datos` },
        { status: 404 }
      )
    }
    return NextResponse.json(perfil)
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error desconocido"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
