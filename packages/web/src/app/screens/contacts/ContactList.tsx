/** Contactos: búsqueda (nombre, apellidos, NIF, teléfono) y tabla densa paginada. */
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { ContactKind } from '@modepran/domain';
import { useAsync, useSession } from '../../context';
import { RequirePerm } from '../../Layout';
import { Badge, Card, Empty, ErrorBox, Loading, Notice, PageHeader, Pagination } from '../../ui';

export const KIND_LABELS: Record<ContactKind, string> = {
  adoptante: 'Adoptante',
  acogedor: 'Acogedor',
  propietario: 'Propietario',
  avisante: 'Avisante',
  cliente_modevet: 'Cliente Modevet',
};

export default function ContactList() {
  return (
    <RequirePerm any={['contacts:read', 'contacts:own_clients']}>
      <Inner />
    </RequirePerm>
  );
}

function Inner() {
  const { api, can } = useSession();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const page = Math.max(1, Number(params.get('page') ?? '1') || 1);
  const [text, setText] = useState(q);

  useEffect(() => {
    if (text === q) return;
    const t = setTimeout(() => setParams(text ? { q: text } : {}, { replace: true }), 300);
    return () => clearTimeout(t);
  }, [text, q, setParams]);

  const list = useAsync(() => api.contacts.search(q, page, 50), [api, q, page]);
  const onlyOwn = !can('contacts:read') && can('contacts:own_clients');

  return (
    <div className="space-y-4">
      <PageHeader title="Contactos" subtitle="Adoptantes, acogedores, propietarios, avisantes y clientes de Modevet" />
      {onlyOwn && <Notice>Solo ves los clientes de las citas de Modevet.</Notice>}
      <div className="max-w-md">
        <label className="label" htmlFor="contact-q">
          Buscar
        </label>
        <input id="contact-q" className="input" type="search" placeholder="Nombre, apellidos, NIF o teléfono…" value={text} onChange={(e) => setText(e.target.value)} autoFocus />
      </div>
      <Card bodyClassName="p-0">
        {list.loading && <Loading />}
        {!!list.error && (
          <div className="p-4">
            <ErrorBox error={list.error} onRetry={list.reload} />
          </div>
        )}
        {list.data && !list.data.items.length && <Empty title={q ? 'Ningún contacto coincide' : 'No hay contactos'} icon="👤" />}
        {!!list.data?.items.length && (
          <div className="overflow-x-auto">
            <table className="table-dense">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Apellidos</th>
                  <th>NIF</th>
                  <th>Teléfono</th>
                  <th className="hidden md:table-cell">Email</th>
                  <th className="hidden md:table-cell">Ciudad</th>
                  <th>Tipo</th>
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link to={`/contactos/${c.id}`} className="font-medium text-accent-700 hover:underline dark:text-accent-300">
                        {c.name}
                      </Link>
                    </td>
                    <td>{c.surname ?? ''}</td>
                    <td className="font-mono text-xs">{c.nif ?? ''}</td>
                    <td className="whitespace-nowrap">{c.phone ?? ''}</td>
                    <td className="hidden max-w-56 truncate md:table-cell">{c.email ?? ''}</td>
                    <td className="hidden md:table-cell">{c.cityName ?? ''}</td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {c.kind.map((k) => (
                          <Badge key={k}>{KIND_LABELS[k] ?? k}</Badge>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {list.data && list.data.pages > 1 && (
        <Pagination page={list.data.page} pages={list.data.pages} total={list.data.total} onPage={(p) => setParams({ ...(q ? { q } : {}), page: String(p) })} />
      )}
    </div>
  );
}
