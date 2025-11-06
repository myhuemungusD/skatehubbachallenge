import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const lettersForCount = (count: number) => {
  const letters = ["S", "K", "8"];
  return letters.slice(0, count).join(".");
};
