/** Usuarios (solo admin): crear (Cognito envía la invitación), cambiar perfiles, desactivar. */
import { useState } from 'react';
import { PROFILES, type Profile, type User } from '@modepran/domain';
import { errorMessage } from '../../../lib/api';
import { fmtDateTime } from '../../../lib/format';
import { RequirePerm } from '../../Layout';
import { options, useAsync, useSession } from '../../context';
import { Badge, Button, Checkbox, Empty, ErrorBox, Loading, Modal, Notice, PageHeader, Select, TextInput } from '../../ui';

export const PROFILE_LABELS: Record<Profile, string> = {
  admin: 'Administración',
  carlet: 'Carlet (protectora)',
  modevet: 'Modevet (clínica)',
  bienestar: 'Bienestar',
};

export default function Users() {
  const s = useSession();
  const list = useAsync(() => s.api.admin.users(), [s.api]);
  const [editing, setEditing] = useState<User | 'new' | null>(null);
  const [busyId, setBusyId] = useState<string>();
  const [error, setError] = useState<unknown>();

  async function toggle(u: User) {
    setBusyId(u.id);
    setError(undefined);
    try {
      const updated = await s.api.admin.updateUser(u.id, { active: !u.active });
      list.setData((prev) => prev?.map((x) => (x.id === u.id ? { ...x, ...updated } : x)));
    } catch (e) {
      setError(e);
    } finally {
      setBusyId(undefined);
    }
  }

  const users = [...(list.data ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'es'));

  return (
    <RequirePerm perm="users:manage">
      <PageHeader
        title="Usuarios"
        subtitle="Cuentas individuales de acceso. Los perfiles deciden qué ve y qué puede hacer cada persona."
        actions={
          <Button variant="primary" onClick={() => setEditing('new')}>
            Nuevo usuario
          </Button>
        }
      />
      {error !== undefined && (
        <div className="mb-3">
          <ErrorBox error={error} />
        </div>
      )}
      <section className="card overflow-x-auto">
        {list.loading ? (
          <Loading />
        ) : list.error ? (
          <div className="p-4">
            <ErrorBox error={list.error} onRetry={list.reload} />
          </div>
        ) : users.length === 0 ? (
          <Empty title="Todavía no hay usuarios" icon="🔑" />
        ) : (
          <table className="table-dense">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Email</th>
                <th>Perfiles</th>
                <th>Personal</th>
                <th>Alta</th>
                <th>Estado</th>
                <th className="text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className={u.active ? undefined : 'opacity-60'}>
                  <td className="font-medium">{u.name}</td>
                  <td>{u.email}</td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {u.profiles.map((p) => (
                        <Badge key={p} tone={p === 'admin' ? 'accent' : 'neutral'}>
                          {PROFILE_LABELS[p] ?? p}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td>{u.staffId ? s.name('staff', u.staffId) : '—'}</td>
                  <td className="whitespace-nowrap">{fmtDateTime(u.createdAt)}</td>
                  <td>{u.active ? <Badge tone="green">Activo</Badge> : <Badge>Desactivado</Badge>}</td>
                  <td className="text-right whitespace-nowrap">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(u)}>
                      Editar
                    </Button>
                    <Button size="sm" variant="ghost" loading={busyId === u.id} disabled={u.id === s.me.id} onClick={() => void toggle(u)}>
                      {u.active ? 'Desactivar' : 'Activar'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {editing && (
        <UserEditor
          user={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={(u) => {
            list.setData((prev) => (prev?.some((x) => x.id === u.id) ? prev.map((x) => (x.id === u.id ? u : x)) : [...(prev ?? []), u]));
            setEditing(null);
          }}
        />
      )}
    </RequirePerm>
  );
}

function UserEditor({ user, onClose, onSaved }: { user: User | undefined; onClose: () => void; onSaved: (u: User) => void }) {
  const s = useSession();
  const [email, setEmail] = useState(user?.email ?? '');
  const [name, setName] = useState(user?.name ?? '');
  const [profiles, setProfiles] = useState<Profile[]>(user?.profiles ?? []);
  const [staffId, setStaffId] = useState(user?.staffId ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function save() {
    if (!user && !/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Escribe un email válido.');
    if (!name.trim()) return setError('El nombre es obligatorio.');
    if (!profiles.length) return setError('Elige al menos un perfil.');
    setBusy(true);
    setError(undefined);
    try {
      const saved = user
        ? await s.api.admin.updateUser(user.id, { name: name.trim(), profiles, ...(staffId ? { staffId } : {}) })
        : await s.api.admin.createUser({ email: email.trim().toLowerCase(), name: name.trim(), profiles, ...(staffId ? { staffId } : {}) });
      onSaved({ ...(user ?? {}), ...saved } as User);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={user ? `Editar ${user.name}` : 'Nuevo usuario'}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={busy} onClick={() => void save()}>
            {user ? 'Guardar' : 'Crear e invitar'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {!user && <Notice>Cognito enviará un correo de invitación con una contraseña temporal; la persona la cambiará al entrar por primera vez.</Notice>}
        <TextInput label="Email" type="email" value={email} disabled={!!user} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
        <TextInput label="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
        <fieldset>
          <legend className="label">Perfiles</legend>
          <div className="space-y-1.5">
            {PROFILES.map((p) => (
              <Checkbox
                key={p}
                label={PROFILE_LABELS[p]}
                checked={profiles.includes(p)}
                disabled={!!user && user.id === s.me.id && p === 'admin'}
                onChange={(e) => setProfiles((cur) => (e.target.checked ? [...cur, p] : cur.filter((x) => x !== p)))}
                className="flex"
              />
            ))}
          </div>
        </fieldset>
        <Select
          label="Ficha de personal (opcional)"
          hint="Para que aparezca como «solicitada por» o «responsable»."
          value={staffId}
          onChange={(e) => setStaffId(e.target.value)}
          options={options(s.catalogs.staff, staffId)}
          placeholder="(ninguna)"
        />
        {error && <ErrorBox error={error} />}
      </div>
    </Modal>
  );
}
