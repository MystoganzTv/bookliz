# Bookliz — Auditoría profunda (11 sep 2026)

**Baseline:** repo en `~/Developer/Bookliz`, HEAD `0d2259d` + trabajo del 10/08 sin commitear (marcador de sync, fallback de carga, `expo install --fix`, 2 suites nuevas). `tsc --noEmit` limpio, **381/381 tests** en 20 suites, i18n **717 = 717** claves EN/ES sin placeholders desalineados, 0 `t("…")` huérfanos.

Todo lo que sigue es **nuevo** respecto a `AUDIT.md` (28/07) y `REVISION_2026-08-10.md`, salvo la sección final de "reabiertos". Cada hallazgo se verificó leyendo el código; ninguno lo detecta tsc ni la suite, porque los tests mockean `supabase: null` y `upsert` — **ninguna ruta real de Supabase está cubierta**, y ahí está lo peor.

---

## Diagnóstico en una frase

La app local funciona; **el sync en la nube no ha podido funcionar nunca con el esquema que hay en el repo**, y cuando falla a medias, el mecanismo de conflicto del 10/08 hace que la nube vacía gane y te deje la biblioteca en un backup que ninguna pantalla muestra. Eso, más un bloque de bugs de pantallas que son "cosas que no cuadran" sin ser crashes — probablemente lo que notas.

---

## P0 — Pérdida de datos o función rota de raíz

### P0-1 · `upsert(..., { onConflict: "id" })` contra tablas con PK `(user_id, id)`
`src/data/booklizRepository.ts:464,472,480,488,496` vs `supabase/migrations/20260526_create_booklio_core.sql:28,58,80` (+ reviews, user_lists).
Postgres exige un índice único **exactamente** sobre las columnas del `ON CONFLICT`. No existe ninguno sobre `id` solo → `42P10 no unique or exclusion constraint matching the ON CONFLICT specification`. Solo el perfil (`onConflict: "user_id"`, PK simple) sube. `saveSupabase` lanza en `booklio_authors`, `syncState = "error"` para siempre y se encola un `full_sync_needed` cada 10 s.
**Escenario:** cualquier usuario con ≥1 autor que inicie sesión. *Salvo que el esquema desplegado en el dashboard difiera de las migraciones — verifícalo.*
**Fix:** `onConflict: "user_id,id"` en las cinco llamadas (o quitar `onConflict`: PostgREST usa la PK).

### P0-2 · Un push parcial deja una "nube válida pero vacía" que gana en el siguiente arranque
`booklizRepository.ts:417-430` + `:230-274`.
`saveSupabase` no es atómico (perfil → authors → books → …). Si falla después del perfil (P0-1, P0-3, P0-4 o simplemente red a medias), en la nube queda una fila de perfil y el resto vacío. `loadSupabase` trata "hay perfil" como "hay snapshot" y devuelve `{books: []…}`. En `resolveAgainstLocal` el marcador es `null` (nunca hubo push completo) → `localHasUnsyncedWork = false` → **la nube vacía gana**, se escribe sobre `booklio:v2` y el usuario ve la biblioteca vacía. El local va a `CONFLICT_BACKUP_KEY`, que **ninguna pantalla expone** (`grep conflictBackupAt src` → solo el contexto).
Con el esquema actual esto le pasa a **todo** usuario que inicie sesión y reabra la app.
**Fix:** push transaccional (RPC `booklio_save_snapshot(jsonb)`), o al menos escribir `push_completed_at` en el perfil **al final** y que `loadSupabase` devuelva `null` si no está. Y una UI de "Restaurar copia anterior" para el backup.

### P0-3 · `co_author_names` / `co_author_ids` no existen en ninguna migración
`booklizRepository.ts:715-716` las escribe; `grep co_author supabase/` → nada. PostgREST → `PGRST204 column not found` → el upsert de libros falla siempre, incluso con `null`. (Ya estaba anotado como "migración pendiente" el 10/06; sigue sin estar en el repo.)
**Fix:** `alter table booklio_books add column if not exists co_author_names text[], add column if not exists co_author_ids text[];` como migración versionada.

