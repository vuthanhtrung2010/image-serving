import { reactRouter } from "@react-router/dev/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    cloudflare({
      viteEnvironment: { name: "ssr" },
      // Prerendering during `react-router build` runs an internal Vite preview
      // server that does not need remote Cloudflare R2 access.
      remoteBindings: !process.env.CLOUDFLARE_VITE_BUILD,
    }),
    tailwindcss(),
    reactRouter(),
  ],
});
