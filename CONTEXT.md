# CONTEXT.md — Dashboard 4DX

Última actualización: 2026-07-09

---

## Objetivo

Dashboard interno para el equipo Almaexperience / LATAM que centraliza métricas
semanales por rol (asesor → supervisor → coordinador → coach → jefatura → admin).
Los datos se leen en tiempo real desde Google Sheets mediante la API de Google.
Auth vía NextAuth + Google OAuth2 (tokens persistidos en DB para refresh).

Además del dashboard de cards, los coordinadores/jefaturas tienen un
**Informe de cumplimiento generado por IA** (Vertex AI) con gráficas por
práctica, focos críticos y plan de acción, descargable como PDF.

---

## Stack

| Capa | Tecnología |
|------|-----------|
| Framework | Next.js 16.2.7 (Turbopack, App Router) |
| Lenguaje | TypeScript |
| Auth | NextAuth v4 — JWT strategy + OAuth2 refresh |
| Datos | Google Sheets API (googleapis), con caché en memoria (`lib/sheets.ts`) |
| IA | Vertex AI (`lib/vertex.ts`) para el informe narrativo de coordinadores |
| Gráficas | recharts (`components/InformeIA.tsx`) |
| DB | SQLite vía better-sqlite3 (`lib/db.ts`) — almacena tokens |
| Estilos | Tailwind CSS |
| Deploy | Vercel |

> **AVISO:** Esta versión de Next.js tiene breaking changes. Leer
> `node_modules/next/dist/docs/` antes de escribir código nuevo.

---

## Arquitectura general

```
app/
  page.tsx                  ← Dashboard principal (auth real)
  login/page.tsx
  demo/page.tsx             ← Demo por rol (datos mock de jerarquía)
  demo/real/page.tsx        ← Demo con datos reales (3 usuarios fijos)
  preview/page.tsx          ← Dev: cualquier email → simula vista
  api/
    auth/[...nextauth]/     ← NextAuth + refresh token
    auth/logout/            ← Borra token de BD
    jerarquia/              ← /test  /coordinadores
    informes/
      route.ts              ← datos crudos del informe (DatosInforme)
      generar/route.ts       ← genera el informe narrativo con Vertex AI
    modulos/
      adherencia-4dx/
      adherencia-pca/        ← combina "Detalle Eventos" (PCA/PTA) + "Alertas" (Pauta)
      confirmaciones-rol/
      practicas-lideres/    ← + /test
      quiz/
      resolutividad/
      compromisos/
      feedback/
      estoy-enterado/
      seguimiento-coach/
    debug/                   ← endpoints admin-only para diagnosticar discrepancias
      coach-data/
      practicas-lideres/
      metas-resolutividad/
      agenda-drive/
      pca-eventos/           ← inspecciona "Detalle Eventos" por nombre/semana
      pauta-eventos/         ← inspecciona "Alertas" (Pauta) por líder resuelto/semana
      informe-coord/         ← cruza nombre de coordinador entre las hojas del informe IA
      informe-supervisores/  ← cruza supervisores/semanas reales vs. jerarquía
      persona-cargo/         ← muestra cargo/coordinador/servicio/correo (e_mail, usuario_gestor_4) de personas por nombre, en ambas bases
    admin/
      panel-control/         ← KPI cards + heatmap por coordinador para la Vista Admin (ver sección abajo)

components/
  ModuloCard.tsx            ← Wrapper que carga el componente del módulo
  AdminView.tsx             ← Vista admin con filtros rol/servicio/persona
  PanelControlAdmin.tsx     ← Resumen ejecutivo (KPI cards + heatmap) montado arriba de los filtros de AdminView
  CoachTeamView.tsx         ← Vista coach: selección coordinador+servicio → cards
  SemanaGlobalSelector.tsx  ← Dropdown único de semana (prop light para bg blanco)
  InformeIA.tsx             ← UI del informe IA: form, gráficas por sección, copiar/PDF
  modulos/
    Adherencia4DX.tsx
    AdherenciaPCA.tsx
    ConfirmacionesRol.tsx
    PracticasLideres.tsx
    QuizSemanal.tsx
    Resolutividad.tsx
    Compromisos.tsx
    Feedback.tsx
    EstoyEnterado.tsx
    SeguimientoCoach.tsx

context/
  PerfilContext.tsx          ← emailOverride / teamEmail para rutas de API
  SemanaGlobalContext.tsx    ← Filtro de semana global (ver sección abajo)
  ModuloMetricContext.tsx    ← Métricas para chip en ModuloCard

lib/
  authOptions.ts             ← JWT callback con refresh de access token
  jerarquia.ts               ← Tipos PerfilUsuario, Persona, RolNormalizado; cargarPersonas, obtenerPerfil
  equipoAdmin.ts             ← LIDERES/COACHES_PERMITIDOS/filtrarPorRol — fuente única para "quién es coordinador/supervisor/coach real" (AdminView y Panel de Control)
  panelControl.ts            ← construirPanelControl(): agrega % + meta por práctica, por coordinador real y global (KPI cards + heatmap)
  roles.ts                   ← MODULOS_POR_ROL (qué módulos ve cada rol)
  semana.ts                  ← resolverSemana(param, semanas[]), semanaISOActual()
  practicasLideres.ts        ← getPracticasLideres(token, perfil, semanaParam?)
  informes.ts                ← construirDatosInforme(): agrega TODAS las prácticas por supervisor/semana
  informes-prompt.ts         ← construirPromptInforme(): arma el prompt para Vertex AI
  vertex.ts                  ← generarTextoVertex(prompt): llamada a Vertex AI
  drive.ts                   ← obtenerAgendaLider(): estado del archivo de agenda en Drive
  sheets.ts                  ← getSheetData(): lectura de Sheets + caché en memoria + retries
  db.ts                      ← SQLite para tokens
  modulos.ts                 ← Catálogo único de cards/módulos y órdenes especiales
```

---

## Filtro Global de Semana (`SemanaGlobalContext`)

### Arquitectura (Opción A — implementada)

- **Un solo selector** por página reemplaza los dropdowns individuales de cada card.
- Cada módulo hace `reportWeeks(moduleId, semanas[])` tras su fetch → el contexto
  acumula la **unión de todas las semanas** reportadas.
- El selector muestra esa unión ordenada numéricamente; por defecto selecciona la
  última semana disponible.
- Al cambiar la semana global, cada módulo refetch con `?semana=X` → KPIs
  recalculados en el servidor.

### Normalización de semanas

- Las semanas pueden venir como `"W24"` (Quiz), `"24"` (numérico), o implícitas por
  cálculo de fecha ISO.
- `normalizarSemana(s)` en `SemanaGlobalContext.tsx`: strips non-digits → `"W24"` → `"24"`.
- `resolverSemana(param, semanas[])` en `lib/semana.ts`: normaliza `param` y busca
  match en el array; fallback a `semanas.at(-1)`.
- `normSemana(s)` se reimplementa de forma local (idéntica) en `lib/informes.ts` y en
  varios endpoints de `app/api/debug/` para cruzar semanas entre hojas distintas.

### Estado de implementación

| Archivo | Estado |
|---------|--------|
| `context/SemanaGlobalContext.tsx` | ✅ Completo |
| `components/SemanaGlobalSelector.tsx` | ✅ Completo |
| `lib/semana.ts` | ✅ Completo |
| Módulos del dashboard (Adherencia 4DX, PCA, Confirmaciones, Prácticas Líderes, Quiz, etc.) | ✅ usan useSemanaGlobal, reportWeeks, ?semana= |
| `app/page.tsx` / `components/AdminView.tsx` / `app/demo/real/page.tsx` | ✅ SemanaGlobalProvider |
| `app/demo/page.tsx` | ✅ SemanaGlobalProvider |
| `app/preview/page.tsx` | ✅ SemanaGlobalProvider |
| `components/CoachTeamView.tsx` | ✅ SemanaGlobalProvider propio para el grid de equipo |

Actualización 2026-06-16: se corrigieron los pendientes antiguos del selector
global de semana en demo, preview y vista de equipo coach. También se ajustó
`SemanaGlobalContext.tsx` para cumplir las reglas de React/Next 16 sin cambiar
la API pública del contexto.

---

## Pausas 4DX — regla de medición

Actualización 2026-06-16:

- **Diálogo 4DX** se mide como práctica diaria de lunes a viernes. El porcentaje
  se calcula sobre las filas diarias de Diálogo de la semana.
- **Pausa CDR** se mide **una vez por persona a la semana**. Un asesor cumple si
  tiene al menos un registro CDR con participación durante la semana; no debe
  penalizarse como si fuera una práctica diaria L-V.
- `app/api/modulos/pausas-4dx/route.ts` calcula `kpi.cdr` y `pctCDR` por
  agente-semana, mientras `kpi.dialogo` y `pctDialogo` siguen siendo diarios.
