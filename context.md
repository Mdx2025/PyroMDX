# PYRA — Experiencia 3D inmersiva de desierto (context.md)

> Documento de contexto para que cualquier IA (o desarrollador) pueda entender, mantener y extender este proyecto sin historial previo.

---

## 1. Resumen del proyecto

**PYRA** es una landing page inmersiva en WebGL inspirada en la estructura y sensación de **igloo.inc** (Site of the Year en Awwwards, desarrollada por el estudio Abeto en colaboración con Bureaux), pero con temática de **desierto / pirámide / arena** en lugar de hielo.

- **Referencia principal:** https://igloo.inc
- **Case study estudiado:** https://www.awwwards.com/igloo-inc-case-study.html
- **Referencia visual clave del cliente:** captura de igloo.inc donde el iglú de bloques está a nivel de suelo, cámara baja y cercana, terreno realista con montículos, montañas neblinosas al fondo y luz blanca filtrándose entre los bloques. La versión actual replica ese encuadre con la pirámide.

### Ideas tomadas del case study de Abeto
- Intro cinematográfica **renderizada en tiempo real dentro del engine** que fluye sin corte hacia la experiencia (no video).
- **Aberración cromática** como firma visual (aplicada sutilmente en el post-proceso, más fuerte hacia los bordes).
- Animación hecha con **código + shaders + GSAP**, no con renders pre-calculados.
- Filosofía de iterar directamente en el navegador y medir rendimiento continuamente.

---

## 2. Estado actual (V12 — archivo `pyra-desierto-v12.html`)

Single-file HTML autocontenido. **No hay scroll**: la experiencia es una única escena cinematográfica.

### Flujo de la experiencia
1. **Loader** (contador 000→100, glifo piramidal pulsante) — progreso simulado.
2. **Intro cinematográfica automática** (~5.6 s, GSAP `power2.inOut`): la cámara vuela por una curva Catmull-Rom desde lejos/alto y aterriza en el encuadre final (bajo y cercano, se ve el suelo, como la referencia).
3. **Estado de reposo**: cámara fija en la posición final con **idle permanente** (vaivén multi-eje tipo plano secuencia + parallax de ratón). La pirámide respira/fractura en idle. Hover sobre la pirámide abre los bloques.
4. **Panel Editor** (botón "Editor" en el nav): sliders en vivo para posición final de cámara, lookAt, duración de la intro, FOV, vaivén, densidad de niebla y energía del núcleo. Botones: "Reproducir intro" (replay) y "Copiar config" (exporta JSON al portapapeles para fijar valores en `CFG`).

