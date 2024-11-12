export function stringToEnum<T>(enumObj: T, value: string): T[keyof T] | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (enumObj as any)[value as keyof T];
}
