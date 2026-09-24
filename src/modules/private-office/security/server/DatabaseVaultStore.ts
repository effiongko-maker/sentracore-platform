import type { EncryptedItem } from "../shared/protocol";
import { emptyStore, type StoreData, type TransactOptions, type VaultRecord, type VaultStore } from "./VaultStore";

/**
 * Supabase/Postgres persistence for one owner, through the two SECURITY DEFINER functions of the vault
 * foundation migration. The database re-verifies the live session, owner and grants on every call.
 *
 * Optimistic per-owner transaction: load → apply → commit(expected revision). A concurrent change makes the
 * commit fail with 40001 and the whole operation is re-run against fresh state (bounded). Operations are pure
 * over the loaded state, so a re-run can never replay a consumed challenge or establish a second identity.
 */

export type VaultStoreActor = { organisationId: string; profileId: string; sessionId: string };
export type RpcResult = { data: unknown; error: { code?: string; message?: string } | null };
export type Rpc = (fn: "private_office_load" | "private_office_commit", params: Record<string, unknown>) => Promise<RpcResult>;

type Loaded = {
  revision: number;
  state: { challenges?: StoreData["challenges"]; pendingCredentials?: StoreData["pendingCredentials"]; leases?: StoreData["leases"] };
  activation: { publicKey: string; consumed: boolean } | null;
  vault: (Omit<VaultRecord, "organisationId" | "ownerProfileId"> & { establishedAt: string }) | null;
  recordCount: number;
  records: EncryptedItem[] | null;
};

const MAX_ATTEMPTS = 3;

export class StorageUnavailableError extends Error {}
export class ConcurrentChangeError extends Error {}

export class DatabaseVaultStore implements VaultStore {
  constructor(private readonly actor: VaultStoreActor, private readonly rpc: Rpc) {}

  async transact<T>(fn: (data: StoreData) => T | Promise<T>, options: TransactOptions = {}): Promise<T> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.attempt(fn, options);
      } catch (error) {
        if (!(error instanceof ConcurrentChangeError) || attempt >= MAX_ATTEMPTS) throw error;
      }
    }
  }

  private async attempt<T>(fn: (data: StoreData) => T | Promise<T>, options: TransactOptions): Promise<T> {
    const key = `${this.actor.organisationId}:${this.actor.profileId}`;
    const params = { p_owner: this.actor.profileId, p_org: this.actor.organisationId, p_session: this.actor.sessionId };
    const loaded = await this.rpc("private_office_load", { ...params, p_with_records: options.records === true });
    if (loaded.error || !loaded.data) throw new StorageUnavailableError("Private Office storage is unavailable.");
    const snapshot = loaded.data as Loaded;

    const data = emptyStore();
    data.challenges = snapshot.state.challenges ?? {};
    data.pendingCredentials = snapshot.state.pendingCredentials ?? {};
    data.leases = snapshot.state.leases ?? {};
    if (snapshot.activation) data.activations[key] = { ...snapshot.activation };
    if (snapshot.vault) {
      const identity: Record<string, unknown> = { ...snapshot.vault };
      delete identity.establishedAt;
      data.vaults[key] = { ...(identity as Omit<VaultRecord, "organisationId" | "ownerProfileId">), organisationId: this.actor.organisationId, ownerProfileId: this.actor.profileId };
    }
    data.recordCounts[key] = snapshot.recordCount;
    const loadedRecords = snapshot.records ?? null;
    if (loadedRecords) data.records[key] = structuredClone(loadedRecords);
    const vaultBefore = JSON.stringify(data.vaults[key] ?? null);

    const value = await fn(data);

    // Only this owner's state may leave this transaction.
    const foreign = (map: Record<string, { organisationId: string; profileId: string }>) =>
      Object.values(map).some((r) => r.organisationId !== this.actor.organisationId || r.profileId !== this.actor.profileId);
    if (Object.keys(data.vaults).some((k) => k !== key) || foreign(data.challenges) || foreign(data.pendingCredentials) || foreign(data.leases)) {
      throw new Error("Private Office state crossed an owner boundary.");
    }

    const after = data.vaults[key] ?? null;
    const records = data.records[key] ?? [];
    if (loadedRecords === null && records.length > 0) throw new Error("Records were not loaded for this operation.");
    const base = loadedRecords ?? [];
    if (JSON.stringify(records.slice(0, base.length)) !== JSON.stringify(base)) throw new Error("Private Office history is immutable.");
    const appended = records.slice(base.length);

    const establish = !snapshot.vault && after !== null;
    if (establish && data.activations[key]?.consumed !== true) throw new Error("Independent owner activation required.");
    const vaultChanged = JSON.stringify(after) !== vaultBefore;
    let pVault: Record<string, unknown> | null = null;
    if (after && vaultChanged) {
      // Owner and organisation are columns taken from the session-bound actor, never from the payload.
      pVault = { ...after };
      delete pVault.organisationId;
      delete pVault.ownerProfileId;
    }

    const saved = await this.rpc("private_office_commit", {
      ...params,
      p_revision: snapshot.revision,
      p_vault: pVault,
      p_state: { challenges: data.challenges, pendingCredentials: data.pendingCredentials, leases: data.leases },
      p_records: appended,
      p_establish: establish,
    });
    if (saved.error) {
      if (saved.error.code === "40001") throw new ConcurrentChangeError("Private Office changed concurrently.");
      throw new StorageUnavailableError("Private Office could not be saved.");
    }
    return value;
  }
}