### P0-4 · Trigger de `booklio_reviews` escribe una columna que no existe
`supabase/migrations/20260527_add_reviews.sql:16-18`: la tabla tiene `synced_at`, el trigger ejecuta `booklio_set_updated_at()` (`new.updated_at = …`) → `42703 record "new" has no field "updated_at"` en cualquier UPDATE. Como cada save re-upserta todas las reseñas, **en cuanto una reseña exista en la nube, todos los saves posteriores fallan** (las listas, que van después, nunca suben).
**Fix:** función propia que asigne `new.synced_at`, o añadir `updated_at`.

### P0-5 · Cambiar de cuenta en el mismo dispositivo sube la biblioteca de A a la cuenta de B
`GoogleConnectionCard.tsx:272-286` (`handleDisconnect`) → `disconnectIdentityAccount` (`BooklizContext.tsx:1634-1642`) solo limpia el perfil. Libros y `LOCAL_SYNC_MARKER_KEY` se quedan; el `setProfile` dispara un persist local → `local.updatedAt ≠ marker`. Entra B → `resolveAgainstLocal` ve "local ahead" → biblioteca de A gana, `localAheadOfRemote` → `persistNow(false)` → upsert + `pruneOrphans` **borra las filas de B** que no estén en la de A. Si B es nuevo también se sube la de A. Ni snapshot ni marcador llevan `user_id`.
**Fix:** guardar `ownerUserId` en snapshot y marcador; si `session.user.id` difiere, invalidar marcador (nube gana) y no pushear sin confirmación. Mínimo: que Disconnect haga el wipe de `clearLibrary`.

### P0-6 · Un dispositivo **sin cambios** sobrescribe el trabajo de otro
`BooklizContext.tsx:989-994` + `booklizRepository.ts:516`.
Al pasar `hydrated` a `true` el efecto local dispara `persistNow(true)`; `createBooklizSnapshot` genera **un `updatedAt` nuevo aunque el contenido sea idéntico** al que acaba de escribir `resolveAgainstLocal` (cuyo `updatedAt` = marcador). Desde ese instante `local.updatedAt ≠ marker`. Si la app muere antes del push trailing de 10 s, o estaba offline, el siguiente arranque con red considera el local "adelantado", aparca la nube y **la sube entera con prune**.
**Escenario:** móvil abre la app offline y la cierra (0 ediciones). iPad añade 20 libros. Móvil arranca con red → su copia antigua gana → los 20 libros desaparecen de la nube. Distinto de P0-B2 (que exigía ediciones en ambos lados). Efecto colateral: cada arranque = subida completa de 6 tablas sin cambios.
**Fix:** no bumpear `updatedAt` si el contenido no cambió (comparar con el último snapshot guardado), o saltar el primer disparo del efecto tras hidratar.

### P0-7 · "Delete account?" no borra nada en el servidor
`SettingsScreen.tsx:235-239` → `resetApp()` limpia AsyncStorage/SecureStore y hace `signOut()`. No toca las 6 tablas ni `auth.users`. `docs/privacy-policy.html` §6 promete "permanently erases … from our servers". App Review 5.1.1(v) exige borrado real de cuenta → rechazo probable, y la política es falsa.
**Fix:** Edge Function con service role (`delete` por tabla + `auth.admin.deleteUser`) llamada antes del `signOut`; mínimo, `delete().eq("user_id", uid)` por tabla mientras hay sesión.

---

## P1 — Bugs reales que el usuario ve

