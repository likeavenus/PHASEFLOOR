import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import glsl from "vite-plugin-glsl";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

const musicLibraryId = "virtual:music-library";
const resolvedMusicLibraryId = `\0${musicLibraryId}`;
const supportedAudioFile = /\.(mp3|wav|ogg|m4a|aac|flac)$/i;

const musicLibrary = () => ({
  name: "phasefloor-music-library",
  resolveId(id) {
    return id === musicLibraryId ? resolvedMusicLibraryId : null;
  },
  load(id) {
    if (id !== resolvedMusicLibraryId) return null;

    const directory = resolve(process.cwd(), "public/music");
    const files = readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && supportedAudioFile.test(entry.name))
      .map((entry) => entry.name)
      .sort((left, right) =>
        left.localeCompare(right, "en", { sensitivity: "base" })
      );

    return `export default ${JSON.stringify(files)};`;
  },
});

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [musicLibrary(), react(), glsl()],
  assetsInclude: ["**/*.mp3", "**/*.gltf"],
  base: "/PHASEFLOOR/",
});
