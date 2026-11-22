/**
 * Removes the "_field": "field" markers the gRPC loader (oneofs: true) adds for every
 * proto3 optional field that is set; they carry no data.
 */
export function withoutOneofMarkers<T>(value: T): T {
  if (Array.isArray(value)) return value.map(withoutOneofMarkers) as T;
  if (value && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(
          ([key, field]) => !(key.startsWith('_') && field === key.slice(1)),
        )
        .map(([key, field]) => [key, withoutOneofMarkers(field)]),
    ) as T;
  }
  return value;
}
