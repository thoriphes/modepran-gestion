/** Documentos: impresos en blanco y (admin) editor de plantillas. */
import { Link } from 'react-router-dom';
import { TEMPLATE_SLUGS, type TemplateSlug } from '@modepran/domain';
import { TEMPLATE_NAMES } from '../../components/animals/docs';
import { useSession } from '../../context';
import { RequirePerm } from '../../Layout';
import { Card, PageHeader } from '../../ui';

export default function DocumentsHome() {
  return (
    <RequirePerm any={['documents:generate', 'documents:vet']}>
      <Inner />
    </RequirePerm>
  );
}

function Inner() {
  const s = useSession();
  // Modevet solo ve los impresos veterinarios.
  const slugs: TemplateSlug[] = s.can('documents:generate') ? [...TEMPLATE_SLUGS] : ['veterinario'];
  const canEdit = s.can('templates:write');
  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Documentos"
        subtitle="Los documentos rellenos se generan desde el historial de cada animal (botón «Documento»). Aquí están los impresos en blanco."
      />
      <Card bodyClassName="p-0">
        <ul className="divide-y divide-stone-100 dark:divide-stone-800">
          {slugs.map((slug) => (
            <li key={slug} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <span className="font-medium">📄 {TEMPLATE_NAMES[slug]}</span>
              <span className="flex gap-3 text-sm">
                <Link className="text-accent-700 underline dark:text-accent-300" to={`/documentos/blanco/${slug}`}>
                  Imprimir en blanco
                </Link>
                {canEdit && (
                  <Link className="text-accent-700 underline dark:text-accent-300" to={`/plantillas/${slug}`}>
                    Editar plantilla
                  </Link>
                )}
              </span>
            </li>
          ))}
        </ul>
      </Card>
      <p className="mt-3 text-sm text-stone-500">Consejo: para guardar en PDF, usa «Imprimir» y elige «Guardar como PDF» como impresora.</p>
    </div>
  );
}
