// Joins a folder the user picked with a child name, using the separator the picked path already
// uses: a Windows folder dialog returns backslashes, macOS and Linux return slashes.
export function joinPath(parent: string, name: string): string {
  const separator = parent.includes('\\') ? '\\' : '/';
  return `${parent.replace(/[\\/]+$/, '')}${separator}${name}`;
}
