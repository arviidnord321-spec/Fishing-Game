/**
 * Painted pet portraits cut from the owner-supplied pet sheet (see scripts/pet-portraits.py).
 * Inlined as data URLs so the single-file build stays self-contained.
 */
const files = import.meta.glob('../assets/pets/*.webp', { eager: true, query: '?inline', import: 'default' }) as Record<string, string>;

const portraits = new Map<string, string>();
for (const [path, url] of Object.entries(files)) portraits.set(path.slice(path.lastIndexOf('/') + 1, -'.webp'.length), url);

/** Portrait (or dark silhouette for undiscovered pets); undefined if the pet has none. */
export function petPortrait(id: string, silhouette: boolean): string | undefined {
  return portraits.get(silhouette ? `${id}-sil` : id);
}
