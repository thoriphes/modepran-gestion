/**
 * Mi cuenta. La contraseña y el MFA se gestionan en el managed login de Cognito (la app no ve contraseñas).
 * Cambiar contraseña = flujo "he olvidado mi contraseña" del managed login (código por email).
 * MFA: pendiente de activar en el pool (TOTP opcional); cuando esté, Cognito lo pide al entrar.
 */
import { useState } from 'react';
import { PROFILES, type Profile } from '@modepran/domain';
import { ThemeToggle } from '../../Layout';
import { useSession } from '../../context';
import { Badge, Button, Card, Checkbox, DL, Notice, PageHeader, TextInput } from '../../ui';
import { PROFILE_LABELS } from './Users';

export default function Account() {
  const s = useSession();
  const passwordUrl = s.auth.passwordUrl();

  return (
    <>
      <PageHeader title="Mi cuenta" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Datos">
          <DL
            cols={1}
            items={[
              ['Nombre', s.me.name ?? '—'],
              ['Email', s.me.email ?? '—'],
              [
                'Perfiles',
                <span className="flex flex-wrap justify-end gap-1">
                  {s.me.profiles.length ? s.me.profiles.map((p) => <Badge key={p}>{PROFILE_LABELS[p] ?? p}</Badge>) : 'Ninguno'}
                </span>,
              ],
              ['Ficha de personal', s.me.staffId ? s.name('staff', s.me.staffId) : '—'],
            ]}
          />
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer text-stone-600 dark:text-stone-400">Qué puedo hacer ({s.me.permissions?.length ?? 0} permisos)</summary>
            <ul className="mt-2 flex flex-wrap gap-1">
              {(s.me.permissions ?? []).map((p) => (
                <li key={p}>
                  <code className="rounded bg-stone-100 px-1.5 py-0.5 text-xs dark:bg-stone-800">{p}</code>
                </li>
              ))}
            </ul>
          </details>
        </Card>

        <Card title="Seguridad">
          <div className="space-y-4 text-sm">
            <div>
              <h3 className="font-semibold">Contraseña</h3>
              <p className="mt-1 text-stone-600 dark:text-stone-400">
                La contraseña se cambia en la página de acceso segura (Cognito): te enviará un código por correo para poner una nueva. Mínimo 12 caracteres.
              </p>
              {passwordUrl ? (
                <a href={passwordUrl} className="mt-2 inline-flex rounded-lg bg-accent-600 px-3.5 py-2 font-medium text-white hover:bg-accent-700">
                  Cambiar contraseña
                </a>
              ) : (
                <p className="mt-2 text-stone-500">No disponible en modo desarrollo.</p>
              )}
            </div>
            <div>
              <h3 className="font-semibold">Verificación en dos pasos (MFA)</h3>
              <p className="mt-1 text-stone-600 dark:text-stone-400">
                Con una app de códigos (Google Authenticator, Authy…). Se configura en la página de acceso de Cognito cuando la administración la active; muy recomendable para perfiles de
                administración.
              </p>
            </div>
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold">Tema</h3>
              <ThemeToggle />
            </div>
            <Button onClick={() => void s.auth.logout()}>Cerrar sesión</Button>
          </div>
        </Card>

        {s.auth.dev && <DevUser />}
      </div>
    </>
  );
}

function DevUser() {
  const s = useSession();
  const [user, setUser] = useState(s.me.id);
  const [groups, setGroups] = useState<Profile[]>(s.me.profiles);
  return (
    <Card title="Modo desarrollo: usuario simulado" className="lg:col-span-2">
      <div className="space-y-3">
        <Notice tone="warn">Solo en local. La API de desarrollo lee las cabeceras x-dev-user y x-dev-groups.</Notice>
        <div className="flex flex-wrap items-end gap-4">
          <TextInput label="Usuario" value={user} onChange={(e) => setUser(e.target.value)} className="w-56" />
          <fieldset className="flex flex-wrap gap-3 pb-2">
            {PROFILES.map((p) => (
              <Checkbox key={p} label={p} checked={groups.includes(p)} onChange={(e) => setGroups((g) => (e.target.checked ? [...g, p] : g.filter((x) => x !== p)))} />
            ))}
          </fieldset>
          <Button
            variant="primary"
            onClick={() => {
              s.auth.setDevUser?.(user.trim() || 'dev', groups);
              window.location.assign('/app/');
            }}
          >
            Aplicar y recargar
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {PROFILES.map((p) => (
            <Button
              key={p}
              size="sm"
              variant="ghost"
              onClick={() => {
                s.auth.setDevUser?.(`dev-${p}`, [p]);
                window.location.assign('/app/');
              }}
            >
              Entrar como {p}
            </Button>
          ))}
        </div>
      </div>
    </Card>
  );
}
