export interface ModuloConfig {
  id: string
  titulo: string
  icono: string
  descripcion: string
}

export const TODOS_MODULOS: ModuloConfig[] = [
  { id: "adherencia", titulo: "Medidas de Dirección", icono: "📋", descripcion: "Ingresos diarios, resolutividad y productividad del equipo" },
  { id: "practicas_lideres", titulo: "Prácticas Líderes 4DX", icono: "🎯", descripcion: "CDR y cumplimiento de prácticas" },
  { id: "pausas_4dx", titulo: "Pausas 4DX", icono: "⏸️", descripcion: "Diálogo y CDR diario del equipo" },
  { id: "practicas_coach", titulo: "Prácticas Coach", icono: "🏋️", descripcion: "Cumplimiento de prácticas del coach" },
  { id: "adherencia_pca", titulo: "Monitoreos de Calidad", icono: "🔍", descripcion: "PCA, PTA y Pauta de calidad" },
  { id: "resolutividad", titulo: "Circuito de Resolutividad", icono: "💡", descripcion: "Ideas y mejoras del equipo" },
  { id: "feedback", titulo: "Feedback Interfábricas", icono: "💬", descripcion: "Feedback entre compañeros" },
  { id: "compromisos", titulo: "Compromisos", icono: "🤝", descripcion: "Estado de compromisos por asesor" },
  { id: "confirmaciones_rol", titulo: "Confirmaciones de Rol", icono: "✅", descripcion: "Acompañamientos del coach" },
  { id: "quiz", titulo: "Quiz Semanal", icono: "📝", descripcion: "Presentación y aprobación" },
  { id: "estoy_enterado", titulo: "Estoy Enterado", icono: "📢", descripcion: "Seguimiento de briefings" },
  { id: "agenda_lider", titulo: "Agenda del líder", icono: "🗓️", descripcion: "Última actualización de la agenda" },
]

export const MODULOS_EQUIPO: ModuloConfig[] = [
  { id: "adherencia", titulo: "Medidas de Dirección", icono: "📋", descripcion: "Ingresos diarios, resolutividad y productividad del equipo" },
  { id: "practicas_lideres", titulo: "Prácticas Líderes 4DX", icono: "🎯", descripcion: "CDR y cumplimiento de prácticas" },
  { id: "pausas_4dx", titulo: "Pausas 4DX", icono: "⏸️", descripcion: "Diálogo y CDR diario del equipo" },
  { id: "confirmaciones_rol", titulo: "Confirmaciones de Rol", icono: "✅", descripcion: "Acompañamientos del equipo" },
  { id: "compromisos", titulo: "Compromisos", icono: "🤝", descripcion: "Estado de compromisos por asesor" },
  { id: "quiz", titulo: "Quiz Semanal", icono: "📝", descripcion: "Presentación y aprobación" },
  { id: "estoy_enterado", titulo: "Estoy Enterado", icono: "📢", descripcion: "Seguimiento de briefings" },
  { id: "feedback", titulo: "Feedback Interfábricas", icono: "💬", descripcion: "Feedback entre compañeros" },
  { id: "resolutividad", titulo: "Circuito de Resolutividad", icono: "💡", descripcion: "Ideas y mejoras del equipo" },
]

// Orden de módulos para el rol híbrido "Coordinador Coach" (ej. Katheryne Quiñones)
export const MODULOS_COORDINADOR_COACH = ["practicas_coach", "adherencia_pca", "confirmaciones_rol", "resolutividad"]

export function modulosPorIds(ids: Iterable<string>, catalogo: ModuloConfig[] = TODOS_MODULOS): ModuloConfig[] {
  const visibles = new Set(ids)
  return catalogo.filter(modulo => visibles.has(modulo.id))
}

export function modulosEnOrden(ids: string[], catalogo: ModuloConfig[] = TODOS_MODULOS): ModuloConfig[] {
  return ids
    .map(id => catalogo.find(modulo => modulo.id === id))
    .filter((modulo): modulo is ModuloConfig => Boolean(modulo))
}
