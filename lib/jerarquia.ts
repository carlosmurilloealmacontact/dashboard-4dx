import { getSheetData } from "@/lib/sheets"

// Fuentes de datos de personas (misma estructura, distintas poblaciones)
const BASES: { id: string; rango: string }[] = [
  { id: "1veAlRJlVrJ2MRtoYNi3aJ_NX97sBFTgcww0V0jv6_Q0", rango: "A:AS" }, // AMX - asesores y supervisores
  { id: "1tmFJQ4EJaUTCbogu11klf7GSzXpzevn7gw3U84Rw3zM",  rango: "Socio!A:AS" }, // LATAM - coaches y líderes
]

export interface Persona {
  cedula: string
  nombre: string
  cargo: string
  servicio: string
  servicio_?: string        // servicio_ para filtrar coordinadores LATAM
  gerencia?: string         // gerencia para filtrar coordinadores
  jefeInmediato: string
  coordinador: string
  email: string
  emailCorporativo: string  // usuario_gestor_4 (col AJ)
  usuarioLatam: string      // usuario_gestor_1 (col AD)
  estado: string
  area: string
}

export type RolNormalizado =
  | "gerente"
  | "jefatura"
  | "coordinador"
  | "coach"
  | "supervisor"
  | "asesor"
  | "desconocido"

export function normalizarCargo(cargo: string): RolNormalizado {
  const c = cargo.toLowerCase()
  if (c.includes("gerente") || c.includes("director")) return "gerente"
  if (c.includes("jefatura") || c.includes("jefe")) return "jefatura"
  if (c.includes("coordinador")) return "coordinador"
  if (c.includes("coach")) return "coach"
  if (c.includes("supervisor") || c.includes("lider") || c.includes("líder")) return "supervisor"
  if (c.includes("asesor") || c.includes("agente") || c.includes("aprendiz")) return "asesor"
  return "desconocido"
}

function parsearFilas(rows: string[][]): Persona[] {
  if (rows.length < 2) return []
  const headers = rows[0]
  const idx = (nombre: string) => headers.findIndex(h => h?.toLowerCase() === nombre.toLowerCase())

  const iCedula      = idx("cedula")
  const iNombre      = idx("nombre_completo")
  const iCargo       = idx("cargo")
  const iServicio    = idx("servicio")
  const iServicio_   = idx("servicio_")
  const iGerencia    = idx("gerencia")
  const iJefe        = idx("jefe_inmediato")
  const iCoord       = idx("coordinador")
  const iEmail       = idx("e_mail")
  const iEmailCorp   = idx("usuario_gestor_4")
  const iUsuarioLatam = idx("usuario_gestor_1")
  const iEstado      = idx("estado")
  const iArea        = idx("area")

  return rows.slice(1)
    .filter(row => row.some(c => c?.trim()))
    .map(row => ({
      cedula:          row[iCedula]       ?? "",
      nombre:          row[iNombre]       ?? "",
      cargo:           row[iCargo]        ?? "",
      servicio:        row[iServicio]     ?? "",
      servicio_:       iServicio_ >= 0 ? row[iServicio_] : undefined,
      gerencia:        iGerencia >= 0 ? row[iGerencia] : undefined,
      jefeInmediato:   row[iJefe]         ?? "",
      coordinador:     row[iCoord]        ?? "",
      email:           row[iEmail]        ?? "",
      emailCorporativo: row[iEmailCorp]   ?? "",
      usuarioLatam:    row[iUsuarioLatam] ?? "",
      estado:          row[iEstado]       ?? "",
      area:            row[iArea]         ?? "",
    }))
}

export async function cargarPersonas(accessToken: string): Promise<Persona[]> {
  // Carga todas las bases en paralelo y las combina
  const resultados = await Promise.allSettled(
    BASES.map(b => getSheetData(accessToken, b.id, b.rango))
  )
  const todasLasPersonas = resultados.flatMap(r => r.status === "fulfilled" ? parsearFilas(r.value) : [])

  // Deduplicar por cédula (mantener la primera aparición)
  const vistas = new Set<string>()
  return todasLasPersonas.filter(p => {
    if (!p.cedula) return true // Si no hay cédula, incluir
    if (vistas.has(p.cedula)) return false // Ya vimos esta cédula
    vistas.add(p.cedula)
    return true
  })
}

export interface PerfilUsuario {
  persona: Persona
  rol: RolNormalizado
  // Personas que este usuario supervisa directamente
  equipo: Persona[]
  // Para coordinadores: sus supervisores
  supervisores: Persona[]
}

export async function obtenerPerfil(
  accessToken: string,
  emailLogueado: string
): Promise<PerfilUsuario | null> {
  const todos = await cargarPersonas(accessToken)
  const activos = todos.filter(p => (p.estado ?? "").toLowerCase() !== "retiro")

  // Buscar la persona por email corporativo (usuario_gestor_4) primero, luego email personal
  const emailBuscar = emailLogueado.toLowerCase().trim()
  const persona = activos.find(
    p => (p.emailCorporativo ?? "").toLowerCase().trim() === emailBuscar
      || (p.email ?? "").toLowerCase().trim() === emailBuscar
  )

  if (!persona) return null

  const rol = normalizarCargo(persona.cargo)
  const nombrePersona = (persona.nombre ?? "").toLowerCase().trim()

  // Equipo directo: quienes tienen a esta persona como jefe_inmediato
  const equipo = activos.filter(
    p => (p.jefeInmediato ?? "").toLowerCase().trim() === nombrePersona
  )

  // Supervisores: para coordinadores, quienes tienen a esta persona como coordinador
  const supervisores = activos.filter(
    p => (p.coordinador ?? "").toLowerCase().trim() === nombrePersona
      && normalizarCargo(p.cargo) === "supervisor"
  )

  return { persona, rol, equipo, supervisores }
}
