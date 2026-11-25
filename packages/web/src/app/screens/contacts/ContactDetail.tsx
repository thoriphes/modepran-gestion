/** Ficha de contacto: datos, eventos/animales en los que aparece, editar y borrar (solo sin eventos). */
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { contactFullName, EVENT_TYPE_NAMES, isSinDatos, normalizeContactData, type Contact, type ContactData } from '@modepran/domain';
import { errorMessage } from '../../../lib/api';
import { fmtDate } from '../../../lib/format';
import { options, useAction, useAsync, useSession } from '../../context';
import { RequirePerm } from '../../Layout';
import { Badge, Button, Card, DL, Empty, ErrorBox, Loading, Modal, PageHeader, Select, TextInput } from '../../ui';
import { KIND_LABELS } from './ContactList';

export default function ContactDetail() {
  return (
    <RequirePerm any={['contacts:read', 'contacts:own_clients']}>
      <Inner />
    </RequirePerm>
  );
}

function Inner() {
  const { id } = useParams();
  const contactId = Number(id);
  const s = useSession();
  const navigate = useNavigate();
  const d = useAsync(() => s.api.contacts.get(contactId), [s.api, contactId]);
  const [editing, setEditing] = useState(false);
  const del = useAction(async () => {
    await s.api.contacts.remove(contactId);
    navigate('/contactos', { replace: true });
  });

  if (!Number.isFinite(contactId)) return <Empty title="Contacto no válido" />;
  if (d.loading) return <Loading />;
  if (d.error) return <ErrorBox error={d.error} onRetry={d.reload} />;
  if (!d.data) return null;
  const { contact: c, events } = d.data;
  const canWrite = s.can('contacts:write');
  const canDelete = canWrite && events.length === 0 && !isSinDatos(c);

  return (
    <div className="space-y-4">
      <PageHeader
        title={contactFullName(c)}
        subtitle={
          <span className="flex flex-wrap gap-1">
            {c.kind.map((k) => (
              <Badge key={k}>{KIND_LABELS[k] ?? k}</Badge>
            ))}
          </span>
        }
        actions={
          <>
            <Button onClick={() => navigate(-1)} variant="ghost">
              ← Volver
            </Button>
            {canWrite && !isSinDatos(c) && <Button onClick={() => setEditing(true)}>Editar</Button>}
            {canWrite && (
              <Button
                variant="danger"
                disabled={!canDelete}
                loading={del.busy}
                title={canDelete ? 'Borrar contacto' : 'Solo se pueden borrar contactos sin eventos'}
                onClick={() => {
                  if (window.confirm(`¿Borrar el contacto ${contactFullName(c)}? No se puede deshacer.`)) void del.run();
                }}
              >
                Borrar
              </Button>
            )}
          </>
        }
      />
      {!!del.error && <ErrorBox error={del.error} />}
      <Card title="Datos">
        <DL
          items={[
            ['Nombre', c.name],
            ['Apellidos', c.surname],
            ['NIF', c.nif],
            ['Teléfono', c.phone ? <a href={`tel:${c.phone}`}>{c.phone}</a> : undefined],
            ['Email', c.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : undefined],
            ['Dirección', c.address],
            ['CP', c.zip],
            ['Ciudad', c.cityName ?? (c.cityId ? s.name('cities', c.cityId) : undefined)],
            ['Provincia', c.province],
            ['Alta', fmtDate(c.createdAt?.slice(0, 10))],
          ]}
        />
      </Card>
      <Card title={`Historial (${events.length})`} bodyClassName="p-0">
        {!events.length ? (
          <Empty title="No aparece en ningún evento" />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-dense">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Animal</th>
                  <th>Tipo</th>
                  <th>Subtipo</th>
                  <th className="hidden md:table-cell">Notas</th>
                </tr>
              </thead>
              <tbody>
                {events
                  .slice()
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((e) => (
                    <tr key={e.id}>
                      <td className="whitespace-nowrap">{fmtDate(e.date)}</td>
                      <td>
                        <Link to={`/animales/${e.animalId}`} className="text-accent-700 hover:underline dark:text-accent-300">
                          {e.animalName ?? `nº ${e.animalId}`}
                        </Link>
                      </td>
                      <td>{EVENT_TYPE_NAMES[e.typeId] ?? e.typeId}</td>
                      <td>{s.name('subtypes', e.subtypeId)}</td>
                      <td className="hidden max-w-80 truncate md:table-cell">{e.notes ?? ''}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {editing && (
        <EditContact
          contact={c}
          onClose={() => setEditing(false)}
          onSaved={(updated) => {
            d.setData((prev) => (prev ? { ...prev, contact: updated } : prev));
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}

function EditContact({ contact, onClose, onSaved }: { contact: Contact; onClose: () => void; onSaved: (c: Contact) => void }) {
  const s = useSession();
  const [form, setForm] = useState<ContactData>({
    name: contact.name,
    ...(contact.surname ? { surname: contact.surname } : {}),
    ...(contact.nif ? { nif: contact.nif } : {}),
    ...(contact.address ? { address: contact.address } : {}),
    ...(contact.zip ? { zip: contact.zip } : {}),
    ...(contact.province ? { province: contact.province } : {}),
    ...(contact.cityId ? { cityId: contact.cityId } : {}),
    ...(contact.cityName ? { cityName: contact.cityName } : {}),
    ...(contact.phone ? { phone: contact.phone } : {}),
    ...(contact.email ? { email: contact.email } : {}),
  });
  const save = useAction(async () => onSaved(await s.api.contacts.update(contact.id, normalizeContactData(form))));
  const set = (k: keyof ContactData) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  return (
    <Modal
      open
      onClose={onClose}
      title="Editar contacto"
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={save.busy} disabled={!form.name.trim()} onClick={() => void save.run()}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <TextInput label="Nombre *" value={form.name} onChange={set('name')} required />
        <TextInput label="Apellidos" value={form.surname ?? ''} onChange={set('surname')} />
        <TextInput label="NIF" value={form.nif ?? ''} onChange={set('nif')} />
        <TextInput label="Teléfono" type="tel" value={form.phone ?? ''} onChange={set('phone')} />
        <TextInput label="Email" type="email" value={form.email ?? ''} onChange={set('email')} className="sm:col-span-2" />
        <TextInput label="Dirección" value={form.address ?? ''} onChange={set('address')} className="sm:col-span-2" />
        <TextInput label="CP" value={form.zip ?? ''} onChange={set('zip')} />
        <TextInput label="Provincia" value={form.province ?? ''} onChange={set('province')} />
        <Select
          label="Ciudad"
          placeholder="—"
          options={options(s.catalogs.cities, form.cityId)}
          value={form.cityId ?? ''}
          onChange={(e) => {
            const next = { ...form };
            if (e.target.value) {
              next.cityId = e.target.value;
              next.cityName = s.name('cities', e.target.value);
            } else {
              delete next.cityId;
              delete next.cityName;
            }
            setForm(next);
          }}
        />
      </div>
      {!!save.error && (
        <div className="mt-3">
          <ErrorBox error={new Error(errorMessage(save.error))} />
        </div>
      )}
    </Modal>
  );
}