### Datos / sync
- **P1-1 · `SIGNED_IN` no aplica `reviews` ni `userLists` de la nube → el siguiente push las borra.** `BooklizContext.tsx:905-941` hace `setAuthors/setBooks/setReadingSessions/setProfile` pero no `setReviews/setUserLists` (a diferencia de `hydrate()` `:806-809`). El estado conserva las anteriores (`[]` en dispositivo nuevo), el persist local las escribe sobre el disco y a los 10 s `pruneOrphans("booklio_reviews", keepIds=[])` **borra todas las reseñas y listas de la nube**. Fix: extraer `applySnapshot(parsed)` y usarlo en ambos sitios.
- **P1-2 · Nombre/avatar editados se revierten al de Google en cada arranque y cada `TOKEN_REFRESHED`.** `:820-828` y `:930-938` aplican `persistedAccount.name` incondicionalmente. Fix: aplicar solo si `userProfile.name` está vacío o en `connectIdentityAccount`.
- **P1-3 · El handler de auth recarga y reemplaza el estado en `INITIAL_SESSION` y `TOKEN_REFRESHED`.** `:887`. `INITIAL_SESSION` llega nada más suscribirse (segunda `load()` completa tras hidratar); `TOKEN_REFRESHED` cada ~1 h → `setBooks` con arrays nuevos → alimenta P0-6, subida completa, y ediciones de los últimos 600 ms se pierden. Fix: reaccionar solo a cambio real de `session.user.id` (ref con el último uid).
- **P1-4 · Tres definiciones de "hoy".** `AddReadingSessionScreen.tsx:38`, `readingIdentity.ts:258`, `StatsScreen.tsx:391-400`, `BooklizContext.tsx:229,1315,1472` usan `toISOString().slice(0,10)` (UTC); `calculateStreaks` `:405-439` usa medianoche local. Madrid a la 01:00 → sesión fechada ayer; México a las 19:30 → fechada mañana. Rompe rachas, "mejor día", calendario, `finishDate`. Fix: helper `localDateKey()` con `getFullYear/getMonth/getDate` en todos los sitios.

### Metadata / política de idioma (el mandato estricto tiene fugas)
- **P1-5 · El escaneo por ISBN pone título y sinopsis del *work* de OL (idioma original) a una edición en otro idioma, sin gate.** `bookMetadataAggregator.ts:457,471` → `BookIntakeScreen.tsx:387,393` → `stageBook`. Escanear "Alas de sangre" (Planeta) → tarjeta con **título "Fourth Wing" + sinopsis inglesa + language "Spanish"**, y como la sinopsis tiene >40 caracteres `enrichBookInput` no la toca. `lookupByQuery` sí gatea (`:791,:831`); `lookupByIsbn` no. Fix: título = `bestEdition.title`; `canUseFieldForLanguage("description", "English", workLanguage)` sobre `workMeta.description`.
- **P1-6 · Idioma fabricado "English" cuando el proveedor no lo indica, y esa etiqueta gana el merge.** `openLibraryProvider.ts:133,298`, `googleBooksProvider.ts:145-146`, `bookLookupService.ts:377`, `bookMetadata.ts:352,670`. Muchas ediciones OL no traen `languages`; en empate por ISBN exacto `mergeEditions` (`:159`) devuelve `a` = OL "English" sobre GB "es". Toda la política estricta pivota sobre una etiqueta inventada. Fix: dejar `language` `undefined` cuando no hay dato; desempatar a favor del candidato con idioma conocido.
- **P1-7 · Foto/ISBN sin idioma → resolver en modo no estricto.** `bookPhotoIntake.ts:46,75`: sin `language`, `metadataResolver.ts:197` desactiva el bloqueo y `synopsis` = el texto más largo de cualquier candidato. Fix: dos pasos — primero idioma, luego resolver estricto.
- **P1-8 · Resultados de búsqueda de OL construyen una "edición quimera".** `openLibraryProvider.ts:297-315` (y `bookLookupService.ts:426-437`, `bookMetadata.ts:665-670`): ISBN de *cualquier* edición del work, `language[0]` sin orden, páginas = mediana, fecha `${year}-01-01` inventada. Con GB en cooldown de 429 este camino es el habitual. Fix: en OL-search solo cover/workKey; resolver la edición real por idioma antes de proponer ISBN.
- **P1-9 · En `lookupByQuery` la descripción no se recalcula cuando `bestEdition` cambia de idioma.** `:822-834`. Buscar "Dune": el work nace con la descripción inglesa, luego una edición ES más completa pasa a `bestEdition` → `language: "Spanish"` + sinopsis inglesa.
- **P1-10 · Fallback de catálogo etiqueta el work inglés como "coincidencia de ISBN".** `bookMetadataAggregator.ts:410-432` busca `knownMeta.originalTitle` y marca `isbnMatch: true`; `bookLookupService.ts:532-538` reasigna el ISBN escaneado a todos los resultados. Justo el caso que motiva `knownWorks` (ISBN de Planeta MX no indexado) acaba con portada/sinopsis inglesas.
- **P1-11 · `fetchBookMetadataByIsbn` fusiona el work en el candidato de edición.** `bookMetadata.ts:343-362` → el resolver descarta toda la edición ES (publisher/páginas legítimos) por la descripción inglesa del work, o cuela la portada inglesa del work si no hay texto. Fix: work como candidato aparte (`ol-work`, idioma desconocido).
- **P1-12 · El resolver cachea 7 días resultados parciales tras un 429.** `metadataResolver.ts:282-283` cachea con solo `title`. "Find synopsis" devuelve vacío instantáneo durante una semana. Fix: no cachear si algún job cayó por `RateLimited/Timeout` o falta `synopsis`; TTL corto para parciales.
- **P1-13 · Nombre de serie fabricado desde el ID opaco de GB.** `googleBooksProvider.ts:176` `seriesName: \`Series ${seriesVol.seriesId}\`` → se persiste "Series aBcD…" y además impide que `enrichWorkFromCatalog` consulte `knownWorks`. Fix: `undefined`.

