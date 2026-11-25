/**
 * Entrada de `/adopta/`: muestra el listado, o la ficha si la ruta es `/adopta/<id>` (por si CloudFront
 * acaba sirviendo `adopta/index.html` como fallback de esas rutas).
 */
import { useEffect, useState } from 'react';
import AdoptDetail from './AdoptDetail';
import AdoptList from './AdoptList';

export default function AdoptPage() {
  const [detailId, setDetailId] = useState<number | null | undefined>(undefined);
  useEffect(() => {
    const m = window.location.pathname.match(/^\/adopta\/(\d+)\/?$/);
    setDetailId(m ? Number(m[1]) : null);
  }, []);
  if (detailId === undefined) return null;
  return detailId ? <AdoptDetail id={detailId} /> : <AdoptList />;
}
