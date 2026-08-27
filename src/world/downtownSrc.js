/** Clean Downtown MegaKit Source glTF folder (not the Godot collision export). */
export const DOWNTOWN_SRC = '/models/downtown/Exports/glTF';

export function downtown(file) {
  return `${DOWNTOWN_SRC}/${file}`;
}