### Pantallas
- **P1-14 · El tiempo del cronómetro se descarta.** `FloatingTimer.tsx:35-38`, `BookDetailScreen.tsx:262`, `HomeScreen.tsx:301` pasan `prefillMinutes` (`as any`); `AddReadingSessionScreen.tsx:32-36` no lo lee. Cronometras 38 min → el formulario abre con 45. Fix: añadirlo al ParamList y usarlo como `customMinutes` inicial.
- **P1-15 · Sesiones con `enjoymentRating: 7` y `difficulty: "moderate"` fijos.** `AddReadingSessionScreen.tsx:178,211`. `SessionRow` muestra "7/10" en cada fila y Stats "Disfrute 7.0/10" siempre. Dato fabricado visible. Fix: opcional + ocultar, o control en el formulario.
- **P1-16 · Libros con `pages = 0` no se pueden registrar, y en audiolibro se marcan como leídos al 50 %.** `AddReadingSessionScreen.tsx:49-67,166-167` (`totalPages = pages || 1`) + `syncBookWithSessions` `BooklizContext.tsx:513`. El intake deja `pages` desconocido a propósito; `updateBook` pone `pages: 0` tras cambio de edición; editar/borrar una sesión después completa el libro y suma una "relectura" falsa. Fix: si `pages <= 0` no tocar status/progress; en audiolibro guardar porcentaje directo.
- **P1-17 · `seriesId` nunca se asigna a libros reales.** `addBook :1270`, `updateBook :1427` solo guardan `seriesName/seriesNumber`. Consecuencia: pill de saga inerte (`BookDetailScreen.tsx:152`), "Ver saga" y "Más de la saga" nunca aparecen, `SeriesTracker`, `SeriesCompletionModal` y los logros de saga son inalcanzables salvo con mocks. Fix: `seriesId = slug(seriesName)` al crear/editar/hidratar.
- **P1-18 · "Añadir a lista" desde el menú ⋯ de Biblioteca crea una lista vacía en vez de añadir el libro.** `LibraryScreen.tsx:473` abre `CreateListSheet`, no `BookListSheet`. Fix: como `BookDetailScreen.tsx:562`.
- **P1-19 · "Editar" de Notas y Citas lleva a una pantalla que no las edita.** `BookDetailScreen.tsx:480,495` → `EditBookScreen` no renderiza `notes`, `favoriteQuotes`, `synopsis`, `genres`, `tags`, `status`, fechas (los `useState :101-126` existen; `ChipEditor`/`ToggleChip :625-694` definidos y sin usar). No hay ningún sitio en la app donde escribir notas o citas.
- **P1-20 · Escáner bloqueado con códigos no-ISBN.** `BookIntakeScreen.tsx:1306-1311` hace `setScanned(true)` + "searching…" antes de `handleBarcode`; si `parseIsbn` devuelve `null` (QR, UPC) o cae en el debounce, nadie lo resetea. Hay que salir y volver. Además `parseIsbn` (`isbnUtils.ts:89,101-107`) acepta cualquier EAN-13 con checksum válido — no exige 978/979.
- **P1-21 · Home refetcha recomendaciones remotas en cada cambio de la biblioteca.** `HomeScreen.tsx:98-100,172`: `tasteProfile` depende de `[authors, books, readingSessions, userProfile]` y `buildPersonalizedRecommendationSections` no tiene caché → cada sesión registrada = N peticiones a GB, "Picked for you" parpadea, y se quema la cuota que luego falta en búsquedas reales. Fix: cache por specs ids como `DiscoverScreen.tsx:344-353`.
- **P1-22 · Fecha de sesión sin validación.** `AddReadingSessionScreen.tsx:441-448`: se guarda "hola" o una fecha futura → `Invalid Date` en el log, `NaN` en `SessionRow`, orden roto.
- **P1-23 · Claves duplicadas y paginación infinita en catálogo.** `GenreBrowseScreen.tsx:220,325` y `AuthorBooksScreen.tsx:113,240`: sin dedupe por id entre páginas de GB; `hasMore` compara lista filtrada con total del API → `onEndReached` reintenta sin fin cuando llegan páginas vacías.
- **P1-24 · Filtro de idioma falla en libros sin `languageCode`.** `LibraryScreen.tsx:180` usa `language.slice(0,2)` → "Spanish"→"sp" ≠ "es". `addBook :1288` no deriva `languageCode` (solo `updateBook`). Libro añadido a mano en español no aparece al filtrar por español.
- **P1-25 · "Clear demo data" borra la biblioteca real.** `SettingsScreen.tsx:215-229` llama a `clearLibrary()`. Con los mocks ya fuera de la biblioteca real es un borrado total mal etiquetado.
- **P1-26 · Diálogo raíz encima de un Modal de pantalla → iOS no lo presenta.** `EditBookScreen.tsx:173-178` (`explainSiblingBlocked` con el picker de ediciones abierto) y `LibraryScreen.tsx:414-417`. Fix: cerrar sheet, abrir diálogo en `onDismiss`, como ya hace `BookContextMenu.tsx:78-93`.
- **P1-27 · `BookStatusSheet` y `BookListSheet` ignoran tema oscuro e idioma.** `BookStatusSheet.tsx:5,15-20,…`, `BookListSheet.tsx:6,97,126,…` usan `colors` estático (= light) y labels en inglés. Sheet crema sobre UI oscura. `BookContextMenu.tsx:58-74,111` también sin `t()`.
- **P1-28 · Fallo de carga de fuentes = pantalla en blanco permanente.** `App.tsx:31-40` `if (!fontsLoaded) return null` ignora el `error` de `useFonts`; el ErrorBoundary está por debajo. Fix: `const [loaded, error] = useFonts(...); if (!loaded && !error) return null;`.
- **P1-29 · La política de privacidad describe otra app.** `docs/privacy-policy.html`: afirma anuncios/IDFA/ATT (no hay SDK ni `NSUserTrackingUsageDescription`, y queda el placeholder "[insert network name…]"); §7 dice tokens en Secure Enclave — la sesión de Supabase va en AsyncStorage en claro (`src/lib/supabase.ts:12`); no menciona Google Books ni notificaciones. Nutrition Labels no cuadrarán.

