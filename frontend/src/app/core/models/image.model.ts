/**
 * Where the subject of an image sits, as fractions of its width and height
 * (0–1, origin top-left).
 *
 * One point serves every surface: each one crops to its own aspect ratio around
 * it, so a single adjustment fixes the card, the gallery and the banner at once
 * — and a surface that doesn't exist yet is already framed.
 */
export interface FocalPoint {
  x: number;
  y: number;
}

/**
 * An image's metadata, keyed by the same id used to build its URL.
 *
 * `focal` is null when the image was never framed, which renders centred. Keep
 * the null: it distinguishes "never chosen" from "deliberately centred".
 */
export interface ImageMeta {
  id: string;
  contentType: string;
  focal: FocalPoint | null;
  /**
   * Intrinsic pixel size, or null for an image uploaded before the server
   * recorded it. Used to reserve the right shape before the bytes arrive —
   * without it a gallery lays out at a guessed ratio and jumps as each photo
   * loads. Both or neither, like the focal pair.
   */
  width: number | null;
  height: number | null;
}

/**
 * Which rendition of an image to fetch.
 *
 * The server resizes on upload and caches the result, so asking for the size a
 * surface actually renders at is the difference between downloading a 4 MB
 * phone photo into a 215×116 card and downloading 20 kB.
 *
 * - `thumb` — cards, grid tiles, gallery thumbnails, mosaic tiles
 * - `display` — gallery main image, banners, the framing editor's stage
 * - `full` — the original bytes; only the lightbox's "open original" wants them
 */
export type ImageVariant = 'thumb' | 'display' | 'full';

/**
 * What an image is being used for, which decides the shapes it gets cropped to.
 *
 * An item photo never appears in a collection banner, and a banner never
 * appears in an item card — so the framing editor previews only the surfaces
 * that will actually show this picture. Showing the others would imply a
 * trade-off the user does not have to make.
 */
export type ImageUsage = 'item' | 'banner' | 'icon';
