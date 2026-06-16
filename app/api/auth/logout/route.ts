import { NextResponse } from "next/server"

// El logout simplemente devuelve OK
// NextAuth se encargará de limpiar la sesión en el cliente
export async function POST() {
  try {
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error en logout:", error)
    return NextResponse.json({ success: false }, { status: 500 })
  }
}
