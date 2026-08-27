/// <reference types="vite/client" />

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

export {};
