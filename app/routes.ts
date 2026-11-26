import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("manage", "routes/manage.tsx"),
  route("api/upload", "routes/api.upload.ts"),
  route(":filename", "routes/$filename.tsx"),
] satisfies RouteConfig;
