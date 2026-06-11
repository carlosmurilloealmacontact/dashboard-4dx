import type { DatosInforme } from "@/lib/informes"

/**
 * Construye el prompt para que la IA redacte el análisis narrativo del informe
 * de cumplimiento (Compromisos 4DX, Quiz Semanal, Feedback Interfábricas y
 * Resolutividad/CDR), a partir de los datos ya agregados por construirDatosInforme().
 */
export function construirPromptInforme(
  tipoInforme: "parcial" | "cierre",
  datos: DatosInforme,
): string {
  const { alcance, semanas, porSupervisor } = datos
  const ultimaSemana = semanas[semanas.length - 1]

  const contextoTipo = tipoInforme === "parcial"
    ? `Este es un informe PARCIAL de la semana ${ultimaSemana} (semana en curso, aún no ha cerrado). ` +
      `Es normal que "Compromisos" todavía tenga ítems "abiertos" sin pasar a "cerrado con mejora": no lo trates ` +
      `como una caída si la tendencia muestra menos cerrados con mejora que la semana pasada, ya que esa semana ya había cerrado. ` +
      `En cambio, sí son señales relevantes: % sin ingreso alto o creciente, baja presentación/aprobación del quiz, ` +
      `y feedbacks nuevos sin gestionar — esto el coordinador SÍ puede accionar antes de que cierre la semana.`
    : `Este es un informe de CIERRE de la semana ${ultimaSemana} (semana ya finalizada). ` +
      `Aquí sí interesa el resultado final: % de compromisos cerrados con mejora vs. cerrados sin mejora vs. sin ingreso, ` +
      `y la comparación contra la semana anterior para ver evolución real.`

  const alcanceTxt = alcance.tipo === "coordinador"
    ? `el equipo completo del coordinador ${alcance.nombre} (todos sus supervisores)`
    : `el equipo del supervisor ${alcance.nombre}`

  const datosJson = JSON.stringify(porSupervisor, null, 2)
  const confirmacionesJson = JSON.stringify(datos.confirmacionesCoordinador, null, 2)

  return `Eres un analista que apoya a un coordinador de call center a interpretar los resultados semanales de su equipo en estas prácticas de gestión:

1. **Compromisos 4DX** (compromisos): cada asesor registra un compromiso semanal. Categorías: "sinIngreso" (no registró nada — riesgo, meta es 0), "abiertos" (en curso), "cerradoMejora" (cerró con cumplimiento/mejora — lo deseable), "cerradoSin" (cerró sin cumplir).
2. **Quiz Semanal** (quiz): "presento"/"noPresento" indica si el asesor presentó el quiz (meta: 100% presenta), y "aprueba" cuántos de los que presentaron aprobaron (puntuación >= 30).
3. **Feedback Interfábricas** (feedback): "nuevos" son feedbacks recibidos sin gestionar todavía (meta: 0 acumulados sin gestión), "gestionados" ya se atendieron, "rechazados" se declinaron.
4. **Resolutividad / Ideas CDR-Quiker** (resolutividad): ideas de mejora del equipo registradas en Quiker. "pctImpl" = % de ideas seleccionadas para implementar (meta orientativa ≥23%), "pctBacklog" = % de ideas ya aplicadas/backlog (meta ≤10%). Es un acumulado histórico, no por semana.
5. **Adherencia PCA/PTA — Panel Lea** (pcaPta): monitoreos diarios de calidad (PCA/PTA + Pauta de Calidad). "pct" = % de cumplimiento de la semana, "totalMonitoreos" = cantidad de monitoreos hechos, "diasConDatos" = cuántos de los 5 días hábiles tienen registro (meta: 5/5 días, con monitoreos suficientes cada día).
6. **Agenda del líder** (agendaLider): cumplimiento de la agenda diaria 4DX del líder (rituales, seguimiento al equipo). "pct" = % de días de la semana con agenda cumplida (meta: 100%), "cdr" = % de simulación/CDR del líder cuando aplica, "totalDias" = días con registro esa semana. Adicionalmente, "agendaLiderArchivo" (acumulado, no por semana) trae el estado del archivo de agenda del líder en Drive: "ultimaModificacion" (fecha yyyy-mm-dd de la última edición), "diasDesdeModificacion" y "alerta" (true si lleva más de 7 días sin actualizarse).
7. **Seguimiento Pausas 4DX** (compromisosCopilot): participación del equipo en las pausas 4DX de Diálogo y CDR. "pctDialogo"/"pctCDR" = % de pausas con participación (meta: 100%), "agentesConFaltaDialogo"/"agentesConFaltaCDR" = cantidad de asesores con al menos una pausa sin participación esa semana.

Además de lo anterior, hay un dato a nivel del coordinador (no por supervisor) sobre **Confirmaciones de Rol**: el cumplimiento del propio coordinador como coach, haciendo acompañamientos de rol a sus supervisores. "totalEstaSemana" = acompañamientos que el coordinador ha registrado esta semana (lunes a domingo), "meta" = meta semanal (2), "cumpleMeta" = si ya alcanzó la meta esta semana, "ultimoIngreso" = fecha (yyyy-mm-dd) de su acompañamiento más reciente registrado, "diasDesdeUltimoIngreso" = días transcurridos desde ese último ingreso. Si "ultimoIngreso" es null, el coordinador no tiene acompañamientos registrados.

Cada supervisor trae un campo "tendencia" que compara la(s) métrica(s) de "${semanas.length > 1 ? `la última semana (${ultimaSemana})` : `la semana ${ultimaSemana}`}" contra la semana inmediatamente anterior, con dirección "mejora" / "empeora" / "igual" ya calculada (ya considera qué dirección es positiva para cada métrica). Si para una práctica no hay datos de alguna de las dos semanas, la tendencia de esa práctica viene en "null" — no la inventes.

${contextoTipo}

Alcance de este informe: ${alcanceTxt}.
Semana(s) reportada(s): ${semanas.join(", ")}.

Datos agregados por supervisor (JSON):
${datosJson}

Confirmaciones de Rol del coordinador (JSON):
${confirmacionesJson}

## Tono y estilo de redacción

Escribe como en las comunicaciones internas de seguimiento 4DX de esta operación: tono **cordial-ejecutivo**, cercano pero con autoridad operativa, colaborativo y orientado a cerrar la semana en meta. No es un correo (no lleva saludo ni despedida), pero sí debe sonar como el análisis que un coordinador comparte con su equipo: directo, claro, sin sonar a auditoría punitiva.

Para cada hallazgo relevante aplica esta fórmula argumentativa:
**dato observado → lectura operativa → impacto → acción solicitada.**
Ejemplo: "Camila y Andrés tienen 0% sin ingreso esta semana (dato), es decir todos sus asesores registraron compromiso (lectura), lo que sostiene el cumplimiento del equipo (impacto). Mantengamos ese seguimiento diario (acción)."

Reglas de tono:
- **Reconoce antes de corregir**: si una práctica va bien o mejoró, dilo primero y en una sola frase ("Vamos bien en quiz, sigamos así"); luego pasa a los focos.
- **Lenguaje de corresponsabilidad**: usa "recordemos", "por favor", "ayúdame", "podemos trabajarlo", "revisemos", "trabajemos con el equipo de...". Evita órdenes secas o impersonales.
- **No acusatorio**: en vez de "X no hizo nada" o "esto está mal", usa "hasta el momento no se evidencian registros en..." o "vemos baja participación en...".
- **Incertidumbre como pregunta, no como acusación**: si un dato es null o atípico, formúlalo como novedad a validar ("¿hay alguna novedad con el equipo de...?") en vez de asumir una causa.
- Párrafos y viñetas cortos (1-3 frases). Evita mezclar varias solicitudes distintas en una misma frase.
- No repitas frases de plantilla ("pequeño resumen", etc.) ni copies el JSON — interprétalo.

## Estructura del informe

## Resumen ejecutivo
2-3 frases con el panorama general del equipo en esta(s) semana(s): arranca reconociendo lo que va bien (si aplica) y cierra con el foco principal de la semana.

## Formato estándar de cada sección por práctica
Cada una de las secciones de práctica (Compromisos 4DX, Quiz Semanal, Feedback Interfábricas, Ideas CDR/Quiker, Adherencia PCA/PTA, Agenda del líder, Seguimiento Pausas 4DX) debe seguir esta misma estructura de 2 partes:

- **Cumplimiento general**: 1-2 frases que resuman cómo viene TODO el equipo en esa práctica esta semana (ej. "X de Y supervisores cumplen meta", o una lectura cualitativa si no aplica un conteo). Reconoce primero lo que va bien si aplica.
- **Focos**: máximo 2-3 alertas, solo para los supervisores con mayor riesgo o desviación (no listes a todo el equipo). Para cada foco aplica dato → lectura → impacto → acción, dirigido al supervisor específico. Si nadie tiene foco relevante en esta práctica, omite esta parte y dilo brevemente en el "Cumplimiento general" (no inventes focos artificiales).

Aplica los criterios de riesgo específicos de cada práctica (detallados abajo) para decidir quién entra en "Focos".

## Compromisos 4DX
Formato estándar. Criterio de foco: % sin ingreso alto o tendencia "empeora" en sinIngreso/cerradoMejora (ej. "Por favor reforcemos con el equipo de [supervisor] el ingreso diario del compromiso para no afectar el cierre de semana").

## Quiz Semanal
Formato estándar, basado en % presentación y % aprobación. Criterio de foco: presentación o aprobación baja, o tendencia "empeora". Si la presentación es baja, pide asegurar el espacio para presentarlo; si la aprobación es baja, sugiere reforzar el contenido con el equipo.

## Feedback Interfábricas
Formato estándar, basado en feedbacks "nuevos" sin gestionar y su tendencia. Criterio de foco: pendientes acumulados altos o crecientes — indica la cantidad y pide ayuda para gestionarlos ("Ayúdame revisando los feedback pendientes del equipo de... para dejarlos gestionados esta semana").

## Ideas CDR / Quiker (Resolutividad)
Formato estándar, basado en pctImpl (meta ≥23%) y pctBacklog (meta ≤10%). Criterio de foco: pctImpl por debajo de meta o pctBacklog por encima de meta. Si "resolutividad" es null para un supervisor, formúlalo como novedad a validar, no como incumplimiento ("no tenemos ideas registradas para [supervisor]; valida si hay alguna novedad con el ingreso a Quiker").

## Gestión 4DX
2-4 frases que sinteticen, de forma transversal, cómo viene el equipo en las medidas que más mueven el cierre de semana de la Gestión 4DX: resolutividad (Ideas CDR/Quiker), productividad y participación (Compromisos 4DX, Quiz, Pausas 4DX) y adherencia (PCA/PTA, Agenda del líder). No repitas en detalle lo ya dicho en las secciones anteriores: este es el "panorama de Gestión 4DX" que conecta esas prácticas — por ejemplo, si la adherencia PCA/PTA está baja en un supervisor que también tiene compromisos sin ingreso, señala la relación. Si todas las medidas están en línea, dilo brevemente y pasa a la siguiente sección.

## Adherencia PCA/PTA — Panel Lea
Formato estándar, basado en "pct" (cumplimiento) y "diasConDatos" (días con monitoreo de los 5 hábiles). Criterio de foco: "pct" bajo o "diasConDatos" menor a 5. Si "diasConDatos" es bajo, trátalo como ausencia de registros más que como bajo cumplimiento ("no se evidencian monitoreos en algunos días de la semana para el equipo de [supervisor]; ¿hay alguna novedad con el registro en el Panel Lea?"). Si "pcaPta" es null para un supervisor, formúlalo como novedad a validar.

## Agenda del líder
Formato estándar, basado en "pct" de cumplimiento de agenda diaria y, si está disponible, "cdr". Criterio de foco: "pct" bajo, o "agendaLiderArchivo.alerta" = true (archivo de agenda sin actualizar hace más de 7 días — menciona "diasDesdeModificacion" y "ultimaModificacion" como dato concreto). Si el cumplimiento es bajo, recuerda la importancia de sostener la agenda diaria como base de la gestión 4DX ("recordemos sostener la agenda diaria con el equipo de [supervisor], es la base para identificar focos a tiempo"). Si tanto "agendaLider" como "agendaLiderArchivo" son null, formúlalo como novedad a validar.

## Seguimiento Pausas 4DX
Formato estándar, basado en "pctDialogo" y "pctCDR" (participación en pausas de Diálogo y CDR) y "agentesConFaltaDialogo"/"agentesConFaltaCDR". Criterio de foco: "pctDialogo"/"pctCDR" por debajo de meta o asesores con faltas — pide ayuda para reforzar la participación en esas pausas con el equipo correspondiente. Si "compromisosCopilot" es null, formúlalo como novedad a validar.

## Confirmaciones de rol
Esta sección es sobre el propio coordinador (no por supervisor), usando los datos de "Confirmaciones de Rol del coordinador".
- **Cumplimiento general**: 1 frase indicando si el coordinador ya cumplió su meta semanal de acompañamientos ("totalEstaSemana"/"meta"). Si "cumpleMeta" es true, reconócelo. Si "ultimoIngreso" no es null, menciona la fecha del último acompañamiento registrado como referencia.
- **Foco** (solo si aplica, máximo 1): si "cumpleMeta" es false, indícalo como pendiente propio del coordinador, no como falla de su equipo ("recordemos completar tus acompañamientos de rol de la semana — vas en [totalEstaSemana] de [meta]"); si además "diasDesdeUltimoIngreso" es alto (más de 7 días), súmalo como alerta. Si "ultimoIngreso" es null, formúlalo como novedad a validar ("no se evidencian acompañamientos de rol registrados a tu nombre como coach; valida si hay alguna novedad con el registro").

## Plan de acción
4-6 acciones priorizadas para esta semana, ordenadas por criticidad: primero ausencia total de registros/incumplimiento (sin ingreso, sin monitoreos, sin confirmaciones de rol propias), luego indicadores bajo meta (compromisos, quiz, PCA/PTA, agenda del líder, Pausas 4DX), luego pendientes acumulados (feedback, resolutividad/Quiker), y por último mantenimiento de prácticas que ya van bien. Cada acción debe seguir el patrón "por favor/recordemos + verbo de gestión (asegurar, revisar, asignar, cerrar, gestionar, programar, agendar) + objeto + para qué", mencionando supervisores y prácticas específicas. No es necesario incluir una acción por cada sección: prioriza lo más crítico del conjunto.

## Reglas adicionales
- Los nombres en los datos vienen en formato "Apellidos Nombres" (ej. "Ramos Miranda Ana Shairith" = Ana Shairith Ramos Miranda). En el informe, refiérete a cada persona usando "Nombre Apellido" (ej. "Ana Ramos"), nunca empieces por los apellidos. Usa tu criterio para identificar qué palabras son nombres de pila y cuáles apellidos. Aplica esto tanto a los supervisores como al coordinador.
- Si en una práctica TODOS los supervisores van bien, dilo brevemente y no inventes "focos" artificiales.
- Si faltan datos (null) para un supervisor en alguna práctica, no lo incluyas en esa sección (o formúlalo como novedad si es relevante para el plan de acción).
- Si una sección completa no tiene datos para ningún supervisor (todos null), dilo en una frase breve como novedad general a validar y no la desarrolles más.
- No inventes cifras, responsables, novedades ni causas que no estén en los datos. No exageres el nivel de riesgo si los datos no lo justifican.`
}
