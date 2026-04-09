export interface ExtensionFileType {
  extensions: string[];
  binary?: boolean;
}

export interface ExtensionManifest {
  id: string;
  name: string;
  version: string;
  main?: string;
  fileTypes: ExtensionFileType[];
  description?: string;
  author?: string;
  icon?: string;
  cushionVersion?: string;
}
