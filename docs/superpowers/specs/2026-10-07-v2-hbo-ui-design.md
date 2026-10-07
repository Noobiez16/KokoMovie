# KokoMovie v2.0.0 — segunda propuesta de UI/UX

Fecha: 2026-10-07. Estado: aprobado por el usuario; implementación en curso.
Punto de recuperación: `c465dbb`, rama `codex/kokomovie-v2-0-0`.

## Solicitud y referencias inspeccionadas

El usuario solicita una interfaz al estilo del proyecto
[HBO Max — UI/UX Design](https://www.behance.net/gallery/124963621/HBO-Max-UIUX-Design)
de Emanuel Antón y James López/Santiago Soutric, publicado en 2021. Se inspeccionaron
las imágenes originales de Wireframe, Home, Series Selected, Search y Movies Featured.
Login y Select Profile quedan fuera del diseño de KokoMovie.

La referencia es un concepto no oficial de capturas estáticas. Su marco de MacBook es
una presentación de diseño; no demuestra una aplicación macOS ni sus animaciones.
Los valores de duración definidos aquí son propuestas de KokoMovie, no mediciones de HBO.

Fuentes de movimiento revisadas:

- [Guía oficial de motion](https://brand.hbomax.com/motion): promocionales y piezas
  de marca, no especificación de transiciones del catálogo en Mac.
- [Anuncio oficial de previews](https://press.wbd.com/us/media-release/hbo-max/max-updates-homepage-user-interface-enhanced-video-elements),
  2025: documenta previews de hover para televisores conectados en EE. UU.; no prueba
  el mismo comportamiento en el navegador de Mac.
- [Caso del diseñador del reproductor](https://stevenhartwig.squarespace.com/video-player):
  diseño adaptable de escritorio/móvil y sistema Slate. El GIF público inspeccionado
  corresponde a un teléfono; no permite medir navegación, tarjetas o hero en Mac.

No se ha verificado una sesión real de HBO Max en macOS. Para una réplica exacta de
sus timings y secuencias será necesaria una grabación o demo pública de esa experiencia.
Esta limitación no impide especificar y probar el movimiento del rediseño de KokoMovie.

## Restricciones

- Mantener 2.0.0 en paquetes, lockfile, configuración y changelog. No abrir 2.0.1.
- Conservar los bytes de `client/src/renderer/assets/logo.png`, el nombre y los valores
  actuales de la paleta. Los fondos y gradientes usarán colores existentes y opacidades.
- Usar Inter/system; no importar logos, fuentes, marcas ni archivos de HBO para la aplicación.
- Conservar datos reales de TMDB, madurez, biblioteca local, selección de episodios,
  Dónde ver, fuentes, descargas, capacidad P2P, persistencia y reproductor único.
- No introducir login, perfiles, suscripciones, avisos ficticios ni un porcentaje Match.
- Preservar el cambio preexistente de `.github/workflows/electron-release.yml` fuera
  de los commits. Actualizar documentos de producto sólo después de validar el bloque.

## Alternativas y recomendación

1. **Composición de la referencia adaptada a KokoMovie — recomendada.** Navegación
   superior, logo centrado, contenido a todo el ancho y biblioteca/herramientas en menú.
   Reproduce la jerarquía de las pantallas seleccionadas y conserva las funciones locales;
   algunos accesos secundarios pasan a requerir abrir el menú.
2. **Composición de la referencia con Biblioteca visible en la cabecera.** Añade un
   cuarto destino principal y acceso directo a descargas. Favorece el uso offline y requiere
   más espacio horizontal; se aleja de la cabecera de tres destinos de la referencia.
3. **Composición híbrida con navegación lateral compacta.** Mantiene todos los destinos
   a un clic y modifica hero/tarjetas. Conserva una franja lateral permanente y ofrece
   menos superficie al contenido que las otras alternativas.

El resto de la propuesta especifica la alternativa 1.

## Wireframe y cabecera

Eliminar la barra lateral permanente de las pantallas. Cabecera de 76 px en escritorio:
Inicio/Películas/Series a la izquierda, el logo original con nombre al centro y Buscar/Menú
a la derecha. Navegación activa en cápsula con acento violeta; controles secundarios discretos.
Cabecera superpuesta al hero y fondo sólido translúcido al desplazarse. No dibujar un perfil.

El menú ofrece Mi lista, Continuar viendo, Historial, Descargas, Proveedores, Ajustes y Ayuda.
Se abre mediante botón con nombre, `aria-expanded` y estado activo reconocible. Escape y
clic fuera lo cierran; devuelve el foco al botón. Los enlaces mantienen rutas existentes.
En anchos reducidos, los tres destinos entran en el menú para evitar que se superpongan
al logo. El atajo de búsqueda es Ctrl+K o Cmd+K según plataforma.

Mantener un área de scroll de contenido, el enlace de salto accesible y PlayerHost fuera
de Routes. El cambio de shell no debe desmontar reproducción ni migrar SQLite.

## Home

Hero integrado de aproximadamente 58–66 vh, con máximo de 620 px y mínimo ajustable
de 360 px. Imagen protagonista a la derecha, texto a la izquierda, degradados al fondo
oscuro/violeta existente. Márgenes comunes de 48–64 px en escritorio y 24 px en ventana
compacta. Título grande, metadatos verificados y sinopsis de hasta tres líneas; botones en
cápsula. Película Reproducir mantiene el flujo de descubrimiento aprobado; serie abre
episodios. Ver ficha/Tráiler sólo se muestran cuando existe su acción real.

Continuar viendo usa tarjetas 16:9 con progreso real y títulos debajo. Mi lista y las filas
del catálogo usan posters 2:3 de borde limpio, espaciado de 16–20 px, imágenes protagonistas
y pocas superficies adicionales. No inventar canales HBO/Max/DC ni filas de personalización:
usar listas, tendencias, géneros y datos que KokoMovie realmente consulta. Si la biblioteca
está vacía, conservar el estado útil para explorar, sin tarjetas de usuarios ficticios.

## Series Selected

La ficha de serie integra el hero y sus acciones en el mismo fondo. Temporadas en pestañas
horizontales desplazables, selección subrayada en violeta y nombres completos localizados.
Episodios en tarjetas 16:9, cuatro columnas en escritorio amplio, tres o dos según ancho;
número/título, duración y descripción corta debajo. Mantener selección y carga bajo demanda
por temporada, reanudar el episodio real y las acciones de descargar. Reparto, relacionados
y Dónde ver permanecen disponibles con la misma identidad y validación de datos.

Los encabezados usan texto real; los títulos no se convierten en logos de contenido
inventados para imitar las artes de Game of Thrones de la referencia.

## Search y Movies Featured

La lámina titulada Search muestra géneros y filas de catálogo, sin un campo de búsqueda.
Adaptar su lenguaje visual manteniendo la búsqueda funcional: una sola entrada grande
en la página Buscar, filtros Todo/Películas/Series discretos, cuadrícula de posters,
consulta/tipo/página en la URL, Atrás/Adelante y paginación real. El icono superior conduce
a esa entrada; no duplicar un campo de cabecera. Consultas obsoletas no reemplazan resultados.

Películas y Series reciben la tira de géneros desplazable de la referencia, conectada
a los géneros reales existentes. Destacados conserva las colecciones reales. No añadir
A–Z como control si no existe un contrato para ordenar el catálogo completo; no ordenar
sólo una página y presentarla como orden global. Películas destacadas usa hero integrado
y sugerencias debajo, con puntuación/certificación real y ninguna etiqueta Match inventada.

## Movimiento propuesto

Los valores siguientes son tokens iniciales para KokoMovie, sujetos a inspección visual
de su implementación; no representan tiempos verificados de HBO Max en Mac.

| Interacción | Propuesta |
| --- | --- |
| Hover/foco de tarjeta | 180 ms, escala máxima 1.035, imagen y borde violeta suave; espacio para no recortar vecinos |
| Presionar botón | 110 ms, escala 0.98 y recuperación; el clic ejecuta inmediatamente la acción |
| Entrada de contenido de ruta | 260 ms, opacidad y desplazamiento vertical de 8 px; la cabecera permanece estable |
| Menú | 220 ms al abrir, 160 ms al cerrar, opacidad/desplazamiento de 8 px; sin retrasar el foco |
| Hero/cambio de imagen disponible | 420 ms de fundido; sin saltos de altura ni vídeo nuevo iniciado por hover |
| Navegación de fila | desplazamiento suave cercano a 350 ms; botones y teclado con el mismo destino |
| Cambio de temporada/resultados | 200 ms de entrada tras recibir datos válidos; no retrasar peticiones ni mostrar episodios de otra temporada |

Curva general propuesta: `cubic-bezier(.22, 1, .36, 1)` para entradas; ease-out en salidas.
Animar opacidad y transform, evitando altura, posición de layout y filtros de blur continuos.
No animar todos los posters al hacer scroll ni reproducir una introducción del logo.
Respetar `prefers-reduced-motion`: suprimir zoom, desplazamientos y scroll animado. Foco,
estados, progreso y acciones permanecen utilizables. Las animaciones deben cancelarse
al cambiar de ruta; ningún temporizador puede iniciar una fuente anterior.

Los previews actuales sólo usan medios ya disponibles y las reglas existentes; este bloque
no añade previews automáticos por hover ni cambios a las preferencias de reproducción.

## Componentes, estados y validación

Separar cabecera/navegación, menú de biblioteca, búsqueda y reglas de movimiento. Reutilizar
HeroBanner, ContentRow/ContentCard y componentes de estado, evitando cinco implementaciones
de navegación. El área visual de episodios será propia de la ficha y mantendrá sus consultas.
El shell compartido se aplica a páginas operativas para que biblioteca/herramientas sigan
accesibles; este bloque no rediseña sus flujos ni su lógica de almacenamiento.

Carga, error, sin imágenes, sin temporadas y catálogo offline conservarán dimensiones y
acciones reales. No montar un hero vacío ni ocultar el acceso a la biblioteca sin credenciales.
Toda etiqueta nueva tiene EN/ES/FR y foco de teclado. El menú no puede cubrir controles
del reproductor ni retener el foco cuando se cierre.

Pruebas de comportamiento: navegación/menú y Escape/foco; único campo/Ctrl+K/Cmd+K;
URL de búsqueda y géneros; series/temporadas/episodios y reanudación; hero Play/madurez;
continuidad del PlayerHost; movimiento reducido sin impedir acciones. Mantener toda la
suite de core, descargas, seguridad y persistencia.

Inspección visual: 1440×900 y 1024×768, todas las pantallas solicitadas, imágenes ausentes,
menú abierto y los tres idiomas. Capturar animaciones de KokoMovie para revisar fluidez;
no afirmar prueba de macOS desde Windows. Gates: unidad, ambos TypeScript, lint, build
y Electron con perfiles aislados. Comparar logo/paleta con el checkpoint. Sólo después
actualizar changelog v2.0.0 y documentos de estado/pruebas con resultados reales.

## Estado de aprobación

Aprobado por el usuario con «Aprobado, continua». Rama de refinamiento
`codex/kokomovie-v2-hbo-ui` desde `c465dbb`; conservar `codex/kokomovie-v2-0-0`
como punto de recuperación. Una grabación de Mac puede precisar el movimiento, pero
la ausencia de ella se tratará como adaptación propuesta, nunca como réplica medida.