---

## P2 — Calidad, deuda, config

**Datos:** `deleteBook :1127-1147` no quita el id de `userLists[].bookIds` ni purga coautores; `updateBook/addBook` no purgan el autor anterior al cambiar `authorId` → autores huérfanos en local y nube. `addReadingSession :1060-1075` sobre un libro ya `read` incrementa `readCount` sin relectura (logro "Old Favorite" falso) y una sesión parcial lo devuelve a `reading` borrando `finishDate`. `sameYear :388` parsea `YYYY-MM-DD` como UTC → libros terminados el 1 de enero no cuentan en husos negativos. `monthly :570-584` agrupa por mes sin año. `updateUserProfile :1461-1462` no permite vaciar géneros/autores (`[]` = conservar). `booklio_reading_identity` tiene migración pero nadie la lee/escribe. `hydrated=false` en `clearLibrary/resetApp` desmonta el navigator y el timer.

**Metadata:** `normalizeLanguage` (`languageUtils.ts:128-131`) toma prefijo de 2 letras en códigos de 3 (`est`→Spanish, `rum`→Russian). Placeholders fabricados de sinopsis ("Metadata imported from Open Library.", `bookMetadata.ts:563`, `bookPhotoIntake.ts:65,102`) se persisten y viajan a Supabase. ISBN `9780439023528` duplicado en `knownWorks.ts:275,287` (es Mockingjay; borrar de :275). `fetchWithTimeout` solo cubre cabeceras, no `res.json()`. Doble `encodeURIComponent` en `services/recommendationEngine.ts:75`. `topGenres` puede llevar pesos negativos (`userTasteProfile.ts:59-64`) → "Popular in <género que abandonaste>". `bookLookupService.ts` `lookupByIsbn/lookupByQuery/_lookupByQueryOld/scoreBookMatch` sin callers fuera de tests (pipeline muerto, además del doble `recommendationEngine` ya anotado). `translations.ts:380-384/1169-1173` claves literales con punto (`"format.audio"`) que `resolveKey` no resuelve (latente). Discover cache keyed sin `langCode`. Ediciones sin paginación (`limit=40`) → falso "No Spanish edition found" en works grandes.

