import Database from "better-sqlite3"
import path from "path"

// Usar una ruta absoluta para asegurar consistencia
const dbPath = path.join(process.cwd(), "tokens.db")
const db = new Database(dbPath)

// Crear tabla si no existe
db.exec(`
  CREATE TABLE IF NOT EXISTS oauth_tokens (
    email TEXT PRIMARY KEY,
    refreshToken TEXT NOT NULL,
    accessToken TEXT,
    expiresAt INTEGER
  )
`)

/**
 * Guarda el refresh token de un usuario
 */
export function guardarToken(
  email: string,
  refreshToken: string,
  accessToken?: string,
  expiresIn?: number
) {
  const expiresAt = expiresIn ? Date.now() + expiresIn * 1000 : null
  const stmt = db.prepare(
    "INSERT OR REPLACE INTO oauth_tokens (email, refreshToken, accessToken, expiresAt) VALUES (?, ?, ?, ?)"
  )
  stmt.run(email, refreshToken, accessToken || null, expiresAt)
}

/**
 * Obtiene el refresh token guardado de un usuario
 */
export function obtenerToken(email: string): {
  refreshToken: string
  accessToken?: string
  expiresAt?: number
} | null {
  const stmt = db.prepare(
    "SELECT refreshToken, accessToken, expiresAt FROM oauth_tokens WHERE email = ?"
  )
  const row = stmt.get(email) as
    | { refreshToken: string; accessToken: string | null; expiresAt: number | null }
    | undefined
  if (!row) return null
  return {
    refreshToken: row.refreshToken,
    accessToken: row.accessToken || undefined,
    expiresAt: row.expiresAt || undefined,
  }
}

/**
 * Verifica si el access token está expirado
 */
export function estaExpirado(expiresAt?: number): boolean {
  if (!expiresAt) return false
  return Date.now() > expiresAt
}
