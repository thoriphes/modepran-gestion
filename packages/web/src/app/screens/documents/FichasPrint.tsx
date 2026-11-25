/** Fichas masivas: una ficha por página para los animales filtrados (filtros en la URL). */
import { useSearchParams } from 'react-router-dom';
import { fillTemplate } from '../../components/animals/docs';
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
  if (!res.data || res.data.items.length === 0) return <Empty title="No hay animales con estos filtros" />;
  const { template, items, dict } = res.data;
  return <PrintView title={`Fichas masivas (${items.length})`} pages={items.map((d) => fillTemplate(template, d, dict))} />;
}
