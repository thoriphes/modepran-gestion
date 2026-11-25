/**
 * Fichas masivas de los animales filtrados (filtros en la URL). El servidor devuelve un único HTML con una
 * ficha por página (máx. 300).
 */
import { useSearchParams } from 'react-router-dom';
import { filtersFromParams } from '../../components/animals/filters';
import { PrintView } from '../../components/PrintView';
import { useAsync, useSession } from '../../context';
import { RequirePerm } from '../../Layout';
import { Empty, ErrorBox, Loading } from '../../ui';

export default function FichasPrint() {
  return (
    <RequirePerm any={['documents:generate', 'documents:vet']}>
      <Inner />
    </RequirePerm>
  );
}

function Inner() {
  const s = useSession();
  const [params] = useSearchParams();
  const res = useAsync(() => s.api.documents.fichas(filtersFromParams(params)), [params.toString()]);
  if (res.loading) return <Loading label="Preparando las fichas (puede tardar)…" />;
  if (res.error) return <ErrorBox error={res.error} onRetry={res.reload} />;
  if (!res.data || res.data.count === 0) return <Empty title="No hay animales con estos filtros" />;
  return <PrintView title={`${res.data.title}${res.data.count !== undefined ? ` (${res.data.count})` : ''}`} pages={[res.data.html]} />;
}
