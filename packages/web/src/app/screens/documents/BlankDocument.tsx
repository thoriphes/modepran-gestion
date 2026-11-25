/** Impreso en blanco de una plantilla (`/documentos/blanco/:slug`, `GET /documents/blank/:slug`). */
import { useParams } from 'react-router-dom';
import { TEMPLATE_SLUGS, type TemplateSlug } from '@modepran/domain';
import { PrintView } from '../../components/PrintView';
import { useAsync, useSession } from '../../context';
import { RequirePerm } from '../../Layout';
import { ErrorBox, Loading } from '../../ui';

export default function BlankDocument() {
  return (
    <RequirePerm any={['documents:generate', 'documents:vet']}>
      <Inner />
    </RequirePerm>
  );
}

function Inner() {
  const { slug } = useParams();
  const s = useSession();
  const valid = (TEMPLATE_SLUGS as readonly string[]).includes(slug ?? '');
  const res = useAsync(() => (valid ? s.api.documents.blank(slug as TemplateSlug) : Promise.reject(new Error('Plantilla desconocida.'))), [slug]);
  if (res.loading) return <Loading />;
  if (res.error) return <ErrorBox error={res.error} onRetry={res.reload} />;
  if (!res.data) return null;
  return <PrintView title={`${res.data.title} · en blanco`} pages={[res.data.html]} />;
}