- `components/modulos/Pausas4DX.tsx` muestra Diálogo como grilla L-V y CDR como
  cumplimiento semanal por persona.
- `lib/informes.ts` y `lib/informes-prompt.ts` usan la misma regla para el
  Informe IA: los días específicos solo se interpretan para Diálogo, no para CDR.

---

## Informe de cumplimiento (IA) — `InformeIA.tsx` / `lib/informes.ts` / `lib/informes-prompt.ts`

- **Flujo**: `components/InformeIA.tsx` (form: alcance, semana(s), tipo parcial/cierre)
  → `GET /api/informes/generar` → `construirDatosInforme()` agrega todas las
  prácticas por supervisor/semana (`DatosInforme`) → `construirPromptInforme()`
  arma el prompt → `generarTextoVertex()` devuelve el texto → se devuelve
  `{ texto, datos }` al cliente.
- **Render**: `InformeIA.tsx` divide el texto por encabezados `## Título` (mismo
  orden que las cards del dashboard) y para cada sección dibuja una gráfica
  recharts construida a partir de `datos` (no del texto), usando `nombreCorto()`
  para las etiquetas de eje.
- **Estilo del prompt**: tono cordial-ejecutivo, fórmula dato → lectura → impacto →
  acción. Por sección: 1-2 frases de "cumplimiento general" (sin nombrar a quien va
  bien, porque la gráfica ya lo muestra) + **máximo 2 focos** (los supervisores más
  críticos de esa práctica).
- **Primera persona y nombres propios (2026-06-11)**: el informe se redacta como si
  el propio coordinador le hablara a su equipo ("nosotros", "nuestro equipo"), no en
  tercera persona. A cada supervisor se le nombra por su **primer nombre** (no
  apellidos), salvo ambigüedad entre dos personas con el mismo primer nombre, en cuyo
  caso se usa "Nombre Apellido" solo para esa persona. Aplica también al coordinador.
