/**
 * Documento de un evento (`/documentos/evento/:eventId?animal=<id>`, `&blanco=1` para la versión en blanco).
 * El HTML lo rellena el servidor (`GET /documents/event/:eventId`).
 */
import { Link, useParams, useSearchParams } from 'react-router-dom';
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
  const animal = params.get('animal');
  const s = useSession();
  const res = useAsync(
    () => s.api.documents.event(Number(eventId), { ...(animal ? { animalId: Number(animal) } : {}), blank }),
    [eventId, animal, blank],
  );
  if (res.loading) return <Loading label="Preparando el documento…" />;
  if (res.error) return <ErrorBox error={res.error} onRetry={res.reload} />;
  if (!res.data) return null;
  const q = new URLSearchParams(params);
  if (blank) q.delete('blanco');
  else q.set('blanco', '1');
  return (
    <PrintView
      title={`${res.data.title}${blank ? ' · en blanco' : ''}`}
      pages={[res.data.html]}
      extra={
        <Link className="text-sm text-accent-700 underline dark:text-accent-300" to={`/documentos/evento/${eventId}?${q}`}>
          {blank ? 'Versión rellena' : 'Versión en blanco'}
        </Link>
      }
    />
  );
}