**Pantallas / i18n:** onboarding entero en inglés y `LocalizationContext.tsx:53` arranca en `"en"` sin mirar el idioma del dispositivo — un hispanohablante ve toda la primera ejecución en inglés. `LibraryScreen.tsx:545-554` estado vacío **hardcodeado en español** (usuarios EN ven español). Decenas de strings sin `t()`: `BookIntakeScreen` (formatos, insights, "New book"/"Untitled Book"/"Uncategorized" que **se persisten en la biblioteca**, toda la vista ISBN/escáner, formulario manual), `FilterSheet` entero, `EditBook` (diálogo de borrado, placeholders, "Updated: …"), `Home`, `Settings`, `Stats`, `Profile` (niveles de lector), `SessionRow`, `FloatingTimer`, `DiscoverScreen` moods/géneros, notificaciones (`notificationService.ts:78-85`), títulos de sección y `note` de ambos recommendationEngine. Fechas siempre en `en-US` (`StatsScreen.tsx:44,402`, `ReadingLogScreen.tsx:85`, `SessionRow.tsx:25`, `AchievementsScreen.tsx:114`; `ProfileScreen` lo hace bien). `switchBook` precarga +30 páginas (`AddReadingSessionScreen.tsx:136`). 0 minutos permitidos. `EditBook` muestra "0" páginas para desconocido. `WhatsNewModal` sale a usuarios recién onboardeados. `BookStatusSheet` no ofrece DNF aunque BookDetail lo abra para "Intentar de nuevo". Dos valoraciones independientes (`review.rating` vs `userStatus.rating`). `ReadingLog` no ordena por fecha. `AuthorBooks` reinicia scroll al cambiar la biblioteca. Permiso de cámara denegado permanentemente sin atajo a Ajustes. "Volver a resultados" desde manual/foto → "Sin resultados para ''".

**Auth / config:** Apple sign-in sin nonce (`expo-crypto` instalado y sin usar). Google nativo traga el error de `signInWithIdToken` (`GoogleConnectionCard.tsx:178-190`) → "Connected" sin sesión cloud. Sin `AppState → startAutoRefresh/stopAutoRefresh`. `resetApp` no llama a `cancelDailyReminder()`; trigger DAILY sin `channelId` (Android). Portadas fotografiadas apuntan al directorio caché (`bookPhotoIntake.ts:49,69,99,126`) → iOS puede purgarlas, y se sincronizan como `file://` inútil en otro dispositivo. `expo-camera` plugin sin `microphonePermission: false` (pregunta de review evitable). `expo-constants` importado sin declarar; `expo-crypto`, `@ungap/structured-clone` declarados sin uso. `package.json` 1.0.0 vs `app.json` 1.1.0. `eas.json` sin `appVersionSource`/`autoIncrement`. `scheme: "bookliz"` sin `linking` (scheme muerto). Migración `reading_identity` no idempotente.

