/** Orders two `major.minor.patch` versions: negative when `a` is lower. */
export function compareVersions(a: string, b: string): number {
  const [left, right] = [parseVersion(a), parseVersion(b)];
  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
}

/** The major part of a `major.minor.patch` version. */
export function majorVersion(version: string): number {
  return parseVersion(version)[0];
}

function parseVersion(version: string): [number, number, number] {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (match === null) throw new Error(`"${version}" in fieldwork.json is not a major.minor.patch version`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}
