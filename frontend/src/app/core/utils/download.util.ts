import { ArchiveDownload } from '../api/archive-api';

/**
 * Hands a blob to the browser as a file download.
 *
 * There is no API for "save this"; the only route is a synthetic anchor with a
 * `download` attribute pointing at an object URL. That URL pins the blob in
 * memory until it is revoked, which matters here — an archive can be hundreds of
 * megabytes — so it is released as soon as the click has been dispatched.
 *
 * Shared rather than inlined at each call site: the vault and the per-collection
 * download differ only in which URL they fetch, and two copies of this would
 * eventually differ in whether they leaked.
 */
export function saveFile({ blob, filename }: ArchiveDownload): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
