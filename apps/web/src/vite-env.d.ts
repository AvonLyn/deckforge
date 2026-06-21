/// <reference types="vite/client" />

interface DeckForgeDesktopBridge {
  selectMaterialDirectory: () => Promise<string | undefined>;
  selectTemplateFile: () => Promise<string | undefined>;
  selectOutputDirectory: () => Promise<string | undefined>;
  openPath: (targetPath: string) => Promise<void>;
  onApiState: (callback: (state: unknown) => void) => void;
}

interface Window {
  deckforgeDesktop?: DeckForgeDesktopBridge;
}
