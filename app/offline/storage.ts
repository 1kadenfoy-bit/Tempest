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

export async function readJson<T>(name: string): Promise<T | null> {
  const f = await readFile(name);
  if (!f) return null;
  try { return JSON.parse(await f.text()) as T; } catch { return null; }
}

/** Ask iOS to keep saved data when space runs low (granted to home-screen apps). */
export async function requestPersistence(): Promise<boolean> {
  try { return (await navigator.storage.persist?.()) ?? false; } catch { return false; }
}
