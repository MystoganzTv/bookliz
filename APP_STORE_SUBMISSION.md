# Bookliz — lo que falta en App Store Connect

Estado al 2026-09-12. App **6774150174** (`com.mystodev.booklio`), versión 1.0
en *Prepare for Submission*. La build 1.0.0 (1) de mayo está **Expired**.

Cada respuesta de abajo sale de auditar el código, no de una plantilla. Si
alguna vez se añade un SDK de analítica, crash reporting o anuncios, o cambia
dónde se guardan los tokens, **este documento y `docs/privacy-policy.html`
quedan mintiendo desde ese commit**.

---

## 1. App Privacy · nutrition labels — BLOQUEANTE

Sin esto no se puede enviar a revisión. Está sin rellenar.

### Lo primero, porque decide lo demás

> **¿Se usa algún dato para hacer tracking?** → **NO.**

No hay SDK de publicidad, ni de analítica, ni de atribución, ni de crash
reporting en `package.json`. La app nunca lee el IDFA ni pide App Tracking
Transparency. Esto significa que **no debe aparecer ninguna categoría bajo
"Data Used to Track You"**, y que no hace falta el prompt de ATT.

### Datos que SÍ se recogen (solo si el usuario crea cuenta)

Los cuatro van **Linked to the user's identity** y con el único propósito
**App Functionality**. Ninguno para Analytics, Product Personalization,
Advertising ni Developer's Marketing.

| Categoría Apple | Tipo | De dónde sale |
|---|---|---|
| Contact Info | Email Address | Supabase Auth; o el relay de Apple si el usuario oculta su correo |
| Contact Info | Name | nombre visible del perfil |
| Identifiers | User ID | el UUID que enlaza sus filas |
| User Content | Other User Content | libros, autores, sesiones de lectura, reseñas, notas, citas, listas |

### Datos que NO se recogen — no marcar

- **Photos or Videos.** Se pide acceso a cámara y fototeca, pero las fotos
  **no salen del dispositivo**: el código de barras se decodifica en local y
  una portada tomada de la fototeca guarda la *ruta* del archivo, no la
  imagen. Apple solo considera "collect" lo que se transmite fuera, así que
  marcarlo sería declarar algo falso.
- **Usage Data, Diagnostics, Performance Data.** No hay telemetría de ningún
  tipo. Literalmente no sabemos cómo usa nadie la app.
- **Location, Health, Financial Info, Contacts, Browsing History, Purchases,
  Sensitive Info.** Nada de eso se toca.

### El único juicio discutible: Search History

Cuando el usuario busca un libro, el término viaja a la **API de Google
Books** y a **Open Library**. Nosotros no lo guardamos en ningún sitio.

Pero la definición de Apple de "collect" incluye lo que un *third-party
partner* pueda retener más allá de atender la petición en tiempo real, y esas
llamadas van con **nuestra** clave de API, así que los logs de Google son
atribuibles a este proyecto.

**Recomendación: declararlo.** `Search History` → **Not Linked to You** →
**App Functionality**. No cuesta nada (no activa "Data Used to Track You") y
es defendible ante revisión; no declararlo obliga a sostener que los logs de
Google no cuentan, que es una posición más frágil de lo que parece.

Esto desaparece del todo cuando el proxy en Edge Function esté montado y las
búsquedas dejen de salir del dispositivo con nuestra clave.

---

## 2. Age Rating — sin configurar

Todo el cuestionario en **None / No**, con dos que conviene mirar dos veces:

- **User-Generated Content → No.** El usuario escribe reseñas y notas, pero
  son privadas: no hay feed, ni perfiles públicos, ni forma de que otro
  usuario las vea. No es UGC en el sentido de Apple.
- **Unrestricted Web Access → No.** La app abre enlaces de Amazon con
  `Linking.openURL`, que sale a Safari; no hay navegador embebido que
  acepte URLs arbitrarias. `expo-web-browser` solo se usa para el flujo de
  OAuth de Google.

Resultado esperado: **4+**.

---

## 3. App Information — dos campos vacíos

- **Category.** Está en *None*. Primaria: **Books**. Secundaria: opcional;
  *Lifestyle* encaja mejor que *Education*, pero se puede dejar vacía.
- **Content Rights.** Está sin configurar y la respuesta es **sí, la app
  muestra contenido de terceros**: portadas, sinopsis y metadatos de Google
  Books y Open Library. Hay que declararlo y confirmar que se tiene permiso
  para usarlo — los términos de la API de Google Books lo permiten mostrando
  la atribución correspondiente.

---

## 4. Ya resuelto — no hace falta tocarlo

- **Borrado de cuenta en la app.** Apple lo exige a toda app con registro.
  *Ajustes → Delete account* llama al RPC `booklio_delete_account()`, que
  borra las filas y el registro de `auth.users`. Cumple.
- **Declaración de cifrado.** `ITSAppUsesNonExemptEncryption` ya está en
  `false` en `Info.plist`. Solo se usa HTTPS, que está exento, así que no
  preguntará en cada subida ni hace falta documentación.
- **Política de privacidad.** Reescrita contra el código el 2026-09-12
  (commit `a4be94b`), incluida la declaración de Amazon Associates.

---

## 5. Textos de la ficha

