import { useState, useEffect } from "react";

export function useSessionState<T>(key: string, initialValue: T) {
  const [value, setValue] = useState(() => {
    const stored = sessionStorage.getItem(key);
    return stored !== null ? JSON.parse(stored) : initialValue;
  });

  useEffect(() => {
    sessionStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue];
}
