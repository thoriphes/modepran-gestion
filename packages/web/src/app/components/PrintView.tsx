/**
 * Vista de impresión A4. Dos casos:
 * - HTML completo (`<!DOCTYPE html>…`, lo que devuelve la API en `/documents/*`): se pinta en un `<iframe srcdoc>`
 *   con sus propios estilos y "Imprimir" llama a `print()` del iframe (solo se imprime el documento).
 * - Fragmentos HTML (vista previa del editor de plantillas): hojas `.print-sheet` dentro de la página.
 * El HTML viene de plantillas del servidor (las edita un admin): es de confianza.
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
  const full = pages.length === 1 && isFullDocument(pages[0]!);
  return (
    <div className="bg-stone-200/60 pb-8 print:bg-white dark:bg-stone-900">
      <PrintBar title={title} extra={extra} {...(full ? { onPrint: () => frame.current?.contentWindow?.print() } : {})} />
      <div className="overflow-x-auto px-2 print:overflow-visible print:px-0">
        {full ? (
          <DocumentFrame html={pages[0]!} title={typeof title === 'string' ? title : 'Documento'} frameRef={frame} />
        ) : (
          pages.map((html, i) => <PrintSheet key={i} html={html} />)
        )}
      </div>
    </div>
  );
}