### Historial de versiones
| Versión | Archivo | Cambios clave |
|---|---|---|
| V1 | `pyra-desierto.html` | Escena base: pirámide cono, dunas seno, partículas de arena, cámara 100% ligada a scroll (620vh), 5 secciones de texto, fog exponencial simple. |
| V2 | `pyra-desierto-v2.html` | Shader de **raymarching volumétrico** (post-pass con depth), intro automática antes del scroll, pirámide **fracturada en bloques** (InstancedMesh) con idle + hover, cámara con idle, GSAP. |
| V3 | `pyra-desierto-v3.html` | Hero eliminado; intro aterriza en la sección "El Desierto" (única restante); dunas lejanas como **montañas**; partículas eliminadas; niebla más realista (height fog + FBM suave); cámara elevada mirando hacia abajo; **núcleo de energía blanca** dentro de la pirámide. |
| V4 | `pyra-desierto-v4.html` | **Sin scroll ni secciones** (solo intro → reposo); cámara baja y cercana mostrando el suelo (como la imagen de referencia); **suelo de desierto realista** (textura procedural de arena con ondulaciones de viento + bump, montículos por value-noise); **fix del hover** (los bloques mantienen su apertura de forma estable, sin re-unirse); **Panel Editor UI**. |
| V5 | `pyra-desierto-v5.html` | Cámara final fijada en **(-11.5, 15, 43)**; **fila base de bloques estática** (anclada al suelo); respiración idle más amplia (los bloques se abren más y el hover suma sobre esa respiración); **energía del núcleo más densa y constante** (se eliminó el boost por hover); **niebla volumétrica encharcada a ras de suelo** (capa baja densa `exp(-y*0.42)` + bruma suave encima) para que se lea claramente sobre la arena. |
| V6 | `pyra-desierto-v6.html` | **Pirámide reconstruida en rejilla perfectamente alineada**: celda fija (1.8) para todas las capas y conteos impares decrecientes (15→1, 8 capas), columnas alineadas, bloques **100% unidos en reposo** (junta capilar 0.2% solo anti z-fighting), **sin rotaciones ni cambios de escala** (nada de bloques "mal formados"); desplazamiento = respiración global (0→1, cierra del todo) × amp × `breathSep` + hover × `hoverSep`; **sliders de "Separación respiración" y "Separación hover" en el Panel Editor** (y exportados en el JSON); **sol eliminado** (disco + halo + scattering solar; clave de luz suave polvorienta en su lugar); **niebla de suelo realista**: sprites de bruma procedurales (CanvasTexture radial con manchas) derivando lentamente sobre la arena + capa volumétrica baja más densa; **montañas más altas y cercanas** (desde ~80 unidades, hasta ~60 de alto) que llenan la mayor parte del viewport tras la pirámide. |
| V7 | `pyra-desierto-v7.html` | **UI migrada a TailwindCSS** (Play CDN + config de tokens night/sand/bone/dust/hairline y fuentes; CSS custom mínimo solo para cursor, grano, keyframes y sliders); **márgenes del chrome: 4rem arriba/abajo y 5rem laterales** (pt-16 / bottom-16 / px-20); bajo PYRA ahora va el bloque **"// Copyright © 2026 / Pyra, Inc. / All Rights Reserved."** y arriba a la derecha el bloque **"////// Manifiesto"** con misión propia (copy original, no el de Igloo); **botón Editor fijado absolute top-right** (top-4 right-4); las coordenadas del footer se reemplazaron por **SOUND: + onda en vivo clicable** — audio de **viento del desierto 100% sintetizado con WebAudio** (ruido blanco → bandpass con LFO de ráfagas + LFO de volumen; sin archivos externos ni música con copyright), autoplay al terminar el loader con desbloqueo en el primer gesto si el navegador lo exige, y la onda se dibuja del AnalyserNode real (línea plana en pausa); **idle de fractura rediseñado como ondas expansivas desde 5 puntos emisores** en las caras (`waveField`: anillos gaussianos viajeros con descanso entre pulsos — solo se abren los bloques que el anillo cruza, nunca toda la pirámide; slider "Separación onda"); la energía del núcleo y la niebla reaccionan a la actividad de las ondas (`waveActivity`); **la bruma de suelo se sustituyó por viento arrastrando arena**: ~130 ráfagas-sprite finas y rápidas rasantes al suelo (textura de veta horizontal procedural) + 10 pads lentos de bruma + advección de viento más fuerte en el shader volumétrico; **pirámide más realista**: textura procedural de arenisca en alta resolución (2048², estratos + grano + poros de erosión + juntas oscurecidas por bloque) con anisotropía máxima, tinte por instancia (`setColorAt`) para variación de cantera, y **sombras reales** (shadow map PCFSoft 2048, la pirámide proyecta sombra sobre el suelo). |
| V8 | `pyra-desierto-v8.html` | **Montañas más cercanas y altas** (arrancan a ~62 unidades, picos hasta ~80); **bloques rectangulares tipo piedra**: la rejilla pasa de cubos a losas de mampostería 2.3 × 1.5 × 2.3 (COUNT0 13, 7 hiladas; base ~30, altura ~10.5) manteniendo la alineación perfecta de columnas — el escalado por instancia ahora es no uniforme (`BS_XZ`/`BS_Y`) y los emisores de onda se reescalaron al nuevo volumen; **overlay técnico sci-fi al hacer hover**: capa SVG en espacio de pantalla (pool reutilizado, cero coste cuando no hay hover) que proyecta los 6 bloques con mayor influencia a 2D y dibuja nodos con anillo + punto + etiqueta mono pequeña (`índice · desplazamiento`), conectados por una polilínea capilar ordenada izquierda→derecha, más una **cruz de escaneo** en el punto del cursor con línea líder y lecturas (`SCAN N NODOS` y coordenadas X/Y/Z del impacto); todo con fade suavizado (lerp de alpha), como una interfaz holográfica de instalación experimental sobre la construcción tradicional. |
| V9 | `pyra-desierto-v9.html` | **Viento visible de verdad**: dos "sábanas de arena" gigantes (planos 260² a y=0.45 y y=0.95) con textura procedural tileable de vetas horizontales que **scrollea rápido** vía `texture.offset` (blending aditivo) — la lectura inequívoca de arena arrastrada por la brisa — más ~150 ráfagas-sprite aditivas, más grandes y brillantes, concentradas en el corredor visible de la cámara; **pirámide más alta** (hiladas de 2.05 en vez de 1.5 → altura ~14.35, +37%) con emisores reescalados; **montañas aún más cercanas** (desde ~52 unidades, picos ~90); **paisaje desértico desolado casi monocromático**: fondo/niebla/luces/texturas desaturados a grises arena, colinas y valles ondulados en el campo medio (`hills` por value-noise + ridge), ~200 **rocas pequeñas instanciadas** (dodecaedros achatados con tinte gris variable) esparcidas por el terreno, y laderas lejanas suavizadas (`soften`) que se difuminan en la atmósfera grisácea; **hover = ensamblaje suspendido**: los bloques bajo el cursor **levitan** (dirección de elevación dominada por +Y), con bamboleo senoidal por bloque (`floatPhase/floatSpeed`) y rotación lenta de deriva solo mientras están suspendidos (0 en reposo → alineación intacta), como piezas siendo montadas una a una sobre la estructura; **energía blanca intensa sci-fi**: núcleo más grande y ceñido a los bloques, halo aditivo más opaco, luz puntual principal 3.4/110 + **segunda luz baja** que derrama el brillo sobre la arena por las juntas de la base, y término del núcleo mucho más fuerte en el raymarch volumétrico (falloff más ancho); **Panel Editor: sección de intro cinematográfica editable** (Inicio X/Y/Z del vuelo, Altura media, Curva lateral — reconstruyen la curva Catmull-Rom en vivo y se exportan en el JSON junto a la duración). |
| V10 | `pyra-desierto-v10.html` | **Panel Timeline estilo Unity para la intro cinematográfica** (sustituye a los sliders de intro del panel derecho): botón "Timeline" junto a "Editor" abre un panel inferior con **regla fija 0–15 s**, un **clip dorado cuyo ancho ES la duración** (arrastrar su borde derecho la alarga/achica, 1–15 s), **keyframes ◆ arrastrables** horizontalmente para retemporizarlos (clampeados entre vecinos; el primero y el último están bloqueados en t=0/t=1 y el último apunta siempre a la cámara final), **inspector** del keyframe seleccionado con inputs numéricos t/X/Y/Z en vivo, botones **+ KF / − KF** (añade en la posición del playhead muestreando la curva actual; solo se borran los intermedios), **scrub con preview de cámara** (clic/arrastre dentro del clip mueve el playhead y la cámara lo sigue mientras el panel está abierto) y **▶ Play** para reproducir la intro. Modelo de datos: `CFG.keyframes = [{t, pos|null}]` — curva espacial Catmull-Rom por las posiciones + **remapeo temporal lineal por tramos** (`sampleIntroPos`: p→u según los t de cada keyframe), de modo que arrastrar un ◆ acelera/frena ese tramo del vuelo sin cambiar la trayectoria; el JSON de "Copiar config" ahora exporta `keyframes` y `introDuration`. El playhead se sincroniza cada frame con la reproducción real. |
| V11 | `pyra-desierto-v11.html` | **Fix del estiramiento del clip en el Timeline**: asa de redimensionado más grande con zona de agarre extendida (-right-2 / w-5), `setPointerCapture` + `preventDefault` + `touch-action:none` para un drag fiable, y además un **input numérico de duración** (1–15 s) sincronizado en el header del panel como vía alternativa. **Nueva fase de "nacimiento holográfico"** tras el loader y antes del vuelo (fase separada con flash de materialización — rediseñada en V12). |
| V12 | `pyra-desierto-v12.html` | **El nacimiento holográfico ahora ES la intro del Timeline** (una sola secuencia, sin fase separada ni flash): el vuelo por defecto **empieza en el cénit** (2, 88, 10) mirando hacia abajo y desciende hasta la cámara final (duración por defecto 9 s). Todo el nacimiento se conduce por **`seqP`** — el progreso del vuelo, o el playhead cuando se hace scrub en el Timeline, lo que convierte al panel en una **mesa de edición del nacimiento completo** (scrub hacia atrás = vuelve el blueprint): el **wireframe de la pirámide se dibuja de arriba hacia abajo** (segmentos construidos ápice-primero + `setDrawRange`), y **en simultáneo un frente de materialización barre desde el ápice** (`revealY` desciende de PYR_H+2.5 a −2 en seqP 0.06–0.85): cada bloque hace scale-in con banda suave (smoothstep de 2.6 unidades) y un drop-in de 1.4; el vértice dorado materializa primero (seqP 0.04–0.16). **El piso arranca como geometría de líneas blancas**: nueva rejilla wireframe del terreno real (`floorWire`, LineSegments aditivos muestreando `duneH` a 0.12 sobre la superficie, 64 divisiones sobre 480²) visible desde el inicio, mientras el **suelo texturizado, rocas, estrellas, viento y niebla volumétrica hacen fade-in en sincronía** (`matW`, seqP 0.22–0.9; ground/rocks ahora con materiales transparent). La **red IA + núcleo esférico** viven durante el descenso y se disuelven cuando la materia gana (`holoK`, seqP 0.55–0.9); las líneas blueprint se disuelven al final (`wireOut`, seqP 0.8–0.98). Hover desactivado mientras los bloques materializan; se eliminaron `worldObjects`/flash/fase holo separada. |

