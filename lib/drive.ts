import { google } from "googleapis"

export async function getDriveClient(accessToken: string) {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  )
  auth.setCredentials({ access_token: accessToken })
  return google.drive({ version: "v3", auth })
}

// Carpeta raíz "Agenda" (Compartidos conmigo > AMC > Agenda), con una
// subcarpeta "Equipo {Coordinador}" por cada coordinador, y dentro un
// archivo por cada líder (nombre en formato "Apellidos Nombres").
const CARPETA_RAIZ_AGENDA = "1LqXqtOOydr-qB4KTWWp0t8SCC_rivZjl"

const DIAS_ALERTA_AGENDA = 7

export interface AgendaLiderArchivo {
  archivo: string
  ultimaModificacion: string // ISO yyyy-mm-dd
  diasDesdeModificacion: number
  alerta: boolean // true si diasDesdeModificacion > 7
}

function normTokens(s: string): string[] {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
}

// Distancia de edición Damerau-Levenshtein (incluye transposición de
// caracteres adyacentes como 1 sola edición, ej. "john" -> "jhon").
function distanciaEdicion(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + costo,
      )
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1)
      }
    }
  }
  return dp[m][n]
}

// Dos palabras "coinciden" si son iguales, o si difieren por a lo sumo 1
// edición y tienen 4+ letras (cubre variantes de ortografía como "jhon"/"john").
function palabrasCoinciden(a: string, b: string): boolean {
  if (a === b) return true
  if (a.length < 4 || b.length < 4) return false
  return distanciaEdicion(a, b) <= 1
}

// Coincide si el conjunto de palabras más corto está completamente contenido
// en el más largo (sin importar el orden, tolerando variantes de ortografía).
// Se exige al menos 2 palabras en común para evitar falsos positivos con un
// solo apellido compartido. Esto permite que un nombre con más partes (ej.
// "Rojas Leguizamo Andres Felipe" en la jerarquía) coincida con una versión
// abreviada en Drive (ej. "Equipo Felipe Rojas"), y viceversa.
export function nombresCoinciden(nombreA: string, nombreB: string): boolean {
  const tokensA = normTokens(nombreA)
  const tokensB = normTokens(nombreB)
  if (tokensA.length === 0 || tokensB.length === 0) return false
  const [menor, mayor] = tokensA.length <= tokensB.length ? [tokensA, tokensB] : [tokensB, tokensA]
  return menor.length >= 2 && menor.every(t => mayor.some(m => palabrasCoinciden(t, m)))
}

/**
 * Para cada supervisor del equipo, busca su archivo de agenda dentro de la
 * carpeta "Equipo {nombreCoord}" del Drive de Agenda del Líder, y devuelve
 * la fecha de última modificación + si está vencido (>7 días sin actualizar).
 * Si la carpeta del coordinador o el Drive no son accesibles, devuelve un
 * mapa vacío (sin lanzar error, para no romper el resto del informe).
 */
export async function obtenerAgendaLider(
  accessToken: string,
  nombreCoord: string,
  supervisoresEquipo: string[],
): Promise<Map<string, AgendaLiderArchivo>> {
  const resultado = new Map<string, AgendaLiderArchivo>()

  try {
    const drive = await getDriveClient(accessToken)

    const carpetasRes = await drive.files.list({
      q: `'${CARPETA_RAIZ_AGENDA}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "files(id, name)",
      pageSize: 1000,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    })
    const carpetas = carpetasRes.data.files ?? []

    const carpetaCoord = carpetas.find(c => {
      const nombreCarpeta = (c.name ?? "").replace(/^equipo\s+/i, "")
      return nombresCoinciden(nombreCoord, nombreCarpeta)
    })
    if (!carpetaCoord?.id) return resultado

    const archivosRes = await drive.files.list({
      q: `'${carpetaCoord.id}' in parents and trashed = false`,
      fields: "files(id, name, modifiedTime)",
      pageSize: 1000,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    })
    const archivos = archivosRes.data.files ?? []

    const hoy = new Date()
    supervisoresEquipo.forEach(sup => {
      const archivo = archivos.find(a => nombresCoinciden(sup, a.name ?? ""))
      if (!archivo?.modifiedTime) return
      const fecha = new Date(archivo.modifiedTime)
      const dias = Math.floor((hoy.getTime() - fecha.getTime()) / (1000 * 60 * 60 * 24))
      resultado.set(sup, {
        archivo: archivo.name ?? "",
        ultimaModificacion: fecha.toISOString().slice(0, 10),
        diasDesdeModificacion: dias,
        alerta: dias > DIAS_ALERTA_AGENDA,
      })
    })
  } catch (error: unknown) {
    console.error("[obtenerAgendaLider] Error consultando Drive:", error instanceof Error ? error.message : error)
  }

  return resultado
}
