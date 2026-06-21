import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { app, BrowserWindow, ipcMain, Menu } from "electron";
import { connectOrStartApi, stopApiService } from "./api-service.js";
import { openPath, selectMaterialDirectory, selectOutputDirectory, selectTemplateFile } from "./file-dialog.js";

let mainWindow: BrowserWindow | undefined;

async function createWindow(): Promise<void> {
  const apiState = await connectOrStartApi();
  Menu.setApplicationMenu(null);
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 980,
    minHeight: 720,
    title: "DeckForge 稿炉",
    autoHideMenuBar: true,
    backgroundColor: "#eef2f4",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadPath()
    }
  });

  mainWindow.webContents.on("did-finish-load", () => {
    mainWindow?.webContents.send("deckforge:api-state", apiState);
  });

  const webUrl = process.env.DECKFORGE_WEB_URL ?? "http://127.0.0.1:5173";
  if (app.isPackaged) {
    const file = path.join(process.resourcesPath, "web", "index.html");
    await mainWindow.loadURL(pathToFileURL(file).toString());
  } else {
    await mainWindow.loadURL(webUrl);
  }
}

ipcMain.handle("deckforge:select-material-directory", selectMaterialDirectory);
ipcMain.handle("deckforge:select-template-file", selectTemplateFile);
ipcMain.handle("deckforge:select-output-directory", selectOutputDirectory);
ipcMain.handle("deckforge:open-path", async (_event, targetPath: string) => openPath(targetPath));

app.whenReady().then(createWindow);
app.on("window-all-closed", () => {
  stopApiService();
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (!mainWindow) void createWindow();
});

function preloadPath(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(currentDir, "../preload/index.cjs");
}