---

## 3. Stack técnico

- **Three.js r128** (CDN cdnjs) — sin bundler, vanilla JS en un IIFE.
- **GSAP 3.12.2** (CDN cdnjs) — intro, respiración global de la fractura, flotación del vértice, UI.
- **HTML/CSS puro** para UI (loader, nav, panel editor, cursor personalizado, grano de película en SVG data-URI).
- **Fuentes (Google Fonts):** Cinzel (display monumental), Jost (cuerpo), IBM Plex Mono (etiquetas/UI técnica).
- Sin dependencias de build. Abrir el HTML en un navegador con WebGL es suficiente.

### Paleta
| Token | Hex | Uso |
|---|---|---|
| `--night` | `#0d0a07` | fondo/cielo |
| `--sand` | `#d8a24a` | acento dorado |
| `--bone` | `#efe4cf` | texto principal |
| `--dust` | `rgba(239,228,207,.45)` | texto secundario |
| `--hairline` | `rgba(216,162,74,.25)` | líneas/bordes |
| Núcleo | blanco `#ffffff` / `#f2f6ff` | energía interior |

---

## 4. Arquitectura del código (orden dentro del `<script>` principal)

1. **`CFG`** — objeto de configuración editable en vivo por el panel:
   ```js
   { cam:{x:0,y:10,z:52}, look:{x:0,y:9.5,z:0}, introDuration:5.6,
     fov:55, sway:1, fogDensity:1, coreEnergy:1 }
   ```
