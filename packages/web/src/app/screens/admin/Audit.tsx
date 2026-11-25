/** Auditoría (solo admin): registro de acciones con filtros, "cargar más" y exportaciones CSV. */
import { useEffect, useState } from 'react';
import type { AuditEntry } from '@modepran/domain';
import { errorMessage, type AuditQuery } from '../../../lib/api';
import { downloadBlob, fmtDateTime } from '../../../lib/format';
import { RequirePerm } from '../../Layout';
import { useSession } from '../../context';
import { Badge, Button, Card, Empty, ErrorBox, Loading, PageHeader, Select, TextInput } from '../../ui';

const ENTITIES = ['animal', 'event', 'contact', 'catalog', 'template', 'agenda', 'incident', 'user', 'export'];
const ACTIONS = ['create', 'update', 'delete', 'export', 'login', 'purge'];
const ACTION_LABELS: Record<string, string> = { create: 'Crear', update: 'Modificar', delete: 'Borrar', export: 'Exportar', login: 'Entrar', purge: 'Borrado definitivo' };
const EXPORTS: { what: string; label: string }[] = [
  { what: 'animals', label: 'Animales' },
  { what: 'contacts', label: 'Contactos' },
  { what: 'events', label: 'Historial' },
  { what: 'agenda', label: 'Agenda' },
  { what: 'incidents', label: 'Incidencias' },
  { what: 'audit', label: 'Auditoría' },
];

export default function Audit() {
  const s = useSession();
  const [draft, setDraft] = useState<AuditQuery>({});
  const [query, setQuery] = useState<AuditQuery>({});
  const [items, setItems] = useState<AuditEntry[]>([]);
  const [next, setNext] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>();
  const [exporting, setExporting] = useState<string>();
  const [exportError, setExportError] = useState<string>();

  async function load(q: AuditQuery, append: boolean) {
    setLoading(true);
    setError(undefined);
    try {
      const r = await s.api.admin.audit(q);
      setItems((prev) => (append ? [...prev, ...r.items] : r.items));
      setNext(r.next);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load(query, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function exportCsv(what: string) {
    setExporting(what);
    setExportError(undefined);
    try {
      const csv = await s.api.admin.exportCsv(what);
      const body = csv.startsWith('﻿') ? csv : `﻿${csv}`;
      downloadBlob(new Blob([body], { type: 'text/csv;charset=utf-8' }), `modepran-${what}-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (e) {
      setExportError(errorMessage(e));
    } finally {
      setExporting(undefined);
    }
  }

  const set = (k: keyof AuditQuery, v: string) => setDraft((d) => ({ ...d, [k]: v || undefined }));

  return (
    <RequirePerm perm="audit:read">
      <PageHeader title="Auditoría" subtitle="Registro de solo inserción de lo que se hace en la aplicación." />
      <div className="grid gap-4">
        <Card title="Exportar CSV" bodyClassName="p-4 space-y-2">
          <div className="flex flex-wrap gap-2">
            {EXPORTS.map((e) => (
              <Button key={e.what} size="sm" loading={exporting === e.what} disabled={!!exporting && exporting !== e.what} onClick={() => void exportCsv(e.what)}>
                ⬇ {e.label}
              </Button>
            ))}
          </div>
          <p className="text-xs text-stone-500">Contienen datos personales: guárdalos solo donde sea necesario y bórralos al terminar. Cada exportación queda registrada.</p>
          {exportError && <ErrorBox error={exportError} />}
        </Card>

        <Card bodyClassName="p-0">
          <form
            className="grid gap-3 border-b border-stone-200 p-3 sm:grid-cols-3 lg:grid-cols-6 dark:border-stone-800"
            onSubmit={(e) => {
              e.preventDefault();
              setQuery({ ...draft });
            }}
          >
            <TextInput label="Desde" type="date" value={draft.from ?? ''} onChange={(e) => set('from', e.target.value)} />
            <TextInput label="Hasta" type="date" value={draft.to ?? ''} onChange={(e) => set('to', e.target.value)} />
            <TextInput label="Usuario" placeholder="id o email" value={draft.userId ?? ''} onChange={(e) => set('userId', e.target.value)} />
            <Select label="Entidad" value={draft.entity ?? ''} onChange={(e) => set('entity', e.target.value)} options={ENTITIES.map((x) => ({ value: x, label: x }))} placeholder="Todas" />
            <Select label="Acción" value={draft.action ?? ''} onChange={(e) => set('action', e.target.value)} options={ACTIONS.map((x) => ({ value: x, label: ACTION_LABELS[x] ?? x }))} placeholder="Todas" />
            <div className="flex items-end gap-2">
              <Button type="submit" variant="primary">
                Filtrar
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setDraft({});
                  setQuery({});
                }}
              >
                Limpiar
              </Button>
            </div>
          </form>
          {error !== undefined && (
            <div className="p-3">
              <ErrorBox error={error} onRetry={() => void load(query, false)} />
            </div>
          )}
          {loading && items.length === 0 ? (
            <Loading />
          ) : items.length === 0 && !error ? (
            <Empty title="Sin registros" icon="🧾">
              No hay acciones con estos filtros.
            </Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="table-dense">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Usuario</th>
                    <th>Acción</th>
                    <th>Entidad</th>
                    <th>Resumen</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((a) => (
                    <tr key={a.id}>
                      <td className="whitespace-nowrap">{fmtDateTime(a.at)}</td>
                      <td>{a.userName || a.userId}</td>
                      <td>
                        <Badge tone={a.action === 'delete' || a.action === 'purge' ? 'red' : a.action === 'create' ? 'green' : a.action === 'export' ? 'amber' : 'neutral'}>
                          {ACTION_LABELS[a.action] ?? a.action}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap">
                        {a.entity} <span className="text-stone-400">#{a.entityId}</span>
                      </td>
                      <td>{a.summary}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {next && (
            <div className="flex justify-center p-3">
              <Button loading={loading} onClick={() => void load({ ...query, cursor: next }, true)}>
                Cargar más
              </Button>
            </div>
          )}
        </Card>
      </div>
    </RequirePerm>
  );
}
