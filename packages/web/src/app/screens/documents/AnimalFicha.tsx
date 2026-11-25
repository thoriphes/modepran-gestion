/** Ficha imprimible de un animal (plantilla `ficha`). */
import { useParams } from 'react-router-dom';
import { fillTemplate } from '../../components/animals/docs';
import { PrintView } from '../../components/PrintView';
import { useAsync, useSession } from '../../context';
import { RequirePerm } from '../../Layout';
import { ErrorBox, Loading } from '../../ui';

export default function AnimalFicha() {
  return (
    <RequirePerm any={['documents:generate', 'documents:vet']}>
      <Inner />
    </RequirePerm>
  );
}

function Inner() {
  const { id } = useParams();
  const s = useSession();
  const res = useAsync(() => s.api.documents.animal(Number(id)), [id]);
  if (res.loading) return <Loading label="Preparando la ficha…" />;
  if (res.error) return <ErrorBox error={res.error} onRetry={res.reload} />;
  if (!res.data) return null;
  const { template, data, dict } = res.data;
  return <PrintView title={`Ficha de ${data.animal.name} (nº ${data.animal.id})`} pages={[fillTemplate(template, data, dict)]} />;
}
