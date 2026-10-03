/**
 * Encrypted object storage for policy files. Never returns public URLs.
 * Production: S3 with SSE-KMS (or GCS CMEK). Development: AES-256-GCM files on disk.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface ObjectStore {
  put(key: string, data: Buffer): Promise<string>; // returns file_ref
  get(fileRef: string): Promise<Buffer>;
  remove(fileRef: string): Promise<void>;
}

export const localEncryptedStore = (dir: string, secret: string): ObjectStore => {
  const key = createHash('sha256').update(secret).digest(); // 32 bytes
  const path = (ref: string) => join(dir, ref.replace(/^local:\/\//, '').replace(/[^a-zA-Z0-9_.-]/g, '_'));
  return {
    async put(k, data) {
      await mkdir(dir, { recursive: true });
      const iv = randomBytes(12);
      const c = createCipheriv('aes-256-gcm', key, iv);
      const enc = Buffer.concat([c.update(data), c.final()]);
      const ref = `local://${k}`;
      await writeFile(path(ref), Buffer.concat([iv, c.getAuthTag(), enc]));
      return ref;
    },
    async get(ref) {
      const raw = await readFile(path(ref));
      const d = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
      d.setAuthTag(raw.subarray(12, 28));
      return Buffer.concat([d.update(raw.subarray(28)), d.final()]);
    },
    async remove(ref) { await rm(path(ref), { force: true }); },
  };
};