---

## Reabiertos / siguen abiertos de auditorías anteriores
P0-1 Google iOS placeholders (`app.json:50,57`) · P1-B IDs con `Date.now()` (`BooklizContext.tsx:487,1471,1490`) · P1-C cola sin techo y `markRetried` sin llamar (`:982`) · P1-D `isOnline` (`offlineQueue.ts:124`) · P1-E `pruneOrphans` sin trocear ni comprobar `{error}` (`booklizRepository.ts:545-556`) · P2-A `eas.json` sin env · P2-C `assetBundlePatterns` · P2-D `buildNumber` · P2-G timer sin persistir `startedAt`. P0-3 (fuente de versión) se puede dar por cerrado: `WhatsNewModal` ya usa `Application.nativeApplicationVersion`.

---

## Lo que está bien (verificado)
RLS 4 verbos × 6 tablas con `auth.uid() = user_id` y `with check`. Cero secretos en `src/`, `.env` ignorado. Todo `fetch` pasa por `fetchWithTimeout` (breaker sin bypass). `Promise.allSettled` bien indexado. Checksums ISBN correctos; los 138 ISBN del catálogo válidos. Decaimiento de `readingIdentity`, `recencyPolicy`, `editionSwitch`, `editionMatchValidation`, `metadataMergePolicy` sin fallos. `console.log` tras `__DEV__`. Todo input de usuario en URLs codificado. El proxy de OL solo escucha en 127.0.0.1.

---

## Orden de ataque sugerido

1. **Esquema + upsert** (P0-1, P0-3, P0-4): una migración nueva + `onConflict: "user_id,id"`. Sin esto la nube no existe. Comprueba primero qué esquema hay realmente desplegado.
2. **Push atómico o marcador de "push completo"** (P0-2) + botón "Restaurar copia anterior" para `CONFLICT_BACKUP_KEY`.
3. **P1-1** (dos líneas) y **P0-6** (no bumpear `updatedAt` sin cambios) y **P1-3** (solo reaccionar a cambio de uid).
4. **P0-5** `ownerUserId` en snapshot/marcador.
5. **P0-7** borrado real de cuenta + arreglar la política de privacidad (P1-29). Bloqueantes de App Review.
6. **Tests de integración de Supabase** contra un proyecto local (`supabase start`) — es el hueco que dejó pasar todo lo anterior.
7. Bloque de política de idioma (P1-5 a P1-13): empieza por P1-5 y P1-6, que son los que más se ven al escanear.
8. Bloque de pantallas: P1-14, P1-16, P1-17, P1-18, P1-19, P1-25 son funcionalidad rota o destructiva; luego P1-4 (fechas locales), P1-20, P1-21.
9. i18n de arranque (idioma del dispositivo + onboarding) y el resto de strings.

Nota de proceso: el trabajo del 10/08 sigue **sin commitear** (`git status`: 5 modificados + 3 nuevos). Conviene cerrarlo en un commit antes de empezar con lo de arriba.

---

## Estado tras la sesión de arreglos (11 sep 2026, misma tarde)

Verificación final: `tsc --noEmit` limpio · **425/425 tests, 26 suites** (+44 tests) · paridad i18n EN/ES pinned por `src/__tests__/i18nParity.test.ts`.

