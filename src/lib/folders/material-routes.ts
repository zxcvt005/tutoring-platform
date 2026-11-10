import type { MaterialFolderKind } from "@/lib/folders/material-folders";

export type MaterialsLibraryBase =
  | "kafedra"
  | "direkciya-knowledge"
  | "assistent-knowledge";

/** Маршруты открытия материалов из единого проводника. */
export function materialOpenHref(
  base: MaterialsLibraryBase,
  kind: Exclude<MaterialFolderKind, "folder">,
  id: string
): string | null {
  if (base === "kafedra") {
    switch (kind) {
      case "topic":
        return `/kafedra/topics/${id}`;
      case "test":
        return null; // открывается редактором на месте
      case "theory":
        return `/kafedra/theory/${id}`;
      case "intensive":
        return `/kafedra/intensivy/${id}`;
    }
  }
  const knowledgeRoot =
    base === "assistent-knowledge" ? "/assistent/knowledge" : "/direkciya/knowledge";
  switch (kind) {
    case "theory":
      return `${knowledgeRoot}/theory/${id}`;
    case "intensive":
      return `${knowledgeRoot}/intensives/${id}`;
    case "topic":
    case "test":
      return null;
  }
}

export const MIXED_MATERIAL_KINDS: MaterialFolderKind[] = [
  "folder",
  "topic",
  "test",
  "theory",
  "intensive",
];
