/**
 * Vista de impresión A4. Dos casos:
 * - HTML completo (`<!DOCTYPE html>…`, lo que devuelve la API en `/documents/*`): se pinta en un `<iframe srcdoc>`
 *   con sus propios estilos y "Imprimir" llama a `print()` del iframe (solo se imprime el documento).
 * - Fragmentos HTML: `PrintView` los envuelve en un documento y usa el mismo iframe. Solo la vista previa de
 *   fragmentos del editor de plantillas (admin) los pinta dentro de la página.
 * El HTML viene de plantillas del servidor (las edita un admin). El iframe va con `sandbox` sin scripts por si acaso.
 */
import { useRef, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui';

const isFullDocument = (html: string) => /^\s*(<!doctype|<html)/i.test(html);

export function PrintBar({ title, extra, onPrint }: { title: ReactNode; extra?: ReactNode; onPrint?: () => void }) {
  const nav = useNavigate();
  return (
    <div className="no-print sticky top-14 z-20 mb-4 flex flex-wrap items-center gap-2 border-b border-stone-200 bg-stone-50/95 px-3 py-2 backdrop-blur dark:border-stone-800 dark:bg-stone-950/95">
      <Button onClick={() => nav(-1)}>← Volver</Button>
      <h1 className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</h1>
      {extra}
      <Button variant="primary" onClick={onPrint ?? (() => window.print())}>
        🖨️ Imprimir / PDF
      </Button>
    </div>
  );
}

/** Una hoja con un fragmento HTML de plantilla. */
export function PrintSheet({ html, className }: { html: string; className?: string }) {
  return <div className={`print-sheet print-doc print-page ${className ?? ''}`} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Documento HTML completo en un iframe que crece con su contenido. */
export function DocumentFrame({ html, title, frameRef }: { html: string; title: string; frameRef?: React.RefObject<HTMLIFrameElement | null> }) {
  const local = useRef<HTMLIFrameElement>(null);
  const ref = frameRef ?? local;
  const fit = () => {
    const f = ref.current;
    const doc = f?.contentDocument;
    if (f && doc) f.style.height = `${Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight ?? 0) + 16}px`;
  };
  return (
    <iframe
      ref={ref}
      title={title}
      srcDoc={html}
      // Sin `allow-scripts`: aunque una plantilla lleve <script> o atributos on*, no se ejecutan en el origen
      // de la app. `allow-same-origin` deja medir la altura; `allow-modals`, llamar a print().
      sandbox="allow-same-origin allow-modals"
      onLoad={() => {
        fit();
        // Las imágenes (fotos firmadas, logo) cargan después: reajustar.
        ref.current?.contentDocument?.querySelectorAll('img').forEach((img) => img.addEventListener('load', fit));
      }}
      className="mx-auto block w-full max-w-[230mm] rounded bg-white shadow-md"
      style={{ minHeight: '297mm', border: 0 }}
    />
  );
}

export function PrintView({ title, pages, extra }: { title: ReactNode; pages: string[]; extra?: ReactNode }) {
  const frame = useRef<HTMLIFrameElement>(null);
  // Lo que viene de la API se pinta siempre en el iframe aislado: si una plantilla editada ya no es un documento
  // completo, se envuelve en uno (así nunca entra por innerHTML en la página de la app).
  const single = pages.length === 1 && isFullDocument(pages[0]!);
  const doc = single ? pages[0]! : `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"></head><body>${pages.join('')}</body></html>`;
  return (
    <div className="bg-stone-200/60 pb-8 print:bg-white dark:bg-stone-900">
      <PrintBar title={title} extra={extra} onPrint={() => frame.current?.contentWindow?.print()} />
      <div className="overflow-x-auto px-2 print:overflow-visible print:px-0">
        <DocumentFrame html={doc} title={typeof title === 'string' ? title : 'Documento'} frameRef={frame} />
      </div>
    </div>
  );
}