**CERRADOS**
- P0-1 `onConflict: "user_id,id"` en las 5 tablas hijas. P0-3 columnas `co_author_*`. P0-4 trigger de reviews (`booklio_set_synced_at`, también aplicado a user_lists). → migración `supabase/migrations/20260911120000_fix_sync_schema.sql` — **APLICAR EN EL DASHBOARD / `supabase db push` ANTES DE PROBAR SYNC.**
- P0-2 push ordenado: hijas primero, perfil al final con `snapshot_pushed_at`; `loadSupabase` devuelve `null` (no "nube vacía") si el perfil no tiene sello y no hay filas hijas. Nube legacy con filas y sin sello sigue aceptándose.
- P0-5 `LOCAL_SYNC_OWNER_KEY`: el snapshot/marcador llevan dueño; con otro `user_id` el local se aparca en `CONFLICT_BACKUP_KEY`, se olvida el marcador y la cuenta nueva arranca de su nube (o vacía, no con los seeds). `RepositoryStatus.localBelongedToOtherUser`.
- P0-6 fingerprint de contenido (`snapshotFingerprint`) en `persistNow`: un persist sin cambios reales ya no bumpea `updatedAt` ni sube 6 tablas. `save()` devuelve `{ pushedToRemote }`.
- P0-7 `resetApp` llama al RPC `booklio_delete_account()` (security definer: borra las 7 tablas + `auth.users`) con fallback a delete por tabla bajo RLS; cancela el recordatorio diario.
- P1-1 `applyLoadedSnapshot` compartido: el handler de auth aplica reviews y listas. P1-2 la cuenta solo rellena huecos del perfil. P1-3 el handler solo reacciona a cambio real de `user.id` (ignora INITIAL_SESSION/TOKEN_REFRESHED del mismo usuario).
- P1-B ids con sufijo aleatorio. P1-C un solo marcador `full_sync_needed` + `markRetried` y descarte tras `MAX_RETRIES`. P1-D `isOnline` tolera `isInternetReachable` desconocido. P1-E `pruneOrphans` lista ids remotos y borra en lotes de 150 (`in`, nunca `not in` por URL), loguea `{ error }`.
- Metadata: P1-5 (lookupByIsbn gatea título/sinopsis del work), P1-6 (sin "English" fabricado; idioma conocido gana el merge, empate → GB), P1-7 (foto/ISBN en dos pasos, segunda pasada estricta), P1-12 (caché con `expiresAt`: 7 d con sinopsis, 1 h sin ella, nunca tras 429/timeout; prefijo `meta3-`), P1-13 (`seriesName` de GB = undefined), P2-1, P2-2 (978/979), P2-4, P2-5.
- Pantallas: P1-14 `prefillMinutes`, P1-4 `localDateKey()` (`src/utils/dateUtils.ts`) en sesiones/stats/contexto y `sameYear` local, A-1/A-3 validación de fecha y minutos, P1-15 sin disfrute fabricado (0 = sin valorar, tile oculto), P1-16 páginas=0 (bloqueo con aviso; audiolibro en base 100; `syncBookWithSessions` no toca estado), P1-17 `seriesId` derivado de `seriesName` (add/update/hydrate; SeriesTracker usa nombre+orden), P1-18 "Añadir a lista" abre `BookListSheet`, P1-20 escáner (feedback `scan.notIsbn`, re-escaneo a 1,5 s), P1-21 Home con clave estable + caché 12 h, P1-24 `languageCode` en `addBook` y filtro, P1-25 "Vaciar biblioteca" honesto, P1-26 diálogo tras cerrar el sheet, P1-27 sheets y menú contextual con tema + i18n, P1-28 fuentes, O-1 idioma del dispositivo al primer arranque.

**SIGUEN ABIERTOS (por orden)**
1. P0-1 antiguo: Google Sign-In iOS placeholders (`app.json`) — acción tuya en Google Cloud.
2. P1-29 política de privacidad (ads/ATT/SecureStore falsos; falta Google Books/notificaciones). P0-7 queda cubierto una vez aplicada la migración.
3. P1-8/9/10/11 (edición quimera de OL search, descripción no recalculada al cambiar `bestEdition`, fallback de catálogo con `isbnMatch: true`, work fusionado en el candidato `ol-isbn`).
4. P1-19 EditBook no edita notas/citas/sinopsis/estado. P1-22 ya cubierto. P1-23 dedupe + paginación en GenreBrowse/AuthorBooks.
5. UI para `CONFLICT_BACKUP_KEY` ("Restaurar copia anterior").
6. Resto de i18n (BookIntake, FilterSheet, EditBook, onboarding…), P2 de config (eas env, assetBundlePatterns, buildNumber, Apple nonce).
7. P0-B2 fusión por registro (necesita `updatedAt` por fila + tombstones).
