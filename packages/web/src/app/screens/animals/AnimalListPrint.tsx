/**
 * Listado imprimible (A4) del listado filtrado. `?modo=listado` (por defecto) o `?modo=acogida`
 * (acogida/propietarios: añade el contacto del último evento con contacto; pide `withContacts=true`).
 */
import { useSearchParams } from 'react-router-dom';
import { contactFullName, MAX_PAGE_SIZE, todayMadrid, type AnimalFilters } from '@modepran/domain';
import type { AnimalListItem } from '../../../lib/api';
import { fmtDate, fmtGender } from '../../../lib/format';
import { filtersFromParams, sortFromParams } from '../../components/animals/filters';
import { PrintBar } from '../../components/PrintView';
import { useAsync, useSession } from '../../context';
import { RequirePerm } from '../../Layout';
import { Empty, ErrorBox, Loading, Notice } from '../../ui';

export default function AnimalListPrint() {
  return (
    <RequirePerm perm="animals:read">
      <Inner />
    </RequirePerm>
  );
}

function Inner() {
  const s = useSession();
  const [params] = useSearchParams();
  const mode = params.get('modo') === 'acogida' && s.can('animals:read_contacts') ? 'acogida' : 'listado';
  const filters = filtersFromParams(params);
  const sort = sortFromParams(params);
  const res = useAsync(async () => {
    const q = (mode === 'acogida' ? { ...filters, withContacts: true } : filters) as AnimalFilters;
    const all: AnimalListItem[] = [];
    let page = 1;
    for (;;) {
      const p = await s.api.animals.list(q, page, MAX_PAGE_SIZE, sort);
      all.push(...p.items);
      if (page >= p.pages || p.items.length === 0) break;
      page++;
    }
    return all;
  }, [params.toString()]);

  const title = mode === 'acogida' ? 'Listado de acogida / propietarios' : 'Listado de animales';
  if (res.loading) return <Loading label="Preparando el listado…" />;
  if (res.error) return <ErrorBox error={res.error} onRetry={res.reload} />;
  const items = res.data ?? [];
  const missingContacts = mode === 'acogida' && items.length > 0 && items.every((a) => a.lastContact === undefined);

  return (
    <div>
      <PrintBar title={`${title} (${items.length})`} />
      {missingContacts && (
        <div className="no-print mx-3 mb-3">
          <Notice tone="warn">La API no ha devuelto los contactos de este listado: la columna de contacto sale vacía.</Notice>
        </div>
      )}
      {items.length === 0 ? (
        <Empty title="No hay animales con estos filtros" />
      ) : (
        <div className="print-doc px-3 print:px-0">
          <h1>
            {title} · {fmtDate(todayMadrid())}
          </h1>
          <table className="text-[9pt]">
            <thead>
              <tr>
                <th>Nº</th>
                <th>Nombre</th>
                <th>Especie</th>
                <th>Sexo</th>
                <th>Estado</th>
                <th>Centro</th>
                <th>Chip</th>
                {mode === 'listado' ? (
                  <>
                    <th>Últ. llegada</th>
                    <th>Ciudad</th>
                  </>
                ) : (
                  <>
                    <th>Contacto</th>
                    <th>Teléfono</th>
                    <th>Dirección</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id}>
                  <td>{a.id}</td>
                  <td>{a.name}</td>
                  <td>{s.name('species', a.speciesId)}</td>
                  <td>{fmtGender(a.gender)}</td>
                  <td>{s.name('statuses', a.statusId)}</td>
                  <td>{a.centerId ? s.name('centers', a.centerId) : ''}</td>
                  <td>{a.chip?.number ?? ''}</td>
                  {mode === 'listado' ? (
                    <>
                      <td>{fmtDate(a.lastArrival?.date)}</td>
                      <td>{a.lastArrival?.cityName ?? ''}</td>
                    </>
                  ) : (
                    <>
                      <td>{a.lastContact ? contactFullName(a.lastContact) : '—'}</td>
                      <td>{a.lastContact?.phone ?? ''}</td>
                      <td>{a.lastContact ? [a.lastContact.address, a.lastContact.zip, a.lastContact.cityName].filter(Boolean).join(', ') : ''}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
