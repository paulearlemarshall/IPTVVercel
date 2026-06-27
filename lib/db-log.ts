export type DbLogStatus = "success" | "failure";
export type DbLogOperation = "retrieve" | "insert" | "update";

export type DbLogEntry = {
  id: number;
  at: string;
  operation: DbLogOperation;
  status: DbLogStatus;
  table: string;
  action: string;
  profileId?: string;
  section?: string;
  categoryId?: string;
  streamId?: string;
  count?: number;
  message?: string;
};

const MAX_ENTRIES = 200;
const entries: DbLogEntry[] = [];
let nextId = 1;

export function addDbLog(entry: Omit<DbLogEntry, "id" | "at">) {
  entries.unshift({
    ...entry,
    id: nextId,
    at: new Date().toISOString(),
  });
  nextId += 1;

  if (entries.length > MAX_ENTRIES) {
    entries.length = MAX_ENTRIES;
  }
}

export function getDbLog() {
  return {
    entries,
    total: entries.length,
  };
}

export function clearDbLog() {
  entries.length = 0;
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}
