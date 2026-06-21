import { dialog, shell } from "electron";

export async function selectMaterialDirectory(): Promise<string | undefined> {
  const result = await dialog.showOpenDialog({
    title: "选择材料目录",
    properties: ["openDirectory"]
  });
  return result.canceled ? undefined : result.filePaths[0];
}

export async function selectTemplateFile(): Promise<string | undefined> {
  const result = await dialog.showOpenDialog({
    title: "选择模板引用",
    filters: [
      { name: "Template References", extensions: ["pptx", "html", "htm", "png", "jpg", "jpeg", "webp", "pdf", "json"] }
    ],
    properties: ["openFile"]
  });
  return result.canceled ? undefined : result.filePaths[0];
}

export async function selectOutputDirectory(): Promise<string | undefined> {
  const result = await dialog.showOpenDialog({
    title: "选择输出目录",
    properties: ["openDirectory", "createDirectory"]
  });
  return result.canceled ? undefined : result.filePaths[0];
}

export async function openPath(targetPath: string): Promise<void> {
  await shell.openPath(targetPath);
}
