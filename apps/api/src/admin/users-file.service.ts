import { Injectable, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { UserRole } from '../auth/auth.types';
import { hashPassword } from '../auth/password-hasher';

export interface UserFileEntry {
  id: string;
  type: UserRole;
  username: string;
  passwordHash: string;
  createdAt: string;
  tutorialCompleted: boolean;
}

interface UsersDocument {
  users: UserFileEntry[];
}

@Injectable()
export class UsersFileService implements OnModuleInit {
  private readonly filePath =
    process.env.USERS_FILE ?? resolve(__dirname, '../../../../config/users.json');
  private writeQueue: Promise<void> = Promise.resolve();

  async onModuleInit(): Promise<void> {
    await this.getUsers();
  }

  async getUsers(): Promise<UserFileEntry[]> {
    const raw = await this.readDocument();
    let changed = false;
    const users: UserFileEntry[] = [];

    for (const entry of raw.users) {
      if (!isUserRole(entry.type) || typeof entry.username !== 'string') {
        throw new Error('config/users.json must contain valid user entries.');
      }
      const username = entry.username.trim().toLowerCase();
      if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)) {
        throw new Error(`Invalid username in config/users.json: "${entry.username}".`);
      }
      let passwordHash: string;
      if (typeof entry.passwordHash !== 'string') {
        if (
          typeof entry.password !== 'string' ||
          entry.password.length < 12 ||
          entry.password.length > 128 ||
          entry.password.trim() !== entry.password
        ) {
          throw new Error(`Account "${username}" must have a password hash.`);
        }
        passwordHash = await hashPassword(entry.password);
        changed = true;
      } else {
        passwordHash = entry.passwordHash;
        if (!isPasswordHash(passwordHash)) {
          throw new Error(`Account "${username}" has an invalid password hash.`);
        }
      }
      const id = typeof entry.id === 'string' && isUuid(entry.id) ? entry.id : randomUUID();
      if (id !== entry.id) {
        changed = true;
      }
      const createdAt =
        typeof entry.createdAt === 'string' ? entry.createdAt : new Date().toISOString();
      if (createdAt !== entry.createdAt) {
        changed = true;
      }
      const tutorialCompleted =
        typeof entry.tutorialCompleted === 'boolean' ? entry.tutorialCompleted : false;
      if (tutorialCompleted !== entry.tutorialCompleted) {
        changed = true;
      }
      if ('password' in entry) changed = true;
      users.push({
        id,
        type: entry.type,
        username,
        passwordHash,
        createdAt,
        tutorialCompleted,
      });
    }

    const usernames = new Set<string>();
    const ids = new Set<string>();
    for (const user of users) {
      if (usernames.has(user.username) || ids.has(user.id)) {
        throw new Error('config/users.json contains duplicate usernames or account IDs.');
      }
      usernames.add(user.username);
      ids.add(user.id);
    }
    if (changed) await this.writeDocument({ users });
    return users;
  }

  async findByUsername(username: string): Promise<UserFileEntry | undefined> {
    return (await this.getUsers()).find((user) => user.username === username.toLowerCase());
  }

  async upsert(input: {
    id?: string;
    previousUsername?: string;
    username: string;
    role: UserRole;
    password?: string;
    passwordHash?: string;
  }): Promise<UserFileEntry> {
    const users = await this.getUsers();
    const existingIndex =
      input.previousUsername === undefined
        ? -1
        : users.findIndex((user) => user.username === input.previousUsername?.toLowerCase());
    const existing = users[existingIndex];
    if (input.previousUsername !== undefined && !existing) {
      throw new Error(`Account "${input.previousUsername}" was not found in config/users.json.`);
    }
    const normalizedUsername = input.username.toLowerCase();
    if (
      users.some(
        (user, index) => index !== existingIndex && user.username === normalizedUsername,
      )
    ) {
      throw new Error(`Username "${input.username}" already exists in config/users.json.`);
    }

    const passwordHash =
      input.password !== undefined
        ? await hashPassword(input.password)
        : input.passwordHash ?? existing?.passwordHash;
    if (!passwordHash || !isPasswordHash(passwordHash)) {
      throw new Error('A valid password hash is required to store this account.');
    }
    const user: UserFileEntry = {
      id: existing?.id ?? input.id ?? randomUUID(),
      type: input.role,
      username: normalizedUsername,
      passwordHash,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      tutorialCompleted: existing?.tutorialCompleted ?? false,
    };
    if (existingIndex < 0) users.push(user);
    else users[existingIndex] = user;
    await this.writeDocument({ users });
    return user;
  }

  async remove(id: string): Promise<UserFileEntry> {
    const users = await this.getUsers();
    const index = users.findIndex((user) => user.id === id);
    if (index < 0) throw new Error(`Account "${id}" was not found in config/users.json.`);
    const [removed] = users.splice(index, 1);
    await this.writeDocument({ users });
    return removed;
  }

  async restore(user: UserFileEntry): Promise<void> {
    const users = await this.getUsers();
    if (users.some((entry) => entry.id === user.id || entry.username === user.username)) {
      throw new Error(`Cannot restore account "${user.username}"; it already exists.`);
    }
    users.push(user);
    await this.writeDocument({ users });
  }

  async reassignId(previousId: string, id: string): Promise<UserFileEntry> {
    const users = await this.getUsers();
    const user = users.find((entry) => entry.id === previousId);
    if (!user) throw new Error(`Account "${previousId}" was not found in config/users.json.`);
    if (users.some((entry) => entry.id === id)) {
      throw new Error(`Account ID "${id}" already exists in config/users.json.`);
    }
    user.id = id;
    await this.writeDocument({ users });
    return user;
  }

  async completeTutorial(id: string): Promise<UserFileEntry> {
    const users = await this.getUsers();
    const user = users.find((entry) => entry.id === id);
    if (!user) throw new Error(`Account "${id}" was not found in config/users.json.`);
    if (!user.tutorialCompleted) {
      user.tutorialCompleted = true;
      await this.writeDocument({ users });
    }
    return user;
  }

  private async readDocument(): Promise<{ users: Array<Record<string, unknown>> }> {
    const contents = await readFile(this.filePath, 'utf8');
    let value: unknown;
    try {
      value = JSON.parse(contents);
    } catch (error: unknown) {
      throw new Error('config/users.json is not valid JSON.', { cause: error });
    }
    if (
      typeof value !== 'object' ||
      value === null ||
      !('users' in value) ||
      !Array.isArray(value.users)
    ) {
      throw new Error('config/users.json must contain valid user entries.');
    }
    return { users: value.users as Array<Record<string, unknown>> };
  }

  private async writeDocument(document: UsersDocument): Promise<void> {
    const write = this.writeQueue.then(async () => {
      const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`;
      await writeFile(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, {
        encoding: 'utf8',
        mode: 0o600,
      });
      try {
        await rename(temporaryPath, this.filePath);
      } catch (error: unknown) {
        try {
          await unlink(temporaryPath);
        } catch {
          // Keep the rename failure as the actionable error.
        }
        throw error;
      }
    });
    this.writeQueue = write.catch(() => undefined);
    await write;
  }
}

function isUserRole(value: unknown): value is UserRole {
  return value === 'student' || value === 'teacher' || value === 'admin';
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function isPasswordHash(value: string): boolean {
  return /^[a-f0-9]{32}:[a-f0-9]{128}$/i.test(value);
}
