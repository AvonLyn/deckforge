import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("deckforgeDesktop", {
  selectMaterialDirectory: () => ipcRenderer.invoke("deckforge:select-material-directory"),
  selectTemplateFile: () => ipcRenderer.invoke("deckforge:select-template-file"),
  selectOutputDirectory: () => ipcRenderer.invoke("deckforge:select-output-directory"),
  openPath: (targetPath: string) => ipcRenderer.invoke("deckforge:open-path", targetPath),
  onApiState: (callback: (state: unknown) => void) => {
    ipcRenderer.on("deckforge:api-state", (_event, state) => callback(state));
  }
});
