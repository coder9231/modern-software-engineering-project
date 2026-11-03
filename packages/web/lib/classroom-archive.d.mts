export const CLASSROOM_LIMITS: Readonly<{
  archives: number;
  compressedBytes: number;
  expandedBytes: number;
  files: number;
  depth: number;
}>;
export function archivePath(name: string): string;
export function unpackClassroomZip(
  bytes: Uint8Array,
  options?: { signal?: AbortSignal },
): Promise<{ path: string; bytes: Uint8Array }[]>;
