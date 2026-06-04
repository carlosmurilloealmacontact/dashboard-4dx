import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"
import { authOptions } from "@/lib/authOptions"
import { obtenerPerfil } from "@/lib/jerarquia"

// Ruta temporal para probar perfiles sin necesidad de loguearse con esa cuenta
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const email = req.nextUrl.searchParams.get("email")
  if (!email) {
    return NextResponse.json({ error: "Falta parámetro email" }, { status: 400 })
  }

  try {
    const perfil = await obtenerPerfil(session.accessToken, email)
    if (!perfil) {
      return NextResponse.json({ error: `No encontrado: ${email}` }, { status: 404 })
    }
    return NextResponse.json(perfil)
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
