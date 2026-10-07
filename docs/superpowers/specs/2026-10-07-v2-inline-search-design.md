# KokoMovie v2.0.0: cabecera, biblioteca y búsqueda integrada

Solicitud del usuario: eliminar la línea negra de la cabecera; mostrar Continuar viendo en lugar de Mi lista en Inicio; unir los accesos Mi lista e Historial; expandir Buscar hacia la izquierda con resultados progresivos. El usuario eligió un panel debajo del campo con póster y título.

## Diseño

- Cabecera sin borde/separador. Se conservan logo, colores, contraste y fondo necesario al desplazarse.
- Inicio muestra una sola fila Continuar viendo basada en posiciones reales. Mi lista sigue disponible en la biblioteca, sin fila ni consulta de guardados en Inicio.
- Un único enlace Mi biblioteca abre /history; sus pestañas Historial y Mi lista siguen operativas y /history?tab=list sigue válido. Título y descripción de la página comunes a ambas pestañas.
- Buscar es un botón de la cabecera. Abre un campo hacia la izquierda, enfoca el campo y muestra sugerencias debajo sin navegar al escribir. Usa catalogApi.search, mínimo dos caracteres, debounce de 300 ms, hasta ocho resultados reales con póster, título y datos disponibles. Seleccionar abre la ficha; no inicia reproducción.
- Estados de carga, vacío y error con reintento. Nunca presentar resultados de un texto anterior durante el debounce o una consulta pendiente. Escape cierra y devuelve foco; clic exterior cierra sin robar foco al destino; flechas y Enter seleccionan; Ctrl/Cmd+K abre y enfoca.
- Movimiento reducido elimina expansión animada/desplazamiento. A 960, 1024 y 1440 px el campo no tapa marca, navegación ni menú, y el panel queda dentro de la ventana.
- /search permanece como enlace antiguo con su búsqueda completa y filtros. En esa ruta se conserva únicamente su campo existente, el atajo lo enfoca, y se omite el botón redundante de cabecera. Los destinos principales utilizan siempre la búsqueda integrada.

## Restricciones

Versión 2.0.0 exclusivamente. Logo y paleta originales sin cambios. Sin nuevas dependencias, backend web, cambios de Electron/IPC, login ni perfiles. Datos, descargas y reproducción existentes preservados. No modificar .github/workflows/electron-release.yml. Cambios locales en codex/kokomovie-v2-inline-search desde 2d9ec65, sin instalar, publicar, fusionar ni enviar al remoto. Actualizar documentación después de verificar el bloque funcional.