Escritos contra lo que la app hace hoy. **Nada de esto menciona el OCR de
portadas ni el proxy**: las funciones están desplegadas pero ninguna build
publicada las usa todavía. Cuando salga una que sí, hay una frase que añadir.

### Name (30) · Subtitle (30)

| | EN | ES |
|---|---|---|
| Name | `Bookliz` | `Bookliz` |
| Subtitle | `Your reading life, tracked` | `Tu vida lectora, ordenada` |

### Promotional text (170)

**EN** — `Scan a barcode and the book is on your shelf. Log sessions, follow your sagas, keep your quotes. No ads, no tracking, and it works offline.`

**ES** — `Escanea un código y el libro ya está en tu estantería. Registra sesiones, sigue tus sagas, guarda tus citas. Sin anuncios, sin rastreo y funciona sin conexión.`

### Keywords (100, separadas por comas, sin espacios)

**EN** — `reading,tracker,library,isbn,scanner,bookshelf,tbr,reading log,series,saga,book journal,quotes`

**ES** — `lectura,biblioteca,isbn,escanear,estanteria,leer,diario,saga,citas,reseñas,lecturas,pendientes`

> No repitas el nombre de la app ni la categoría: Apple ya indexa "Bookliz" y
> "Books" por su cuenta, y gastar caracteres ahí es tirarlos.

### Description

**EN**

```
Bookliz is a reading tracker for people who actually keep their books.

Scan the barcode on the back cover and the book lands on your shelf with its
cover, page count and synopsis already filled in. No barcode? Search by title
or author, or type the details yourself.

YOUR SHELVES, HONESTLY
Owned, wishlist, want to buy, reading, finished, abandoned. Ownership is its
own question, so a book you already have never asks to be bought again.

READING SESSIONS WITH MEMORY
Log pages, minutes, where you were and how it felt. Your reading diary builds
itself as you go.

SAGAS YOU CAN FOLLOW
Bookliz notices when a book belongs to a series and tracks how far along you
are, so you know what to read next without looking it up.

WHAT YOU THOUGHT
Reviews, ratings and the lines worth keeping — quotes live with the book they
came from.

STATS THAT MEAN SOMETHING
Streaks, a yearly goal, achievements, and a picture of what kind of reader you
are, calculated on your device.

IN YOUR LANGUAGE
Fully bilingual in English and Spanish, and a book in Spanish stays in Spanish
— Bookliz never swaps in an English cover or synopsis behind your back.

NO ADS. NO TRACKING.
No advertising, no analytics, no crash reporting, no third-party SDK reading
over your shoulder. Your library is yours. Works offline; sign in only if you
want it on more than one device.
```

**ES**

```
Bookliz es una app de seguimiento de lectura para quien de verdad guarda sus
libros.

Escanea el código de barras de la contraportada y el libro aparece en tu
estantería con portada, número de páginas y sinopsis ya rellenos. ¿Sin código?
Búscalo por título o autor, o escribe los datos tú.

TUS ESTANTES, SIN MENTIRAS
Lo tengo, lista de deseos, quiero comprarlo, leyendo, terminado, abandonado.
La propiedad es una pregunta aparte, así que un libro que ya tienes no vuelve
a pedirte que lo compres.

SESIONES DE LECTURA CON MEMORIA
Anota páginas, minutos, dónde estabas y cómo te sentías. Tu diario de lectura
se construye solo.

SAGAS QUE PUEDES SEGUIR
Bookliz detecta cuándo un libro pertenece a una saga y lleva la cuenta de por
dónde vas, para que sepas qué toca sin tener que buscarlo.

LO QUE PENSASTE
Reseñas, valoraciones y las frases que merecen quedarse: las citas viven junto
al libro del que salieron.

ESTADÍSTICAS QUE DICEN ALGO
Rachas, un objetivo anual, logros y un retrato de qué clase de lector eres,
calculado en tu dispositivo.

EN TU IDIOMA
Bilingüe de verdad, en español e inglés. Y un libro en español se queda en
español: Bookliz nunca te cuela una portada o una sinopsis en inglés.

SIN ANUNCIOS. SIN RASTREO.
Sin publicidad, sin analítica, sin crash reporting, sin ningún SDK de terceros
mirando por encima de tu hombro. Tu biblioteca es tuya. Funciona sin conexión;
inicia sesión solo si la quieres en más de un dispositivo.
```

### Nota sobre el enlace de afiliado

La ficha **no** menciona Amazon, y está bien así: la relación de afiliado se
declara donde toca, en la política de privacidad. Pero si algún día el texto
promocional empieza a empujar la compra, entonces sí hay que decirlo también
ahí — la guideline 3.2.2 y la FTC miran el sitio donde se hace la invitación.

---

## 6. Lo que sigue pendiente y no es de la ficha

- **Capturas de pantalla: no hay ninguna subida.** Hacen falta al menos para
  6,7" (iPhone 15/16 Pro) y, si se soporta iPad, para 13". Las buenas son las
  que enseñan una biblioteca con libros de verdad, no vacía.
- La política de privacidad está solo en inglés; la app es bilingüe y la ficha
  en español debería apuntar a una versión traducida.
- Ninguna build publicada usa todavía el proxy de Books ni el OCR de portadas.
