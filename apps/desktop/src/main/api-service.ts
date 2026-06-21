import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { app } from "electron";

export interface ApiServiceState {
  url: string;
  startedByDesktop: boolean;
  pid?: number;
}

let child: ChildProcess | undefined;

export async function connectOrStartApi(): Promise<ApiServiceState> {
  const url = process.env.DECKFORGE_API_URL ?? "http://127.0.0.1:3217";
  if (await canReach(url)) return { url, startedByDesktop: false };

  const apiEntry = app.isPackaged
    ? path.join(process.resourcesPath, "api", "server.js")
    : path.resolve(process.cwd(), "apps/api/dist/server.js");
  child = spawn(process.execPath, [apiEntry], {
    env: { ...process.env, DECKFORGE_API_PORT: "3217" },
    stdio: "ignore",
    windowsHide: true
  });
  child.unref();
  return { url, startedByDesktop: true, pid: child.pid };
}

export function stopApiService(): void {
  child?.kill();
  child = undefined;
}

async function canReach(url: string): Promise<boolean> {
  try {
    const response = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(750) });
    return response.ok;
  } catch {
    return false;
  }
}
