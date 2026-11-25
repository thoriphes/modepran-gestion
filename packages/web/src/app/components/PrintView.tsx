/**
 * Vista de impresión A4: barra (no se imprime) con Imprimir/Volver y una o varias hojas `.print-sheet`.
 * El HTML viene de plantillas del servidor (las edita un admin): se pinta con dangerouslySetInnerHTML.
 */
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui';

export function PrintBar({ title, extra }: { title: ReactNode; extra?: ReactNode }) {
  const nav = useNavigate();
  return (
    <div className="no-print sticky top-14 z-20 mb-4 flex flex-wrap items-center gap-2 border-b border-stone-200 bg-stone-50/95 px-3 py-2 backdrop-blur dark:border-stone-800 dark:bg-stone-950/95">
      <Button onClick={() => nav(-1)}>← Volver</Button>
      <h1 className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</h1>
      {extra}
      <Button variant="primary" onClick={() => window.print()}>
        🖨️ Imprimir / PDF
      </Button>
    </div>
  );
}

/** Una hoja con HTML de plantilla. */
export function PrintSheet({ html, className }: { html: string; className?: string }) {
  return <div className={`print-sheet print-doc print-page ${className ?? ''}`} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function PrintView({ title, pages, extra }: { title: ReactNode; pages: string[]; extra?: ReactNode }) {
  return (
    <div className="bg-stone-200/60 pb-8 print:bg-white dark:bg-stone-900">
      <PrintBar title={title} extra={extra} />
      <div className="overflow-x-auto px-2 print:overflow-visible print:px-0">
        {pages.map((html, i) => (
          <PrintSheet key={i} html={html} />
        ))}
      </div>
    </div>
  );
}
