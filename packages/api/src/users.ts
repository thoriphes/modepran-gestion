/**
 * Usuarios (cuentas con login) en Cognito, detrás de una interfaz para simularlo en tests.
 * Perfil = grupo de Cognito (admin, carlet, modevet, bienestar). El id es el `sub` (= `Username` del pool,
 * que usa el email como alias de inicio de sesión). Cognito envía la invitación con la contraseña temporal.
 */
import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminListGroupsForUserCommand,
  AdminRemoveUserFromGroupCommand,
  AdminUpdateUserAttributesCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
  type UserType,
} from '@aws-sdk/client-cognito-identity-provider';
import { PROFILES, profilesFromGroups, type Profile, type User } from '@modepran/domain';

export interface NewUserInput {
  email: string;
  name: string;
  profiles: Profile[];
}

export interface UserPatch {
  name?: string;
  profiles?: Profile[];
  active?: boolean;
}

export interface UserDirectory {
  list(): Promise<User[]>;
  get(id: string): Promise<User | undefined>;
  create(input: NewUserInput): Promise<User>;
  update(id: string, patch: UserPatch): Promise<User>;
}

export class UserExistsError extends Error {}

export function createCognitoUserDirectory(opts: { userPoolId: string; client?: CognitoIdentityProviderClient; region?: string }): UserDirectory {
  const cip = opts.client ?? new CognitoIdentityProviderClient(opts.region ? { region: opts.region } : {});
  const UserPoolId = opts.userPoolId;

  const attr = (u: UserType, name: string) => u.Attributes?.find((a) => a.Name === name)?.Value;

  async function groupsOf(username: string): Promise<Profile[]> {
    const res = await cip.send(new AdminListGroupsForUserCommand({ UserPoolId, Username: username }));
    return profilesFromGroups((res.Groups ?? []).map((g) => g.GroupName ?? ''));
  }

  async function toUser(u: UserType): Promise<User> {
    const id = attr(u, 'sub') ?? u.Username!;
    return {
      id,
      email: attr(u, 'email') ?? '',
      name: attr(u, 'name') ?? attr(u, 'email') ?? '',
      profiles: await groupsOf(u.Username!),
      active: u.Enabled !== false,
      createdAt: (u.UserCreateDate ?? new Date()).toISOString(),
    };
  }

  async function findRaw(id: string): Promise<UserType | undefined> {
    const res = await cip.send(new ListUsersCommand({ UserPoolId, Filter: `sub = "${id.replace(/"/g, '')}"`, Limit: 1 }));
    return res.Users?.[0];
  }

  async function setProfiles(username: string, profiles: Profile[]) {
    const current = await groupsOf(username);
    for (const p of PROFILES) {
      if (profiles.includes(p) && !current.includes(p))
        await cip.send(new AdminAddUserToGroupCommand({ UserPoolId, Username: username, GroupName: p }));
      if (!profiles.includes(p) && current.includes(p))
        await cip.send(new AdminRemoveUserFromGroupCommand({ UserPoolId, Username: username, GroupName: p }));
    }
  }

  const dir: UserDirectory = {
    async list() {
      const out: UserType[] = [];
      let PaginationToken: string | undefined;
      do {
        const res = await cip.send(new ListUsersCommand({ UserPoolId, ...(PaginationToken ? { PaginationToken } : {}) }));
        out.push(...(res.Users ?? []));
        PaginationToken = res.PaginationToken;
      } while (PaginationToken);
      return Promise.all(out.map(toUser));
    },
    async get(id) {
      const raw = await findRaw(id);
      return raw ? toUser(raw) : undefined;
    },
    async create(input) {
      let created: UserType | undefined;
      try {
        const res = await cip.send(
          new AdminCreateUserCommand({
            UserPoolId,
            Username: input.email,
            UserAttributes: [
              { Name: 'email', Value: input.email },
              { Name: 'email_verified', Value: 'true' },
              { Name: 'name', Value: input.name },
            ],
            DesiredDeliveryMediums: ['EMAIL'],
          }),
        );
        created = res.User;
      } catch (e) {
        if ((e as { name?: string }).name === 'UsernameExistsException') throw new UserExistsError('Ya existe un usuario con ese email.');
        throw e;
      }
      await setProfiles(created!.Username!, input.profiles);
      return toUser(created!);
    },
    async update(id, patch) {
      const raw = await findRaw(id);
      if (!raw) throw new Error('not_found');
      const username = raw.Username!;
      if (patch.name !== undefined)
        await cip.send(new AdminUpdateUserAttributesCommand({ UserPoolId, Username: username, UserAttributes: [{ Name: 'name', Value: patch.name }] }));
      if (patch.profiles) await setProfiles(username, patch.profiles);
      if (patch.active === false) await cip.send(new AdminDisableUserCommand({ UserPoolId, Username: username }));
      if (patch.active === true) await cip.send(new AdminEnableUserCommand({ UserPoolId, Username: username }));
      const fresh = await findRaw(id);
      return toUser(fresh!);
    },
  };
  return dir;
}

export function createMemoryUserDirectory(initial: User[] = []): UserDirectory & { users: Map<string, User> } {
  const users = new Map(initial.map((u) => [u.id, structuredClone(u)]));
  let n = 0;
  return {
    users,
    async list() {
      return [...users.values()].map((u) => structuredClone(u));
    },
    async get(id) {
      const u = users.get(id);
      return u && structuredClone(u);
    },
    async create(input) {
      if ([...users.values()].some((u) => u.email === input.email)) throw new UserExistsError('Ya existe un usuario con ese email.');
      const u: User = { id: `user-${++n}`, email: input.email, name: input.name, profiles: input.profiles, active: true, createdAt: new Date().toISOString() };
      users.set(u.id, u);
      return structuredClone(u);
    },
    async update(id, patch) {
      const u = users.get(id);
      if (!u) throw new Error('not_found');
      if (patch.name !== undefined) u.name = patch.name;
      if (patch.profiles) u.profiles = patch.profiles;
      if (patch.active !== undefined) u.active = patch.active;
      return structuredClone(u);
    },
  };
}
