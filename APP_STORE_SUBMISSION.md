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

## 5. Lo que sigue pendiente y no es de la ficha

- Capturas de pantalla para la ficha (no hay ninguna subida).
- Texto promocional, descripción y keywords.
- La política está solo en inglés; la app es bilingüe y la ficha, si se
  publica en español, debería apuntar a una versión traducida.
