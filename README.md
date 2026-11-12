# Cámara (PWA)

Cámara web instalable: foto, video, galería y ajustes. Funciona sin conexión una vez cargada.

## Subir a GitHub Pages
1. Crea un repositorio y sube **todo el contenido de esta carpeta** a la raíz (`index.html`, `app.js`, `sw.js`, `manifest.webmanifest`, `styles.css` y la carpeta `icons`).
2. En el repositorio: Settings → Pages → Source: *Deploy from a branch* → rama `main`, carpeta `/ (root)` → Save.
3. Espera un minuto y abre `https://TU-USUARIO.github.io/NOMBRE-DEL-REPO/` en el teléfono (debe ser https).

## Instalar en el teléfono
- **Android (Chrome):** menú ⋮ → *Instalar app* (o toca *Instalar* en Ajustes dentro de la app).
- **iPhone (Safari):** Compartir → *Añadir a pantalla de inicio*.

## Notas
- La primera vez el navegador pedirá permiso de cámara (y de micrófono al grabar video con sonido).
- Fotos y videos se guardan en la galería de la app; usa *Guardar* para descargarlos al teléfono, o activa *Descargar al capturar* en Ajustes.
- Si cambias archivos y subes una nueva versión, sube también el número de `VERSION` en `sw.js` (por ejemplo `camara-v2`) para que se actualice la caché.
- `make_icons.py` regenera los iconos PNG (requiere Pillow); no hace falta subirlo.
