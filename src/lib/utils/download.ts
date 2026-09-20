/**
 * Hands a fetched Blob to the browser as a file. An anchor with `download` is the one mechanism
 * that works for a body fetched with a bearer token; the object URL is revoked after the click so a
 * long session does not accumulate CSVs in memory.
 */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Deferred: revoking synchronously races the click in some browsers and yields an empty file.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
