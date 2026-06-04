import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import { authOptions } from "@/lib/authOptions"
import { getSheetData } from "@/lib/sheets"

const SHEET_ID = "1veAlRJlVrJ2MRtoYNi3aJ_NX97sBFTgcww0V0jv6_Q0"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  // Leer solo la primera fila con todas las columnas
  const rows = await getSheetData(session.accessToken, SHEET_ID, "A1:AZ1")
  const headers = rows[0] ?? []

  // Mostrar cada columna con su índice y letra
  const mapa = headers.map((h, i) => {
    const letra = i < 26
      ? String.fromCharCode(65 + i)
      : "A" + String.fromCharCode(65 + (i - 26))
    return `${letra}${i + 1}: ${h}`
  })

  return NextResponse.json({ totalColumnas: headers.length, columnas: mapa })
}
