import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Sin esto, Vite busca una configuración de PostCSS hacia arriba y encuentra
  // el `postcss.config.mjs` de la app Next.js en la raíz, que carga Tailwind y
  // su binario nativo de lightningcss. Este paquete son funciones puras de
  // dominio y SQL: no tiene una sola línea de CSS, así que esa carga solo
  // aporta una dependencia nativa capaz de tumbar la suite en una plataforma
  // donde ese binario no esté (pasó al correrla desde otro sistema).
  // Un objeto vacío corta la búsqueda en vez de heredar la de la raíz.
  css: { postcss: {} },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