- **Comparaciones parcial vs. cierre (2026-06-11)**:
  - **Parcial**: para las prácticas de cumplimiento diario acumulado (Adherencia
    4DX, Prácticas Líderes, Monitoreos de Calidad/Panel Lea, Pausas 4DX), el prompt
    YA NO compara "pct" contra la semana anterior (`tendencia` se ignora para estas
    prácticas en informes parciales). En su lugar se calcula `avanceEsperadoPct`
    (según el día hábil de la semana en que se genera el informe, asumiendo meta
    100% al cierre de 5 días hábiles) y se instruye al LLM a comparar cada
    supervisor contra ese % esperado a la fecha, indicándolo explícitamente (ej.
    "Juan lleva 60%, lo esperado a hoy es ~60%..."). Compromisos/Quiz/Estoy
    Enterado/Resolutividad/Feedback mantienen su lectura cualitativa habitual (no
    son acumulados diarios).
  - **Cierre**: se mantiene la comparación contra `tendencia.anterior` (semana
    inmediatamente anterior), pero ahora el prompt exige indicar explícitamente el
    valor de la semana anterior junto al actual (ej. "Pasamos de 78% la semana
    pasada a 92% esta semana").
  - En ambos casos se añadió una instrucción general en el formato por sección
    ("Valor de referencia") reforzando que siempre se indique el valor contra el
    que se compara, no solo el delta.
  - Cambios en `lib/informes-prompt.ts` (`contextoTipo`, sección "Tono y estilo de
    redacción", sección "Reglas adicionales" y "Formato estándar de cada sección").

- **Ajustes adicionales (2026-06-11, segunda ronda)**:
  - **Tono — dirigido al coordinador**: se revirtió el "nosotros" (coordinador
    hablándole a su equipo) por redacción en **segunda persona dirigida al
    coordinador** ("tu equipo", "tus supervisores", "te recomiendo"), ya que el
    informe es el insumo que recibe el coordinador para accionar con sus
    supervisores, no el mensaje que el coordinador le da a su equipo.
  - **CDR (Prácticas Líderes) y % Implementación (Circuito de Resolutividad)**: ya
    no se menciona un porcentaje de meta fijo en el prompt (antes 100%/≥23%), porque
    la meta real varía por servicio. El prompt ahora instruye a referirse a "la meta
    de CDR/implementación de su servicio" como referencia cualitativa.
  - **Compromisos**: el foco principal pasa a ser "sinIngreso" (lo único accionable
    durante la semana); "abiertos" deja de tratarse como señal de alerta en parcial
    o cierre. En cierre, se añade comparación "cerradoMejora" vs. "cerradoSin" (con
    tendencia) frente a la semana anterior.
  - **Estoy Enterado**: se eliminó por completo del informe (estructura, formato
    estándar, sección dedicada, tendencias y plan de acción) — el prompt ahora
    indica explícitamente no usarlo ni mencionarlo, aunque el dato siga llegando en
    el JSON.
- **Exportar**: botones "Copiar" (texto plano al portapapeles) y "Descargar PDF"
  (`window.print()` + CSS `@media print` que oculta todo excepto
  `#informe-imprimible`, dejando texto + gráficas SVG).

### "Monitoreos de Calidad" — combinación de dos fuentes

Tanto `app/api/modulos/adherencia-pca/route.ts` (dashboard) como
`aggPcaPta()` en `lib/informes.ts` (informe IA) combinan **dos hojas
independientes**:

1. **PCA/PTA** — hoja "Detalle Eventos" (`SHEET_ID_PCA =
   1MZiP7K4JbElp3lM2n0Tr554WNN1RTfGlsgCB9uJ8tSw`): filas evento + fila-resumen por
   día (columna "Total Gestión Dia", se toma el MAX por día/origen).
2. **Pauta de Calidad** — hoja "Alertas" (`SHEET_ID_PAUTA =
   1MVyZW1N45iQgDiii6cnCFBCwFl4zk6B5s4ScqkwNF-U`): una fila = un monitoreo
   individual, **solo cuentan filas con `Evaluador == "LL.OO"`** (QMOS/SUPERVISOR no
   cuentan). El líder real se resuelve vía `BP → Persona.jefeInmediato`
   (`cargarPersonas`), porque la columna "Supervisor" de Alertas en realidad es el
   jefe inmediato del asesor evaluado.

`combinarDias()` suma ambos totales por día y promedia el cumplimiento ponderado
(campo `cumple`, calidad — ya no se usa para el `%` mostrado, ver abajo).
`META_DIARIA = 5` (combinado, solo usado para `diasConMeta`/`días con meta`,
sin cambios).

### % de cumplimiento = volumen vs. meta semanal (2026-06-12)

En `app/api/modulos/adherencia-pca/route.ts`, el `%` mostrado (global y por
tipo PCA/PTA / Pauta) **ya NO es la nota de calidad** ("Cumplimiento Día" /
"NotaFinal" de las hojas) — ahora representa **cumplimiento de la meta de
volumen semanal de monitoreos**:
- `META_SEMANAL_PCAPTA = 25` (5/día × 5 días hábiles)
- `META_SEMANAL_PAUTA = 20` (4/día × 5 días hábiles)
- `pcapta.pct = min(100, round(totalPCA / 25 * 100))`, `pauta.pct = min(100,
  round(totalPauta / 20 * 100))` — `porTipoResumen()`, desglose informativo por
  tipo.
- `%` global (`promCumple` en vista coordinador, `kpi.pct` en vista
  supervisor) = `min(100, round((totalPCA + totalPauta) / 25 * 100))` —
  `META_SEMANAL_GLOBAL = 25` (= `META_DIARIA * 5`), **la misma meta combinada
  para todos los supervisores** sin importar el desglose por tipo (ej. Méndez
  Daza con 12 PCA/PTA + 4 Pauta = 16 → 16/25 = 64%).
- El campo `cumple` (calidad, de `combinarDias()`) queda calculado pero sin
  usar para el `%` — solo `cumpleMeta`/`diasConMeta` (meta diaria combinada de
  5) se sigue usando igual que antes.

---

## Rol híbrido "Coordinador Coach" (2026-06-12)

Para personas cuyo `cargo` normaliza a `"coordinador"` pero el texto del
cargo **también incluye "coach"** (ej. KATHERYNE QUIÑONES, cargo "Coordinador
Coach") — sin lista de nombres hardcodeada, se detecta dinámicamente:

- `app/page.tsx`: `esCoordinadorCoach = perfil.rol === "coordinador" &&
  perfil.persona.cargo.toLowerCase().includes("coach")`.
- Si es coordinador-coach:
  - `modulosVisibles` usa `MODULOS_POR_ROL["coach"]` (Prácticas Coach,
    Monitoreos de Calidad, Confirmaciones de Rol) en vez de la lista de
    coordinador — es la misma vista que un coach normal, pero "Prácticas
    Coach" agrupa el cumplimiento de su equipo de coaches (ver `modo:
    "coordinador"` abajo).
  - Se renderiza `<CoachTeamView perfilCoach={perfil} />` (antes solo para
    `rol === "coach"`) → conserva los filtros de coordinador/servicio para ver
    otros equipos (sección "CDR").
- (2026-06-12, ajuste) Confirmado funcionando: "Prácticas Coach" mostró 80%
  con el desglose por coach correctamente para KATHERYNE QUIÑONES
  (`Coordinador Coach`, base LATAM-Socio, fila 26).
- (2026-06-12, segundo ajuste) `app/api/modulos/confirmaciones-rol/route.ts`:
  mismo patrón — nuevo `modo: "coordinador"` cuando `perfil.rol ===
  "coordinador"`. Toma `perfil.equipo` filtrado por `normalizarCargo(cargo)
  === "coach"`, filtra filas de "Confirmaciones de Rol" donde la columna del
  nombre del coach (`iNombreCoach`) coincide con cada coach, y devuelve
  `{ modo, total, semanaActual, semanas, deEstaSemana, porCoach: [{ coach,
  total, estaSemana, confirmaciones }] }`. `ConfirmacionesRol.tsx` agrega
  vista `modo === "coordinador"` (KPI esta semana/total equipo + lista "Por
  coach" con confirmaciones de la semana seleccionada).
- (2026-06-12, tercer ajuste) `components/CoachTeamView.tsx`: el título
  "Seguimiento de Equipo" era `text-white` (invisible sobre el fondo blanco de
  `app/page.tsx`/`preview`/`demo`, donde se usa siempre) — cambiado a
  `text-gray-900`. También se redujo el espacio antes de la sección (`mt-10`
  → `mt-4`, separador `border-gray-800 mb-8` → `border-gray-200 mb-4`) para
  que quede inmediatamente debajo de los módulos (ej. Confirmaciones de Rol)
  en vez de con un salto grande. Afecta a todos los usos de `CoachTeamView`
  (coach normal y coordinador-coach), no solo a Katheryne.
- (2026-06-12, cuarto ajuste) Se agregó el módulo "Circuito de Resolutividad"
  (`resolutividad`) a la vista del rol híbrido "Coordinador Coach", ubicado
  inmediatamente después de "Confirmaciones de Rol". El endpoint
  `/api/modulos/resolutividad` ya soportaba `perfil.rol === "coordinador"`
  (filtra la hoja `Datos` por columna `coordinador` = nombre de la persona),
  por lo que no requirió cambios de backend. Como el orden por defecto de
  `TODOS_MODULOS` colocaría "Circuito de Resolutividad" antes de
  "Confirmaciones de Rol", se introdujo la constante ordenada
  `MODULOS_COORDINADOR_COACH = ["practicas_coach", "adherencia_pca",
  "confirmaciones_rol", "resolutividad"]` en `app/page.tsx` y
  `app/preview/page.tsx`. Cuando `esCoordinadorCoach` es true, `modulosVisibles`
  se construye mapeando esos ids sobre `TODOS_MODULOS` (en vez de filtrar
  `TODOS_MODULOS` en su orden original), garantizando el orden deseado.
- `app/api/modulos/seguimiento-coach/route.ts`: nuevo `modo: "coordinador"`
  cuando `perfil.rol === "coordinador"`. Toma `perfil.equipo` filtrado por
  `normalizarCargo(cargo) === "coach"` (sus coaches directos), busca cada uno
  en `Seguimiento_LiderCoach_8Sem` (columna "Lider Coach") y devuelve
  `{ modo, semanas, semanaActual, kpi: { pct, cdr }, porCoach: [{ coach,
  totalDias, cumplidos, pct, cdr }] }` — mismo patrón que `porSupervisor` en
  `lib/practicasLideres.ts`.
- `components/modulos/SeguimientoCoach.tsx`: agrega vista `modo ===
  "coordinador"` (selector de semana, KPI global Diálogo equipo/CDR promedio,
  lista "Por coach" con barra de progreso) — la vista individual existente
  ahora es `modo: "individual"`.
- `app/preview/page.tsx` ("Ver como este usuario", modo desarrollo): se
  replicó la misma lógica `esCoordinadorCoach` para que un admin pueda
  previsualizar la vista híbrida de Katheryne sin necesidad de loguearse con
  su cuenta.

---

## `lib/sheets.ts` — caché y resiliencia (2026-06-11, TTL actualizado 2026-07-09)

- `getSheetData(accessToken, spreadsheetId, range)` mantiene una **caché compartida
  en memoria** (`Map`, TTL **120s** — antes 30s, ver incidente de cuota abajo,
  clave `spreadsheetId::range`, ignora el token): todas las peticiones
  concurrentes/recientes de **todos los usuarios que caen en la misma instancia de
  servidor** a la misma hoja+rango reutilizan el mismo dato → reduce el consumo de
  cuota de Sheets API en picos de tráfico. Ojo: esta caché vive en memoria por
  instancia — Vercel puede levantar varias instancias en paralelo bajo carga, cada
  una con su propia caché vacía, así que el beneficio es real pero no elimina del
  todo el riesgo de picos de cuota con concurrencia alta.
- Las peticiones en curso se deduplican (`pendientes` Map) para evitar fan-out de
  llamadas idénticas simultáneas.
- Reintenta automáticamente (backoff 1s/2s/4s) ante **429/403 (cuota) y
  500/502/503/504 (errores transitorios de Google)** — antes solo reintentaba
  429/403.
- Si todos los reintentos fallan pero hay un dato cacheado (aunque vencido), se
  sirve ese dato en vez de propagar un error 500 al usuario.

---

## Bugs corregidos (histórico acumulado)

| Bug | Causa | Fix |
|-----|-------|-----|
| Quiz "No Presentó" contaba como presentó | `s.includes("presentó")` hace match en "No Presentó" | Verificar `s.includes("no presento")` primero |
| PCA solo mostraba lunes | Columna "Fecha" vacía en hoja; agrupaba por fecha vacía | Agrupar por `${semana}-${diaCol}` usando "Dia Semana" |
| Confirmaciones "esta semana = 0" | Fechas en hoja como "2026-06-01 12:02" (ISO), `parseSheetDate` solo entendía `dd/mm/yyyy` | Regex ISO primero en `parseSheetDate` |
| Producción mostraba semanas viejas | Sin Cache-Control → Vercel edge cache | `export const dynamic = "force-dynamic"` + `revalidate = 0` + `Cache-Control: no-store` en rutas de módulos |
| Adherencia 4DX 0% para coordinador | `perfil.supervisores` vacío al venir de debug; filtraba por array vacío | Filtrar por columna "Coordinador" en la hoja directamente |
| Resolutividad "sin datos" flicker | Error de quota de Sheets sobreescribía datos buenos | Flag `activo` + sólo `setData(d)` cuando `d.total` es número |
| TS error `perfil.emailCorporativo` | Propiedad es `perfil.persona.emailCorporativo` | Corregido path |
| Producción sin cambios visibles | Vercel cacheaba respuestas de API routes | `Cache-Control: no-store` en todas las rutas de módulos |
| Errores 500 intermitentes en módulos | `getSheetData` solo reintentaba 429/403, no 5xx transitorios | Ampliar reintentos a 5xx + caché compartida con fallback a dato vencido (ver sección `lib/sheets.ts`) |
| Personas duplicadas en jerarquía | Filas repetidas (con/sin cédula) entre las dos bases de personas | Dedupe en `cargarPersonas` por `nombre+cargo+servicio`, prefiriendo la fila con `emailCorporativo` |
| Vista sin perfil mostraba TODOS los módulos de TODOS los roles | `app/page.tsx` caía a `TODOS_MODULOS` cuando `perfil` era `null` | Cae a `[]` — sin perfil no hay con qué filtrar datos, no debe mostrar ningún módulo |
| Falsos "usuario no encontrado" (2026-07-09) | `cargarPersonas` descartaba en silencio cualquier hoja que fallara al cargar (cuota de Sheets excedida por usuario, o permisos de Drive sin compartir a nivel de dominio en la hoja "Socio") — indistinguible de "no registrado" | Cuota subida (60→300/min por usuario), hoja "Socio" compartida por dominio, caché TTL 30s→120s, y mensajes de error distintos para "no encontrado" (404) vs. "no se pudo cargar" (falla parcial ambigua) — ver sección "Incidente" abajo |

---

## Decisiones arquitectónicas

1. **Refetch por parámetro** (no filtrado en cliente) para el filtro de semana: los
   KPIs se recalculan en el servidor por semana, no se filtra el JSON ya recibido.

2. **`useRef` para `porModulo`** en `SemanaGlobalContext` para acumular semanas por
   módulo sin causar re-renders infinitos; sólo se bump `version` (estado) cuando el
   conjunto cambia.

3. **Resolutividad multi-jefatura**: el KPI global = promedio ponderado por #ideas;
   desglose por jefatura se muestra sólo cuando `porJefatura.length > 1`.

4. **Metas de Resolutividad dinámicas**: se leen de la hoja `Metas!A:B` (columna A =
   jefatura, columna B = meta%). Fallback 23% si no está en el mapa.

5. **Fechas PCA**: "Fecha" en "Detalle Eventos" está vacía. El día real viene de "Dia
   Semana" (1=Lun … 5=Vie, coincide con `Date.getDay()`). "Total Gestión Dia" es
   acumulado → se toma MAX por `(semana, dia, origen)`.

6. **CoachTeamView filtros bidireccionales**: elegir coordinador → filtra servicios a
   los suyos; elegir servicio → filtra coordinadores a los que lo tienen.

7. **Caché compartida de Sheets** (ver sección `lib/sheets.ts`): se prioriza una
   caché global de 30s sobre bajar el `Cache-Control` por usuario, porque reduce
   cuota para todos sin perder frescura.

8. **Informe IA — alcance de "Focos"**: máximo 2 supervisores más críticos por
   práctica (antes 2-3, sin tope real); la gráfica ya muestra a todo el equipo, así
   que el texto no debe repetir nombres de quienes van bien.

9. **PDF del informe vía `window.print()`**: se eligió sobre `html2canvas`/`jsPDF`
   para no agregar dependencias y mantener las gráficas SVG nítidas; el costo es un
   clic extra del usuario para "Guardar como PDF" en el diálogo del navegador.

---

## Archivos clave para cada módulo

| Módulo | Componente | Ruta API |
|--------|-----------|----------|
| Adherencia 4DX | `Adherencia4DX.tsx` | `api/modulos/adherencia-4dx` |
| Adherencia PCA | `AdherenciaPCA.tsx` | `api/modulos/adherencia-pca` |
| Confirmaciones Rol | `ConfirmacionesRol.tsx` | `api/modulos/confirmaciones-rol` |
| Prácticas Líderes | `PracticasLideres.tsx` | `api/modulos/practicas-lideres` |
| Quiz Semanal | `QuizSemanal.tsx` | `api/modulos/quiz` |
| Resolutividad | `Resolutividad.tsx` | `api/modulos/resolutividad` |
| Informe IA (coordinador) | `InformeIA.tsx` | `api/informes/generar` |

---

## Problemas conocidos (activos)

1. **Equipo de supervisores vacío para 3 coordinadores** (HERNANDEZ URREGO
   CRISTIAN ENRIQUE, MARTINEZ PEREZ JHON ALEXANDER, MONSALVE HERRERA JOHN JAMES —
   semana 24, parcial), confirmado vía `/api/debug/informe-supervisores` +
   `/api/debug/persona-cargo`.
   - **Causa raíz (misma para los 3)**: la columna `coordinador` en la hoja
     NO representa al coordinador directo del supervisor — representa el nivel
     gerencial (un nivel arriba). Por diseño, `coordinador` apunta a la
     jefatura (ej. URREGO CASTAÑO ANDRES FELIPE) y `jefeInmediato` apunta al
     coordinador directo. El dato en la hoja es correcto y no debe cambiarse.
     El bug era que `obtenerPerfil()` buscaba supervisores filtrando solo por
     `p.coordinador === nombreCoord`, que nunca matchea porque esa columna
     tiene la gerencia → `perfil.supervisores` vacío → Adherencia 4DX,
     Prácticas Líderes, Monitoreos de Calidad (PCA/PTA) y Pausas 4DX salen
     "Sin datos" en el Informe IA.
   - **Compromisos, Quiz y Resolutividad sí muestran datos** porque esas
     agregaciones NO cruzan contra `perfil.supervisores`, agrupan directo por el
     nombre que viene en su propia hoja.
   - ~~Hipótesis descartada~~: LOMBARDO LIÑAN, CORREA VARGAS, URIBE BUILES,
     VIRGUEZ SANCHEZ tienen `estado: "Retiro"`, ya excluidas de `activos`.
   - **✅ Corregido en código** (2026-06-11): `obtenerPerfil()` en
     `lib/jerarquia.ts` calcula `supervisores` aceptando coincidencia por
     `coordinador` **o** por `jefeInmediato`. Como `coordinador` en la hoja
     representa la gerencia (no el coordinador directo), el match siempre
     viene por `jefeInmediato`. Esta es la solución definitiva — la hoja
     está correcta y no requiere ningún cambio.
   - Pendiente: regenerar el Informe IA de los 3 coordinadores semana 24 y
     confirmar que las 4 secciones muestran datos.
   - Endpoints de debug creados para esta investigación:
     `app/api/debug/pca-eventos`, `app/api/debug/pauta-eventos`,
     `app/api/debug/informe-coord`, `app/api/debug/informe-supervisores`,
     `app/api/debug/persona-cargo` (todos admin-only).

2b. **"Agenda del líder" en blanco para MARTINEZ PEREZ JHON ALEXANDER** pese a
   que los archivos sí existen en Drive (carpeta "Equipo John Martinez").
   - **Causa**: `nombresCoinciden()` (`lib/drive.ts`) exigía coincidencia
     exacta de palabras; la carpeta de Drive dice "**John** Martinez" pero la
     jerarquía tiene "MARTINEZ PEREZ **JHON** ALEXANDER" — "john" ≠ "jhon" →
     nunca encontraba la carpeta del coordinador → mapa de agendas vacío →
     "Sin archivo" para todo el equipo.
   - **✅ Corregido en código** (2026-06-11): `nombresCoinciden()` ahora tolera
     variantes de ortografía (distancia de edición ≤1 en palabras de 4+
     letras), cubriendo casos como "jhon"/"john".
   - **Fix v2** (2026-06-11): el primer intento usaba Levenshtein estándar,
     donde "john"→"jhon" es distancia **2** (dos sustituciones), no 1 — seguía
     sin matchear. Se cambió a **Damerau-Levenshtein** (cuenta una
     transposición de letras adyacentes como 1 edición), con la que
     "john"↔"jhon" da distancia 1. Verificado con script de prueba.
   - Pendiente: confirmar en producción que "Agenda del líder" de Martínez
     Pérez ahora muestra los 4 archivos (Ramirez Rios, Salazar Sanmartin,
     Orixas Castro, Rodriguez Restrepo).

2c. **ALZATE ARROYAVE DANIEL FELIPE no aparece en el listado de coordinadores**
   — su `cargo` es "JEFE DE OPERACION" (normaliza a `"jefatura"`, no
   `"coordinador"`). Se intentó agregarlo a las listas hardcodeadas
   `coordinadoresActivos` (`app/api/jerarquia/coordinadores/route.ts`) y
   `COORDINADORES_PERMITIDOS` (`components/AdminView.tsx`), y a
   `ROLES_DISPONIBLES` para que "Jefatura" fuera un rol seleccionable en la
   Vista de Admin — pero el resultado no fue el esperado, así que se revirtió
   todo (2026-06-12). **Pendiente**: definir el enfoque correcto para que
   Daniel Alzate (jefatura) sea gestionable desde la Vista de Admin.

3. **Endpoints de debug acumulados** (`app/api/debug/*`): son admin-only y de
   solo lectura, pero conviene revisar periódicamente si siguen siendo necesarios o
   se pueden retirar una vez resueltas las investigaciones que los originaron.

---

## Próximos pasos pendientes

1. **Corregir la hoja de jerarquía** para LOMBARDO LIÑAN BETZABETH ALEJANDRA, CORREA
   VARGAS MARGARITA MARIA, URIBE BUILES YESICA ALEXANDRA y VIRGUEZ SANCHEZ KAROL
   YINETH: cambiar su `cargo` a "Asesor" (o el que corresponda) y/o corregir su
   `coordinador`, para que `perfil.supervisores` de HERNANDEZ URREGO refleje su
   equipo real.
   - ✅ Creado `app/api/debug/persona-cargo` (admin-only): devuelve `cargo`,
     `coordinador`, `servicio`, `jefeInmediato`, `estado` y la fila exacta de esas
     4 personas en ambas bases (AMX y LATAM-Socio).
   - **Pendiente**: llamar a `/api/debug/persona-cargo` logueado como admin,
     confirmar en qué fila/base está el dato incorrecto, y corregir en Sheets.

2. Tras corregir la jerarquía, regenerar el Informe IA para HERNANDEZ URREGO
   CRISTIAN ENRIQUE y confirmar que Adherencia 4DX, Prácticas Líderes,
   Monitoreos de Calidad y Pausas 4DX ya muestran datos.

3. **ALZATE ARROYAVE DANIEL FELIPE** (cargo "JEFE DE OPERACION", normaliza a
   `"jefatura"`) no aparece en el listado de coordinadores de la Vista Admin.
   Definir enfoque: ¿agregar "jefatura" como rol seleccionable en la Vista Admin,
   o mapear ese cargo a "coordinador" en `normalizarCargo`?

4. **Endpoints de debug acumulados** (`app/api/debug/*`): revisar periódicamente
   cuáles siguen siendo necesarios y retirar los que ya no apliquen.

5. **`npx tsc --noEmit`** — verificar que no quedan errores de TypeScript antes de
   cada push (convención del proyecto).

6. **Commit + push** a master (siempre requiere confirmación explícita del usuario).

---

## Convenciones de fechas

- Hoja Sheets → `dd/mm/yyyy` (LATAM) → `parseSheetDate` produce `Date`
- Hoja Confirmaciones → `2026-06-01 12:02` (ISO con guiones) → mismo helper, regex ISO
- Semanas ISO → `resolverSemana` normaliza a número puro (strip non-digits)
- Comparaciones de semana: siempre normalizar con `normalizarSemana`/`normSemana`
  antes de comparar

---

## Variables de entorno requeridas

```
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
NEXTAUTH_SECRET
NEXTAUTH_URL
SPREADSHEET_ID          ← ID de la hoja maestra
```

(Adicionalmente, el informe IA requiere credenciales de Vertex AI configuradas
para `lib/vertex.ts` — ver ese archivo para el detalle exacto de variables.)

---

## Notas de despliegue

- **Vercel**: todas las rutas de módulos tienen `export const dynamic = "force-dynamic"`
  + `revalidate = 0` + `Cache-Control: no-store` para evitar edge cache.
- **PCA route**: usa `private, max-age=120, stale-while-revalidate=60` porque la hoja
  tiene ~19k filas — se admite cache breve del lado del cliente, además de la caché
  compartida en memoria de `lib/sheets.ts`.
- Build TS: correr `npx tsc --noEmit` (y `npx eslint <archivos>`) antes de cada push
  para detectar errores de tipo/lint.
- Los pushes a `master` se despliegan automáticamente en Vercel (1-2 min). Si un
  endpoint nuevo da 404 tras el push, revisar la pestaña "Deployments" — puede
  necesitar un commit adicional (incluso vacío) para disparar el build si el primero
  no se detectó.

## Nombres completos en todas las tarjetas (2026-06-12)

Se eliminó el recorte de nombres de personas (supervisores, coaches, asesores,
líderes acompañados, jefaturas, agentes) en todos los módulos y vistas (coach,
coordinador, supervisor, admin). Antes muchos componentes hacían
`nombre.split(" ").slice(0, 2 o 3).join(" ")` y/o aplicaban `truncate
max-w-[Npx]` (que corta con "..."), lo que recortaba nombres largos. Ahora se
muestra el nombre completo (`{nombre}` sin `.split`) con la clase `break-words`
(en vez de `truncate`) para que el texto haga salto de línea si no entra, sin
perder información. Archivos afectados: `ConfirmacionesRol.tsx`,
`Adherencia4DX.tsx`, `AdherenciaPCA.tsx`, `Compromisos.tsx`,
`EstoyEnterado.tsx`, `Feedback.tsx`, `PracticasLideres.tsx`, `Pausas4DX.tsx`,
`QuizSemanal.tsx`, `SeguimientoCoach.tsx`, `Resolutividad.tsx`,
`CoachTeamView.tsx` (incluye el dropdown de coordinadores) y `AdminView.tsx`
(selector "Ver como"). No se tocaron `titulo`/`descripcion` de `ModuloCard.tsx`
ni campos no-nombre (ej. `ritual`, `causa`, `etapa`, `label`).

## Grillas diarias Lun-Vie en tarjetas agregadas de coordinador (2026-06-12)

A petición del usuario, las tarjetas "Por X" en vista coordinador ahora muestran
una grilla compacta Lun-Vie con el cumplimiento diario del equipo/persona, no
solo el % general. Aplicado a los 4 módulos con métricas diarias:

- **`SeguimientoCoach.tsx`** (Prácticas Coach, "Por coach"): se agregó
  `dias: deEstaSemana` a cada `CoachRow` en
  `app/api/modulos/seguimiento-coach/route.ts` (registros de la semana actual
  del coach). El componente extrajo la grilla existente a un componente
  compartido `GridDias` (verde = `cumple==="1"`, rojo = no cumplió, gris = sin
  dato) y la reutiliza tanto en la vista individual como en cada tarjeta de
  coach del coordinador.
- **`Adherencia4DX.tsx`** ("Por supervisor"): nuevo componente
  `GridDiasEquipo` que, para cada supervisor, promedia `cumple` de
  `data.registros` (ya incluye `jefe`) por día de la semana activa y colorea
  con `colorPct` (verde ≥80%, amarillo ≥50%, rojo >0%, gris = sin datos). No
  requirió cambios de API.
- **`Pausas4DX.tsx`** ("Por supervisor"): nuevo componente `GridDiasEquipo`
  (parametrizado por `tipo`: "Diálogo"/"CDR") que calcula el % de
  `participo` por día a partir de `registros` filtrados por `jefe`, coloreado
  con `barColor`. Se muestran dos grillas (Diálogo y CDR) por supervisor. No
  requirió cambios de API.
- **`AdherenciaPCA.tsx`** ("Por supervisor", Monitoreos de Calidad): se agregó
  `diasSemana: { dia, total, cumpleMeta }[]` a cada `SupervisorRow` en
  `app/api/modulos/adherencia-pca/route.ts` (resultado de `combinarDias` ya
  filtrado a `semanaActual`). Nuevo componente `GridDiasEquipo` colorea cada
  día según el conteo de monitoreos vs. `META` (5/día): verde ≥5, amarillo
  ≥3, rojo <3, gris = sin monitoreos — mismo criterio que la barra "Monitoreos
  diarios" de la vista supervisor individual.

## ID por idea en Circuito de Resolutividad (2026-06-12)

A petición del usuario, cada idea/ingreso del módulo "Circuito de Resolutividad"
(`Resolutividad.tsx`) ahora muestra un identificador `#N` junto a la etiqueta de
etapa, tanto en "Últimas ideas" como en las ideas expandidas de "Por
supervisor". En `app/api/modulos/resolutividad/route.ts`, `id` = número de fila
real en la hoja "Datos" (índice del registro + 2, contando el header), calculado
antes de filtrar para que cada idea conserve su fila original. Así el ID permite
ubicar el registro exacto en la hoja de Sheets.

## "Id do Projeto" en Circuito de Resolutividad y Feedback (2026-06-12)

El usuario indicó que el identificador correcto es la columna **"Id do Projeto"**
de las hojas (no la fila calculada), y que el módulo Feedback ("feedback
interfábricas") también la tiene:

- **`app/api/modulos/resolutividad/route.ts`**: se agregó
  `iIdProyecto = idx("id do projeto")`. El campo `id` de cada idea (tanto en
  `ideas`/`ultimas5` como en `porSupervisor[].ideas`) ahora es
  `r[iIdProyecto] || String(fila)` — usa el "Id do Projeto" de la hoja si la
  columna existe y tiene valor, y cae al número de fila como respaldo. `id`
  pasó de `number` a `string` en `Resolutividad.tsx`.
- **`app/api/modulos/feedback/route.ts`**: se agregó la misma
  `iIdProyecto = idx("id do projeto")` y un campo `id: r[iIdProyecto] ?? ""`
  en cada feedback (`feedbacks` y `porSupervisor[].items`). En
  `Feedback.tsx`, se añadió `id: string` a `FeedbackItem` y un badge `#{f.id}`
  (solo si `f.id` no está vacío) junto a la etiqueta de estado, tanto en la
  lista principal como en el detalle "Por supervisor".

## Renombrar/reordenar módulos y etiquetas de datos en Informe IA (2026-06-12)

A pedido del usuario:

- **Renombrar "Adherencia 4DX" → "Medidas de Dirección"**, con descripción
  actualizada de "Ingresos diarios del equipo" a "Ingresos diarios,
  resolutividad y productividad del equipo". El `id` interno (`"adherencia"`)
  no cambió, por lo que las rutas API y `Adherencia4DX.tsx` no requirieron
  cambios.
- **Renombrar "Prácticas Líderes" → "Prácticas Líderes 4DX"** (se agrega la
  sigla). El `id` (`"practicas_lideres"`) no cambió.
- **Reordenar "Pausas 4DX"** para que aparezca inmediatamente después de
  "Prácticas Líderes 4DX" en la lista de módulos del dashboard (antes estaba
  más abajo, junto a "Estoy Enterado"/"Agenda del líder").

Originalmente estos cambios estaban duplicados en arrays locales de
`app/page.tsx`, `app/preview/page.tsx`, `app/demo/page.tsx`,
`app/demo/real/page.tsx`, `components/AdminView.tsx` y
`components/CoachTeamView.tsx`.

Actualización 2026-06-16: el catálogo visual de módulos se centralizó en
`lib/modulos.ts`. Es la fuente de verdad para títulos, descripciones, iconos,
orden del rol híbrido "Coordinador Coach" y orden de la vista de equipo coach.
No se tocaron `components/InformeIA.tsx` ni `lib/informes-prompt.ts`, que tienen
su propio sistema de títulos de sección para el informe IA (`case "Adherencia
4DX":`, `case "Prácticas Líderes":`, `case "Pausas 4DX":`) — son listas
separadas, distintas de las tarjetas del dashboard.

- **Etiquetas de datos en gráficas del Informe IA**: se agregó
  `<LabelList>` (de `recharts`) a cada `<Bar>` en `GraficaBarras` (con
  formato `valor` o `valor%` según `unit`, posición "right" o "inside" si es
  apilada) y al `<Bar>` de la sección "Agenda del líder" (formato `N d`).

## Envío del Informe IA por correo, solo desde la vista admin (2026-06-12)

El usuario pidió poder enviar el Informe IA por correo, con las gráficas
embebidas en el cuerpo (no como adjunto), y que esta opción solo exista en
la vista admin (los demás roles no la necesitan).

- **`lib/informe-render.ts`** (nuevo): se extrajo de
  `components/InformeIA.tsx` toda la lógica pura (sin React/Recharts) que
  ahora comparten el dashboard y el correo: `nombreCorto`, `dividirSecciones`,
  `ORDEN_SECCIONES`, `COLORES`, las funciones `data*` que construyen las
  filas de cada gráfica a partir de `DatosInforme`, y un nuevo mapa
  `SECCIONES_GRAFICA` que describe, por título de sección, qué función de
  datos, series, `domain`/`unit`/`stacked` usa cada gráfica de barras. También
  exporta el tipo `ResultadoInforme`.
- **`components/InformeIA.tsx`**: ahora importa todo eso desde
  `lib/informe-render`; `graficaSeccion` usa `SECCIONES_GRAFICA` para el caso
  genérico (antes era un switch con un `<GraficaBarras>` por sección
  duplicando la config). Sin cambios visuales.
- **`lib/informe-email.ts`** (nuevo): construye el HTML del correo
  (`construirCorreoInforme(resultado)`). Las gráficas de barras se
  representan como **tablas HTML** (`<table>`/`<td bgcolor>`) — compatibles
  con Gmail/Outlook sin imágenes ni JS — replicando la config de
  `SECCIONES_GRAFICA`: barras agrupadas (una fila por serie) o apiladas
  (segmentos de color con leyenda), igual que en el dashboard. El texto del
  informe (markdown simple `**negrita**`/`- viñetas`) se convierte a HTML.
- **`app/api/informes/enviar/route.ts`** (nuevo): `POST`, valida sesión y
  que `perfil.rol === "admin"` (mismo patrón que `app/api/debug/*`), recibe
  `{ destino, resultado }`, valida el formato del correo destino y envía el
  HTML construyendo un mensaje MIME (`raw` en base64url) y llamando a
  **Gmail API** (`gmail.users.messages.send`) con el `accessToken` de la
  sesión de Google del admin — el correo sale desde la propia cuenta de
  Google del admin que está logueado, sin necesidad de dominio propio ni
  proveedor externo. Si el token no tiene el scope `gmail.send` (cuentas que
  iniciaron sesión antes de este cambio), responde 403 pidiendo cerrar
  sesión y volver a iniciarla para re-autorizar.
- **`lib/authOptions.ts`**: se añadió el scope
  `https://www.googleapis.com/auth/gmail.send` al `GoogleProvider`. Como
  `prompt: "consent select_account"` ya fuerza consentimiento en cada login,
  basta con que el admin cierre sesión y vuelva a iniciarla para obtener un
  token con permiso de envío.
- **`components/InformeIA.tsx`**: nuevo prop `permitirEnvioCorreo?: boolean`.
  Cuando es `true` y hay un informe generado, se muestra un campo de correo
  + botón "Enviar por correo" que llama a `/api/informes/enviar`.
- **`components/AdminView.tsx`**: pasa `permitirEnvioCorreo` a `<InformeIA>`
  (es el único lugar donde se usa). El resto de vistas (dashboard normal,
  `app/page.tsx`) no lo pasan, por lo que no aparece esa opción.
- Se evaluó usar Resend, pero el usuario no tiene dominio propio (Resend sin
  dominio verificado solo permite enviar a la dirección del propio dueño de
  la cuenta) y su cuenta de correo es Outlook/Microsoft 365 corporativa
  (SMTP con auth básica deshabilitado por Microsoft en la mayoría de
  tenants, y Graph API requeriría registrar una app en Azure AD con
  consentimiento de administrador). Se optó por reusar el OAuth de Google ya
  existente (Gmail API), que no requiere dominio ni infraestructura nueva.
  Se quitó la dependencia `resend`.

### Pendiente de configuración (no hecho por el agente)
1. El admin debe cerrar sesión y volver a iniciarla con Google para que el
   token incluya el nuevo scope `gmail.send` (la primera vez que se intente
   enviar un correo sin haber hecho esto, la API responderá 403 con un
   mensaje indicando que debe re-loguearse).
2. No se requiere ninguna variable de entorno nueva ni dominio propio.

## Enriquecer el Informe IA con detalle accionable por práctica (2026-06-12)

El usuario pidió que el informe narrativo (no necesariamente las gráficas)
profundice en datos puntuales por práctica para que el coordinador pueda
accionar directamente. Cambios solo en la capa de datos (`lib/informes.ts`)
y el prompt (`lib/informes-prompt.ts`); sin cambios en gráficas/dashboard.

- **Prácticas Líderes 4DX** (`PracticasLiderSemana`): nuevo campo
  `diasSinIngreso: string[]` — nombres (en español) de los días hábiles
  (lunes a viernes) sin ningún registro de práctica esa semana, calculado en
  `aggPracticasLideres` a partir de la columna "fecha" (`dd/mm/yyyy`,
  parseada con `parseFechaDDMMYYYY`, nueva función auxiliar) de
  "Resumen_Lideres_Diario_Historico_8Sem".
- **Monitoreos de Calidad** (`PcaPtaSemana`): nuevos campos
  `monitoreosPorDia: { dia, total }[]` (cantidad de monitoreos por día
  hábil) y `diasSinIngreso: string[]` (días hábiles sin ningún monitoreo),
  calculados en `aggPcaPta` a partir de "dia semana"/"total gestion dia" de
  "Detalle Eventos".
- **Circuito de Resolutividad** (`ResolutividadResumen`, antes era solo
  `{ total, pctImpl, pctBacklog }`): ahora incluye `metaImpl` (meta de
  implementación ponderada por jefatura de las ideas del líder, igual
  cálculo que `/api/modulos/resolutividad`, con fallback 23%),
  `idsAplicados: string[]` (ids "Id do Projeto" de ideas en etapa
  "Aplicados") e `idsGuardian: string[]` (ids en etapa "Lider Guardião").
  Se extendió `normalizarEtapaResolutividad` para reconocer variantes de
  "lider_guardiao"/"lider guardião" → "Lider Guardião" (antes quedaban sin
  categorizar).
- **Feedback Interfábricas** (`FeedbackResumen`, antes
  `{ total, nuevos, gestionados, rechazados }`): nuevo campo
  `idsNuevos: string[]` con los ids "Id do Projeto" de los feedbacks en
  estado "nuevo" (sin gestionar).
- **Compromisos** (`CompromisosSemana`): nuevo campo
  `nombresSinIngreso: string[]` con los nombres de los asesores que no
  registraron compromiso esa semana.
- **Pausas 4DX** (`CopilotSemana`): nuevo campo
  `participacionPorDia: { dia, pctDialogo, pctCDR }[]` — % de participación
  en pausas de Diálogo y CDR por día hábil de la semana, calculado en
  `aggCompromisosCopilot` a partir de la fecha (`yyyy-mm-dd`) de
  "Pausas 4DX Raw".
- **`lib/informes-prompt.ts`**: se documentaron todos los campos nuevos en
  la descripción de datos por práctica, y se ajustaron las instrucciones de
  "Focos" de cada sección para que la IA los use: Prácticas Líderes 4DX y
  Monitoreos de Calidad mencionan los días concretos sin ingreso (y
  Monitoreos también la cantidad por día); Resolutividad pone el foco en
  "pctImpl" vs. "metaImpl" y detalla los ids de "idsAplicados"/"idsGuardian"
  a gestionar; Feedback pone el foco en "nuevos" con los ids de
  "idsNuevos"; Compromisos pone el foco en la cantidad/nombres de
  "nombresSinIngreso"; Pausas 4DX usa "participacionPorDia" para señalar
  días de baja participación.
- Nueva constante auxiliar `NOMBRES_DIA_SEMANA` (domingo..sábado) en
  `lib/informes.ts`, usada por las prácticas anteriores para traducir
  `Date.getDay()` a nombres de día en español.

## % Resolutividad y % Productividad por supervisor en Adherencia 4DX (2026-06-19)

La hoja `Cumplimiento_Diario_MCI` tiene tres columnas de cumplimiento separadas:
`Cumple_Día`, `Resolutividade` y `Produtividade`. El dashboard solo usaba
`Cumple_Día` (métrica combinada, más estricta), ignorando las otras dos, mientras
que paneles anteriores del usuario calculaban cada una por separado.

Cambios aplicados:

- **`app/api/modulos/adherencia-4dx/route.ts`**: lee las columnas `Resolutividade`
  y `Produtividade`. En el resumen por supervisor (vista coordinador) calcula
  `pctResol` y `pctProd` con la misma lógica del panel anterior:
  `AVG(CASE WHEN campo > 0 THEN 1 ELSE 0 END)` sobre los registros de la semana.
- **`components/modulos/Adherencia4DX.tsx`**: muestra `Resol: X%` y `Prod: X%`
  debajo de cada tarjeta de supervisor en vista coordinador/admin, con el mismo
  código de colores (verde ≥80%, amarillo ≥50%, rojo <50%).
- **`lib/informes.ts`**: extiende `Adherencia4dxSemana` con `pctResol` y `pctProd`;
  los calcula en `aggAdherencia4dx` para incluirlos en el JSON del informe IA.
- **`lib/informes-prompt.ts`**: describe al LLM el significado de `pctResol` y
  `pctProd`, e instruye señalar brechas cuando alguno sea notablemente inferior a
  `pct` (Cumple_Día).

Nota: `pct` (Cumple_Día) se mantiene como métrica principal. `pctResol` y
`pctProd` son complementarias — un supervisor puede tener 40% en `pct` (ambos
campos deben valer >0) pero 55% en cada dimensión por separado.

## Gráfica de Monitoreos de Calidad — desglose diario (2026-06-19)

En `lib/informe-render.ts`, la sección "Monitoreos de Calidad" del informe IA
reemplazó las dos barras anteriores (% cumplimiento + días con datos) por
**5 barras Lun/Mar/Mié/Jue/Vie** con el total de monitoreos de cada día por
supervisor, usando el campo `monitoreosPorDia` ya disponible en `PcaPtaSemana`.

La constante `DIAS_SEMANA` (exportada) mapea clave interna → nombre en la hoja
(ej. `"mie"` → `"miércoles"`) para el match exacto con los registros. El cambio
aplica automáticamente al correo (que usa el mismo `SECCIONES_GRAFICA`).

## Informe parcial — no alertar sobre días futuros (2026-06-19)

En `lib/informes-prompt.ts`, el contexto del informe parcial ahora incluye
explícitamente tres listas:

- **Días ya cerrados** (pueden evaluarse como ausencia/problema)
- **Día en curso** (aún puede registrarse — no es ausencia)
- **Días que aún no han ocurrido** (el LLM tiene instrucción explícita de NO
  alertar sobre falta de datos en estos días)

Antes el LLM alertaba sobre "jueves y viernes sin monitoreo" en un informe
generado el jueves por la mañana, porque no distinguía entre días pasados y
días futuros/en curso.

## Nombre de pila en el header (2026-06-19)

En `app/page.tsx`, el saludo "Hola, X" y el nombre en el header ahora muestran
el **nombre de pila** del usuario en vez del primer apellido.

- El campo `persona.nombre` viene como `"APELLIDO1 APELLIDO2 NOMBRE1 [NOMBRE2]"`
  (convención LATAM: 2 apellidos + 1-2 nombres).
- `extraerNombres(n)`: toma las palabras desde la posición 2 y las convierte a
  título case → `"VELASQUEZ CARTAGENA ALEJANDRO"` → `"Alejandro"`,
  `"MENA CUESTA LAURA DANIELA"` → `"Laura Daniela"`.
- El nombre completo en el header también pasa a título case
  (`"VELASQUEZ CARTAGENA ALEJANDRO"` → `"Velasquez Cartagena Alejandro"`).
- Fallback: si no hay perfil, usa la primera palabra de `session.user?.name`.

---

## Panel de Control (Vista Admin) — 2026-07-08

A petición del usuario, se agregó un resumen ejecutivo arriba de los filtros
de "Seguimiento Administrativo" en `AdminView.tsx`, para que el admin tenga
una foto de toda la operación antes de tener que elegir rol/servicio/persona.
Dos piezas, montadas juntas en `PanelControlAdmin.tsx`:

1. **KPI cards globales**: % ponderado de cada práctica (no promedio de
   promedios) sumando los datos crudos de **todos los coordinadores reales**,
   con tendencia vs. semana anterior.
2. **Heatmap por coordinador**: una fila por coordinador real × una columna
   por práctica, coloreada por qué tan cerca está de su meta.

### Fuente de datos

`lib/panelControl.ts` (`construirPanelControl`) reutiliza los mismos `agg*`
de `lib/informes.ts` que ya usa el Informe IA (evita reimplementar la lógica
de negocio), pero:

- Solo recorre los **coordinadores reales** — jefes inmediatos de los 41
  líderes de `lib/equipoAdmin.ts` (`filtrarPorRol`), NO los ~40 supervisores.
  `lib/equipoAdmin.ts` es la extracción de esa lógica, que antes vivía
  duplicada dentro de `AdminView.tsx` — ahora ambos la importan del mismo
  lugar para no poder desincronizarse.
- Pide `semanas: [semanaAnterior, semanaActual]` explícitamente y calcula el
  rollup ponderado de cada semana por separado (en vez de usar el campo
  `tendencia` que devuelve `construirDatosInforme`, que no aplica igual a
  todas las prácticas) — así el cálculo del delta es uniforme entre módulos.
- **`adherencia_pca` (Monitoreos de Calidad)**: NO usa el `pct` que devuelve
  `aggPcaPta` de `lib/informes.ts` (esa es la nota de calidad antigua, ver
  sección "% de cumplimiento = volumen vs. meta semanal" arriba) — se
  recalcula aquí como `min(100, totalMonitoreos / 25 * 100)`, la misma
  definición que ya usa `app/api/modulos/adherencia-pca/route.ts`. Es un bug
  de fondo en `lib/informes.ts` (el Informe IA y el correo todavía muestran
  la nota de calidad vieja para esta práctica) que quedó fuera de este
  cambio — pendiente evaluar si vale la pena corregirlo ahí también.
- Gracias a la caché compartida de `lib/sheets.ts`, recorrer varios
  coordinadores no dispara una lectura de Sheets por cada uno — todos piden
  la misma hoja+rango completa y se filtran en memoria, así que solo hay una
  lectura real por hoja (ver el incidente de cuota más abajo, donde esto
  terminó siendo relevante de todas formas por el volumen total).

### Metas por práctica (`meta`, `metaInvertida`, `metaTexto`, `secundario`)

Cada práctica del panel tiene una meta real distinta, no un umbral fijo
80/50 genérico — el color del semáforo se calcula contra la meta de cada
una (`tono()` en `lib/panelControl.ts` y su espejo en `PanelControlAdmin.tsx`):

| Práctica | Meta | Notas |
|---|---|---|
| Adherencia (Medidas de Dirección) | 100% | cumplimiento diario acumulado |
| Prácticas Líderes 4DX | 100% | ídem |
| Monitoreos de Calidad | — (`metaTexto`: "25 monitoreos/semana") | ya normalizado 0-100 contra esa meta |
| Compromisos | 100% | % con al menos un ingreso |
| Quiz Semanal | 100% | % que presentó |
| Circuito de Resolutividad | **% Implementación** (Seleccionados/total), meta **dinámica por jefatura** (`metaImpl`, fallback 23%, promedio ponderado en el rollup global) | secundario: **Backlog** (Aplicados/total), meta fija **≤10%**, `metaInvertida: true` (menor es mejor) |
| Pausas 4DX | **Diálogo**, meta **80%** de participación | secundario: **CDR**, meta **80%** también (no confundir con el CDR de Prácticas Líderes 4DX, que no tiene meta fija porque varía por servicio) |
| Feedback Interfábricas | % gestionado (sin meta fija) | secundario: conteo simple de "Pendientes" (nuevos sin gestionar) |

El campo `secundario` (`{ label, texto, tono }`) se calcula 100% en el
servidor (no en el componente) para que la UI solo tenga que pintar texto,
sin reimplementar lógica de negocio.

- Se agregaron dos etiquetas visuales (`SUBLABEL` en `PanelControlAdmin.tsx`)
  para dejar explícito cuál de las dos métricas es el número principal de la
  tarjeta cuando el título del módulo por sí solo es ambiguo: Resolutividad
  muestra "% Implementación" arriba del número, Pausas 4DX muestra "Diálogo".
  Antes de este ajuste el usuario reportó confusión porque el número grande
  no decía a cuál de las dos métricas correspondía.

### Selector de semana — clamp

El botón "siguiente semana" del panel podía avanzar indefinidamente a
semanas futuras sin datos. `construirPanelControl` calcula `semanaActualReal`
(la semana ISO real de "hoy", `semanaISOActual()` en `lib/semana.ts`) y
hace *clamp* si el parámetro pedido la supera; `PanelControlAdmin.tsx`
además deshabilita el botón "›" al llegar a esa semana.

---

## Incidente: falsos "usuario no encontrado" (2026-07-09)

Varios usuarios reales (líderes/coaches, todos con datos correctos en la
hoja) reportaron el aviso "Tu usuario no está en la base de datos" al
entrar al dashboard justo después de que se invitó a todo el equipo a
usarlo con más frecuencia. Dos causas distintas, ambas relacionadas con que
`cargarPersonas()` lee 2 hojas de personas (AMX y LATAM-Socio) con el
**token de Google de quien esté logueado**, no con una cuenta de servicio:

### Causa 1 — cuota de Sheets API excedida por usuario

- `cargarPersonas()` (`lib/jerarquia.ts`) usaba `Promise.allSettled` y
  **descartaba en silencio** cualquier hoja que fallara al cargar (cuota,
  error transitorio). Si la hoja que fallaba era justo la que tenía la fila
  de esa persona, el resultado era indistinguible de "no está registrado".
- Confirmado en Google Cloud Console (Sheets API → Tráfico): pico de ~2
  solicitudes/segundo (~120/min) en errores 429/403 durante varios minutos,
  mientras se probaba repetidamente el nuevo Panel de Control (cada carga
  dispara ~8 lecturas en paralelo). La cuota de proyecto (300/min) no se
  superaba, pero la de **"Read requests per minute per user" (60, default de
  Google)** sí — cada usuario individual (incluida la cuenta admin haciendo
  las pruebas) tiene su propio balde de 60/min.
- **Fix**: se solicitó y aprobó el aumento de esa cuota a 300 (igual al
  límite de proyecto) desde Google Cloud Console. Además, el TTL de la caché
  compartida de `lib/sheets.ts` subió de 30s a 120s como colchón adicional
  (ver sección de esa librería arriba).

### Causa 2 — hoja "Socio" (LATAM) sin acceso compartido a nivel de dominio

- Un usuario (`ALISON MORENO MARIN`) reportó el mismo aviso; el mensaje de
  error (ver "Fix de mensajes" abajo) mostró explícitamente
  `"The caller does not have permission"` — un 403 de **permisos de Drive**,
  no de cuota. Al revisar en Google Cloud Console / Drive, la hoja de
  personas **LATAM-Socio ("Socio")** era la única de las ~10 hojas + 1
  carpeta de Drive que usa la app que NO tenía activado el acceso por
  dominio (`latam.com`) — se corrigió compartiéndola a nivel de dominio,
  igual que las demás.
- **Importante — punto ciego del diagnóstico**: para investigar los casos de
  Mahide Santiago y Lucero Castro se usó `/api/jerarquia/test?email=X`, que
  llama a `obtenerPerfil()` con **el token del admin que corre la prueba**,
  no con el de la persona afectada — solo cambia qué correo busca dentro de
  los datos que el admin sí puede leer. Como el admin tiene acceso directo
  (no depende del compartido por dominio), esas pruebas "confirmaron" que
  los datos estaban bien sin poder detectar un hueco de permisos específico
  de la cuenta real de la persona. Es decir: este endpoint sirve para
  verificar datos/matching, pero NO sirve para descartar un problema de
  permisos de Drive/Sheets del usuario afectado — hay que revisar eso por
  separado (Drive → Compartir → nivel de dominio) cuando el error explícito
  diga "does not have permission".
- **Lista completa de recursos de Google que la app lee**, para revisar
  cuando se agregue una cuenta o dominio nuevo (todos deben tener acceso de
  **Lector**, idealmente compartido a nivel de dominio en vez de cuenta por
  cuenta):

  | Recurso | ID | Usado por |
  |---|---|---|
  | Base AMX (personas) | `1veAlRJlVrJ2MRtoYNi3aJ_NX97sBFTgcww0V0jv6_Q0` | `cargarPersonas` |
  | Base LATAM-Socio (personas) + Circuito de Resolutividad | `1tmFJQ4EJaUTCbogu11klf7GSzXpzevn7gw3U84Rw3zM` | `cargarPersonas`, `aggResolutividad` |
  | Cumplimiento_Diario_MCI / Resumen_Líderes / Confirmaciones de Rol | `1UN-wQKOh1z9M4K4LUJiY1prj26Lo2taVR-szVhx-Gso` | Adherencia 4DX, Prácticas Líderes, Confirmaciones de Rol, Seguimiento Coach |
  | Detalle Eventos (PCA/PTA) | `1MZiP7K4JbElp3lM2n0Tr554WNN1RTfGlsgCB9uJ8tSw` | Monitoreos de Calidad |
  | Alertas (Pauta de Calidad) | `1MVyZW1N45iQgDiii6cnCFBCwFl4zk6B5s4ScqkwNF-U` | Monitoreos de Calidad |
  | Compromisos histórico | `1eGoB7lIMvOfMB71g3S0IQZx5xtbNzwcOFSEqnXG4IuU` | Compromisos |
  | Quiz Data2 | `1ElOVG-6SQZt_ZjnWKY7vUcWK78Zgm4dr4xZv3a5iA2k` | Quiz Semanal |
  | Estoy Enterado | `1sxqnABVcemnPaWivLHmW1SDChBSBQyBYGTAN3sb9q44` | Estoy Enterado |
  | Feedback Interfábricas | `1gd_ldwaaCCVVTV4iSh7oW9GHLyntWmmBQmfOo8Z1WtU` | Feedback |
  | Pausas 4DX Raw | `17Jftow3b5V9AFhndlt1MNe6ZBKQD1xBCrQfNqM0vDl4` | Pausas 4DX |
  | Carpeta "Agenda" (Drive, no Sheets) | `1LqXqtOOydr-qB4KTWWp0t8SCC_rivZjl` | Agenda del líder |

### Fix de mensajes — distinguir "no encontrado" de "no se pudo cargar"

Antes, cualquier error (404 real o 500 transitorio) mostraba el mismo texto
genérico "Tu usuario no está en la base de datos — contacta a tu
coordinador", lo cual mandaba a diagnosticar en la dirección equivocada.

- `app/api/jerarquia/route.ts`: ya devolvía 404 solo para "no encontrado" y
  500 para cualquier excepción — sin cambios aquí, el problema estaba en el
  cliente.
- `hooks/usePerfil.ts`: ahora expone `noEncontrado` (`true` solo si el
  status fue 404).
- `app/page.tsx`: si `noEncontrado` es `true`, muestra el aviso amarillo de
  siempre ("contacta a tu coordinador") + el correo exacto que se buscó
  (antes se descartaba el mensaje real del backend y siempre se mostraba un
  texto fijo). Si es `false` (fallo transitorio/permisos), muestra un aviso
  naranja distinto: "No pudimos cargar tus datos en este momento — recarga
  la página en unos segundos", con el detalle técnico debajo.
- `lib/jerarquia.ts`: `cargarPersonasDetallado()` (interna) solo lanza error
  si **todas** las bases fallan (sin nada utilizable) — si al menos una
  carga bien, sigue siendo tolerante como antes. `obtenerPerfil()` solo
  escala a "no se pudo verificar" (mensaje naranja) cuando la persona **no
  aparece Y hubo alguna falla parcial** (caso ambiguo); si la encuentra pese
  a la falla parcial, no hay ningún aviso — mismo comportamiento de siempre.
  (Un primer intento de este fix lanzaba error ante *cualquier* falla
  parcial sin importar si afectaba a la persona buscada, lo cual bloqueaba
  a todos los usuarios cuyo perfil vive en la base que sí cargaba bien —
  corregido antes de que llegara a producción... salvo por el caso de
  Alison, que sí lo alcanzó a ver desplegado y sirvió para detectar la
  Causa 2 de este incidente.)
- `app/api/debug/persona-cargo/route.ts`: se agregaron los campos `email` y
  `usuarioGestor4` a la respuesta (antes solo mostraba cargo/servicio/
  coordinador/estado, sin correo) — necesario para poder comparar el correo
  cargado en la hoja contra el correo real con el que alguien inicia sesión.

### Lista de administradores (2026-07-09)

`ADMIN_EMAILS` en `lib/jerarquia.ts`: se agregaron
`arodriguez.almacontact@outsourcing-account.com` y
`andresfelipeurrego.almacontact@outsourcing-account.com`; se quitó
`fabian.galeano@latam.com`.
