import { getSheetData } from "@/lib/sheets"

// Fuentes de datos de personas (misma estructura, distintas poblaciones)
const BASES: { id: string; rango: string }[] = [
  { id: "1veAlRJlVrJ2MRtoYNi3aJ_NX97sBFTgcww0V0jv6_Q0", rango: "A:AS" }, // AMX - asesores y supervisores
  { id: "1tmFJQ4EJaUTCbogu11klf7GSzXpzevn7gw3U84Rw3zM",  rango: "Socio!A:AS" }, // LATAM - coaches y líderes
]

// Superusuarios/Administradores con acceso a todo
const ADMIN_EMAILS = [
  "carlosmurilloe.almacontact@outsourcing-account.com",
  "mariarestrepoh.almacontact@outsourcing-account.com",
  "arodriguez.almacontact@outsourcing-account.com",
  "andresfelipeurrego.almacontact@outsourcing-account.com",
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
  | "admin"
  | "desconocido"

// Personas cuyo cargo real no debe determinar cómo se les trata en el panel.
// ALZATE ARROYAVE DANIEL FELIPE: cargo real "Jefe de Operación" (normaliza a
// "jefatura"), pero para efectos del dashboard debe verse y funcionar como
// coordinador (mismos módulos, mismo filtrado de datos por columna
// "Coordinador"/supervisores a cargo).
const ROL_FORZADO: Record<string, RolNormalizado> = {
  "ALZATE ARROYAVE DANIEL FELIPE": "coordinador",
}

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

function normClave(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .replace(/\s+/g, " ")
}

interface CargaPersonas {
  personas: Persona[]
  // true si AL MENOS UNA base falló al cargar (cuota, permisos, error
  // transitorio) — no implica que TODAS fallaran; puede que la persona
  // buscada viva perfectamente bien en la base que sí cargó.
  huboFallas: boolean
  detalleFallas: string
}

async function cargarPersonasDetallado(accessToken: string): Promise<CargaPersonas> {
  // Carga todas las bases en paralelo y las combina
  const resultados = await Promise.allSettled(
    BASES.map(b => getSheetData(accessToken, b.id, b.rango))
  )

  const fallidas = resultados.filter((r): r is PromiseRejectedResult => r.status === "rejected")
  const detalleFallas = fallidas.map(r => r.reason instanceof Error ? r.reason.message : String(r.reason)).join("; ")

  // Si TODAS las bases fallan no hay nada utilizable — ahí sí hay que cortar
  // con un error explícito (antes esto seguía en silencio con una lista
  // vacía, indistinguible de "nadie está registrado").
  if (fallidas.length === resultados.length) {
    throw new Error(`No se pudo cargar la base de personas (${detalleFallas}). Intenta de nuevo en unos segundos.`)
  }

  const todasLasPersonas = resultados.flatMap(r => r.status === "fulfilled" ? parsearFilas(r.value) : [])

  // Deduplicar por nombre+cargo+servicio (algunas personas tienen dos filas
  // —una con cédula y otra sin ella, o repetidas entre las dos bases— que no
  // se detectan comparando solo por cédula). Si hay dos filas para la misma
  // persona, se prefiere la que tiene correo corporativo (usuario gestor 4)
  // cargado.
  const vistas = new Map<string, Persona>()
  for (const p of todasLasPersonas) {
    const clave = `${normClave(p.nombre)}|${normClave(p.cargo)}|${normClave(p.servicio)}`
    const existente = vistas.get(clave)
    if (!existente || (!existente.emailCorporativo && p.emailCorporativo)) {
      vistas.set(clave, p)
    }
  }
  return { personas: [...vistas.values()], huboFallas: fallidas.length > 0, detalleFallas }
}

export async function cargarPersonas(accessToken: string): Promise<Persona[]> {
  const { personas } = await cargarPersonasDetallado(accessToken)
  return personas
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
  const { personas: todos, huboFallas, detalleFallas } = await cargarPersonasDetallado(accessToken)
  const activos = todos.filter(p => (p.estado ?? "").toLowerCase() !== "retiro")

  // Buscar la persona por email corporativo (usuario_gestor_4) primero, luego email personal
  const emailBuscar = emailLogueado.toLowerCase().trim()
  const persona = activos.find(
    p => (p.emailCorporativo ?? "").toLowerCase().trim() === emailBuscar
      || (p.email ?? "").toLowerCase().trim() === emailBuscar
  )

  // Verificar si es administrador (antes de validar si existe)
  const esAdmin = ADMIN_EMAILS.some(email => email.toLowerCase().trim() === emailBuscar)

  // Si es admin pero no existe en BD, crear perfil temporal
  if (esAdmin && !persona) {
    const adminTemporal: Persona = {
      cedula: "0",
      nombre: "Administrador",
      cargo: "admin",
      servicio: "Administración",
      gerencia: undefined,
      jefeInmediato: "",
      coordinador: "",
      email: emailBuscar,
      emailCorporativo: emailBuscar,
      usuarioLatam: "",
      estado: "activo",
      area: "Administración",
    }
    return {
      persona: adminTemporal,
      rol: "admin",
      equipo: activos,
      supervisores: []
    }
  }

  if (!persona) {
    // Si no se encontró Y alguna base falló al cargar, no podemos afirmar que
    // de verdad no está registrado — puede que su fila viva justo en la base
    // que falló. Es ambiguo, así que se avisa como "no se pudo verificar" en
    // vez del más grave "no está en la base de datos" (que antes se mostraba
    // por igual en ambos casos).
    if (huboFallas) {
      throw new Error(`No se pudo verificar tu perfil por completo (${detalleFallas}). Intenta de nuevo en unos segundos.`)
    }
    return null
  }

  if (esAdmin) {
    // Los admins ven a todos como su "equipo"
    return {
      persona,
      rol: "admin",
      equipo: activos.filter(p => p.cedula !== persona.cedula),
      supervisores: []
    }
  }

  const rol = ROL_FORZADO[(persona.nombre ?? "").toUpperCase().trim()] ?? normalizarCargo(persona.cargo)
  const nombrePersona = (persona.nombre ?? "").toLowerCase().trim()

  // Equipo directo: quienes tienen a esta persona como jefe_inmediato
  const equipo = activos.filter(
    p => (p.jefeInmediato ?? "").toLowerCase().trim() === nombrePersona
  ).sort((a, b) => (a.nombre ?? "").localeCompare(b.nombre ?? "", "es", { sensitivity: "base" }))

  // Supervisores: para coordinadores, quienes tienen a esta persona como coordinador.
  // En la hoja base, algunos supervisores tienen mal el campo "coordinador"
  // (apunta a la jefatura en vez del coordinador real), pero "jefe_inmediato"
  // sí es correcto — se acepta cualquiera de los dos como match.
  const supervisores = activos.filter(
    p => normalizarCargo(p.cargo) === "supervisor"
      && ((p.coordinador ?? "").toLowerCase().trim() === nombrePersona
        || (p.jefeInmediato ?? "").toLowerCase().trim() === nombrePersona)
  ).sort((a, b) => (a.nombre ?? "").localeCompare(b.nombre ?? "", "es", { sensitivity: "base" }))

  return { persona, rol, equipo, supervisores }
}
