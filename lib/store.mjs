import { put, get, list, del } from "@vercel/blob";
import { mkdir, readFile, writeFile, rename, readdir } from "node:fs/promises";
const ETAG = Symbol("etag");
const cloud = () =>
  !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
const dir = () => process.env.DATA_DIR || ".local-data";
export async function load(id) {
  if (!/^[a-f0-9]{24}$/.test(id)) return null;
  if (cloud()) {
    let r = await get(`circles/${id}.json`, {
      access: "private",
      useCache: false,
    });
    if (!r || r.statusCode !== 200) return null;
    let c = JSON.parse(await new Response(r.stream).text());
    Object.defineProperty(c, ETAG, {
      value: r.blob.etag.replace(/^W\//, ""),
      writable: true,
    });
    return c;
  }
  try {
    return JSON.parse(await readFile(`${dir()}/${id}.json`, "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") return null;
    throw e;
  }
}
export async function save(c) {
  c.version = (c.version || 0) + 1;
  if (cloud()) {
    let saved = await put(`circles/${c.id}.json`, JSON.stringify(c), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
      cacheControlMaxAge: 0,
      ...(c[ETAG] ? { ifMatch: c[ETAG] } : {}),
    });
    c[ETAG] = saved.etag;
  } else {
    await mkdir(dir(), { recursive: true });
    let path = `${dir()}/${c.id}.json`;
    await writeFile(`${path}.tmp`, JSON.stringify(c), { mode: 0o600 });
    await rename(`${path}.tmp`, path);
  }
  return c;
}
export async function ids() {
  if (cloud()) {
    let r = await list({ prefix: "circles/", limit: 100 });
    return r.blobs.map((b) => b.pathname.split("/")[1].replace(".json", ""));
  }
  try {
    return (await readdir(dir()))
      .filter((x) => x.endsWith(".json"))
      .map((x) => x.replace(".json", ""));
  } catch {
    return [];
  }
}
export async function erase(id) {
  if (cloud()) await del(`circles/${id}.json`);
  else {
    let { unlink } = await import("node:fs/promises");
    await unlink(`${dir()}/${id}.json`);
  }
}