2. **Cursor personalizado** — punto dorado (mix-blend difference); aro blanco al estar sobre la pirámide; crece sobre links/inputs. Oculto en táctil.
3. **Renderer/escena** — DPR cap 1.5, `FogExp2` ligera de respaldo, luces: ambient cálida, hemisférica, direccional naranja (sol bajo tras la pirámide), direccional azul tenue (luna).
4. **Suelo de desierto realista**:
   - `makeSandTexture()`: CanvasTexture 512² procedural — bandas diagonales de ondulación de viento (senos) + grano aleatorio por píxel, repeat 26×26, usada como `map` y `bumpMap` (bumpScale 0.35).
   - Altura `duneH(x,z)`: claro casi plano bajo la pirámide (radio ~16), **montículos orgánicos** por value-noise en campo cercano/medio (como la referencia), y **montañas-duna** con crestas `ridge = 1-|sin|` a partir de ~110 unidades (hasta ~35 de alto) que se pierden en la niebla.
5. **Pirámide fracturada** (`InstancedMesh`, ~300 cajas, solo cáscara exterior):
   - Construcción por capas escalonadas (11 capas, altura 20, base 13.5, GAP 0.14 entre bloques).
   - Cada bloque: `home`, dirección radial de apertura (`dir`, con +0.3 en Y), eje de rotación aleatorio, `phase/speed/amp` para el idle, e **`inf`** (influencia de hover suavizada por bloque).
   - **Idle:** seno lento por bloque × `fracture.idle`, que GSAP hace respirar globalmente (yoyo 5.5 s entre 0.55 y 1).
   - **Hover (fix V4):** raycast contra un cono proxy invisible; el objetivo de influencia se calcula por distancia al punto de impacto (radio 9, `smoothstep^1.5`) y **`B.inf` se interpola hacia él** (ease-in 0.055, ease-out 0.028). Mientras hay influencia, la apertura del hover **sustituye** al seno idle (`disp = idle*(1-inf) + inf*1.25`), por lo que los bloques se mantienen abiertos de forma estable bajo el cursor en vez de oscilar y re-unirse. Todo lerp → sutil y suave.
