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
}
