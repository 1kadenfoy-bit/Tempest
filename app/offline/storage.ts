// Files on the device: the browser's private file system (OPFS), in one
// folder. Saved areas live here; nothing else does.

const DIR = 'tempest';

async function dir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(DIR, { create: true });
}

export async function writeFile(name: string, data: Uint8Array | ArrayBuffer | string): Promise<number> {
  const fh = await (await dir()).getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(data as FileSystemWriteChunkType);
  await w.close();
  return (await fh.getFile()).size;
}

export async function readFile(name: string): Promise<File | null> {
  try {
    const fh = await (await dir()).getFileHandle(name);
    return await fh.getFile();
  } catch {
    return null;
  }
}

export async function removeFile(name: string): Promise<void> {
  try { await (await dir()).removeEntry(name); } catch { /* already gone */ }
}

/** Every file in the folder, by name. */
export async function listFiles(): Promise<string[]> {
  const out: string[] = [];
  try {
    for await (const name of (await dir() as unknown as { keys(): AsyncIterable<string> }).keys()) out.push(name);
  } catch { /* no folder, or no file system */ }
  return out;
}

export async function readJson<T>(name: string): Promise<T | null> {
  const f = await readFile(name);
  if (!f) return null;
  try { return JSON.parse(await f.text()) as T; } catch { return null; }
}

/** Ask iOS to keep saved data when space runs low (granted to home-screen apps). */
export async function requestPersistence(): Promise<boolean> {
  try { return (await navigator.storage.persist?.()) ?? false; } catch { return false; }
}

/** Whether the browser has agreed to keep this app's data (null when it cannot say), and how much it uses. */
export async function storageState(): Promise<{ kept: boolean | null; usedBytes: number | null }> {
  let kept: boolean | null = null;
  let usedBytes: number | null = null;
  try { if (navigator.storage?.persisted) kept = await navigator.storage.persisted(); } catch { /* unknown */ }
  try { usedBytes = (await navigator.storage?.estimate?.())?.usage ?? null; } catch { /* unknown */ }
  return { kept, usedBytes };
}