6. **Núcleo de energía blanca:** cono blanco sólido dentro de la pirámide + cono halo aditivo + `PointLight` blanca pulsante (GSAP yoyo). La luz se filtra por las juntas entre bloques y se intensifica con el hover. También inyecta luz blanca en la niebla volumétrica (uniform `uEnergy`).
7. **Vértice (capstone):** pequeña pirámide emisiva blanca-cálida flotando sobre el ápice (GSAP: flotación yoyo + rotación continua 52 s).
8. **Sol de horizonte:** disco naranja + halo aditivo en (-24, 10, -220), `fog:false`. **Estrellas:** 900 puntos en cúpula alta.
9. **Shader de raymarching volumétrico** (post-proceso consciente de profundidad):
   - Pase 1: escena → `WebGLRenderTarget` con `DepthTexture`.
   - Pase 2 (quad fullscreen): reconstruye posición mundial por píxel desde el depth (`invProj`/`invView`), marcha el rayo (42 pasos desktop / 22 móvil) con jitter por píxel anti-banding.
   - **Densidad realista:** niebla de altura exponencial (`exp(-y*0.055)`) siempre presente, modulada suavemente por FBM 3 octavas a la deriva con el viento — sin parches.
   - **Luz in-scatter:** fase forward (tipo Henyey-Greenstein aproximada) del sol naranja + **resplandor blanco del núcleo** (falloff 1/(1+d²)) + ambiente frío del cielo. Acumulación con transmitancia `T *= exp(-a)` y early-out en T<0.015.
   - **Aberración cromática** sutil (offset RGB radial, más fuerte en bordes) + viñeta.
10. **Cámara:** `introPath` Catmull-Rom de 4 puntos cuyo último punto es `finalPos` (se reconstruye si el editor cambia valores). Tras la intro: `camPos = finalPos` + **idle sway** (senos 0.18–0.29 Hz en 3 ejes, escalado por `CFG.sway`) + parallax de ratón. lookAt interpola de (0,9,0) a `finalLook` durante la intro.
11. **Loader → `playIntro(first)`** — reutilizable por el botón Replay del editor.
12. **Panel Editor** — array `bindings` [id, getter, setter] conecta cada slider a su valor en vivo; "Copiar config" serializa el estado a JSON (portapapeles o consola).
13. **Loop `animate()`** — orden: cámara → hover → pirámide → pulsos de energía → uniforms → render 2 pasos.
14. **Resize** — actualiza cámara, renderer y render target.

---

## 5. Accesibilidad y rendimiento

- `prefers-reduced-motion`: intro casi instantánea, sin sway, idle de fractura reducido, densidad de niebla 0.6, animaciones CSS desactivadas.
- Móvil (<700px): 22 pasos de raymarch, cursor personalizado oculto.
- DPR cap 1.5; InstancedMesh (1 draw call para ~300 bloques); solo cáscara exterior de la pirámide (interiores descartados); FBM de 3 octavas; early-out del raymarch.

---

## 6. Decisiones de diseño

- **Tipografía:** Cinzel (lapidaria/monumental, evoca piedra tallada) para display; IBM Plex Mono para el "chrome" técnico (coordenadas, labels), siguiendo el lenguaje de igloo.inc; Jost para cuerpo.
- **Dirección de arte:** noche de desierto — cielo casi negro cálido, sol muy bajo naranja en el horizonte tras la pirámide (silueta + scattering), luz lunar azul tenue de relleno, niebla que come las montañas del fondo.
- **Firma visual:** la pirámide de bloques que respira con **energía blanca interior** filtrándose por las grietas (equivalente al hielo iluminado del iglú de la referencia).
- Copy en español; marca ficticia "PYRA — Estudio digital, Guiza · MMXXVI".

## 7. Notas y honestidad técnica

- Los shaders de igloo.inc son **código cerrado**: no se copiaron. El shader volumétrico de este proyecto es **original**, escrito con la misma técnica general (raymarching de niebla con scattering) documentada públicamente.
- El progreso del loader es simulado (no hay assets pesados que cargar).
- Three.js r128: usar APIs compatibles con esa versión (p. ej. `PlaneGeometry`, `InstancedMesh.setMatrixAt`, `WebGLRenderTarget.depthTexture`).

## 8. Ideas pendientes / siguientes pasos sugeridos

- Sonido ambiente (viento) con toggle "Sound: On/Off" como la referencia.
- Texto UI en WebGL con efectos de glitch/scramble (técnica del case study).
- Contenido real del cliente (nombre, manifiesto, links) sustituyendo el copy provisional de PYRA.
- Export del editor a un preset persistente (localStorage no disponible en artefactos de Claude.ai; usar copia manual del JSON a `CFG`).
- Ondulación animada de la arena (desplazamiento del bumpMap con el tiempo) y granos de polvo solo cerca del suelo.
- Modo día/atardecer alternativo cambiando paleta de luces y niebla.
