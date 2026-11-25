/** Documento de un evento (`/documentos/evento/:eventId`, `?blanco=1` para la versión en blanco). */
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { fillTemplate } from '../../components/animals/docs';
import { PrintView } from '../../components/PrintView';
import { useAsync, useSession } from '../../context';
import { RequirePerm } from '../../Layout';
import { ErrorBox, Loading } from '../../ui';

export default function EventDocument() {
  return (
    <RequirePerm any={['documents:generate', 'documents:vet']}>
      <Inner />
    </RequirePerm>
  );
}

function Inner() {
  const { eventId } = useParams();
  const [params] = useSearchParams();
  const blank = params.get('blanco') === '1';
  const s = useSession();
  const res = useAsync(() => s.api.documents.event(Number(eventId)), [eventId]);
  if (res.loading) return <Loading label="Preparando el documento…" />;
  if (res.error) return <ErrorBox error={res.error} onRetry={res.reload} />;
  if (!res.data) return null;
  const { template, data, dict } = res.data;
  const html = fillTemplate(template, data, dict, blank);
  return (
    <PrintView
      title={`${template.name} · ${data.animal.name} (nº ${data.animal.id})${blank ? ' · en blanco' : ''}`}
      pages={[html]}
      extra={
        <Link className="text-sm text-accent-700 underline dark:text-accent-300" to={blank ? `/documentos/evento/${eventId}` : `/documentos/evento/${eventId}?blanco=1`}>
          {blank ? 'Versión rellena' : 'Versión en blanco'}
        </Link>
      }
    />
  );
}
