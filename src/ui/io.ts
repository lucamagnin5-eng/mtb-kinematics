// Ouverture / enregistrement de fichiers : dialogues natifs dans l'appli desktop (Tauri),
// téléchargement / sélection de fichier quand l'interface tourne dans un navigateur.

import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";

export const isDesktop = () => "__TAURI_INTERNALS__" in window;

export interface FileFilter { name: string; extensions: string[] }

export async function openText(filters: FileFilter[]): Promise<{ name: string; text: string } | null> {
  if (isDesktop()) {
    const path = await open({ multiple: false, directory: false, filters });
    if (typeof path !== "string") return null;
    return { name: baseName(path), text: await readTextFile(path) };
  }
  return new Promise(resolve => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = filters.flatMap(f => f.extensions.map(e => "." + e)).join(",");
    input.onchange = async () => {
      const f = input.files?.[0];
      resolve(f ? { name: f.name, text: await f.text() } : null);
    };
    input.click();
  });
}

/** Renvoie le nom du fichier écrit, ou null si l'utilisateur a annulé. */
export async function saveText(defaultName: string, text: string, filters: FileFilter[]): Promise<string | null> {
  if (isDesktop()) {
    const path = await save({ defaultPath: defaultName, filters });
    if (!path) return null;
    await writeTextFile(path, text);
    return baseName(path);
  }
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = defaultName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return defaultName;
}

const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p;
