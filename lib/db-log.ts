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

  void persistDbLog(entry);
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

async function persistDbLog(entry: Omit<DbLogEntry, "id" | "at">) {
  try {
    const [{ db }, { dbActivityLogs }] = await Promise.all([
      import("@/lib/db"),
      import("@/lib/schema"),
    ]);
    await db.insert(dbActivityLogs).values({
      operation: entry.operation,
      status: entry.status,
      table: entry.table,
      action: entry.action,
      profileId: entry.profileId,
      section: entry.section,
      categoryId: entry.categoryId,
      streamId: entry.streamId,
      count: entry.count,
      message: entry.message,
    });
  } catch {
    /* keep logging non-blocking */
  }
}
