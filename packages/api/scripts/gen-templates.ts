/** Genera src/templates/defaults.generated.ts a partir de src/templates/defaults/*.html (para que esbuild las empaquete). */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SLUGS = ['llegada', 'adopcion', 'dueno', 'eutanasia', 'acogida', 'veterinario', 'ficha'] as const;
const dir = fileURLToPath(new URL('../src/templates/', import.meta.url));

export function generate(): string {
  const body = SLUGS.map((s) => {
    const filled = readFileSync(`${dir}defaults/${s}.filled.html`, 'utf8').replace(/\r\n/g, '\n');
    const blank = readFileSync(`${dir}defaults/${s}.blank.html`, 'utf8').replace(/\r\n/g, '\n');
    return `  ${s}: {\n    filled: ${JSON.stringify(filled)},\n    blank: ${JSON.stringify(blank)},\n  },`;
  }).join('\n');
  return (
    '// GENERADO por scripts/gen-templates.ts a partir de src/templates/defaults/*.html. No editar a mano:\n' +
    '// edita los .html y ejecuta `npm run gen:templates -w @modepran/api`.\n' +
    "import type { TemplateSlug } from '@modepran/domain';\n\n" +
    'export const DEFAULT_TEMPLATE_BODIES: Record<TemplateSlug, { filled: string; blank: string }> = {\n' +
    body +
    '\n};\n'
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(`${dir}defaults.generated.ts`, generate());
  console.log('defaults.generated.ts actualizado');
}
