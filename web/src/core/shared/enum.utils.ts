export function stringToEnum<T>(enumObj: T, value: string): T[keyof T] | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (enumObj as any)[value as keyof T];
}

/**
 * Check if a string is part of an enum
 * 
 * @param enumObj 
 * @param value 
 * @returns boolean
 */
export function isEnumValue<T extends Record<string, string | number>>(
  enumObj: T,
  value: unknown
): value is T[keyof T] {
  return Object.values(enumObj).includes(value as T[keyof T]);
}
