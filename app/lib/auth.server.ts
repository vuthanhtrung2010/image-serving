export function getAdminPassword(env: Env): string {
  return (
    import.meta.env.ADMIN_PASSWORD ||
    env.ADMIN_PASSWORD ||
    "Abcd@1234"
  );
}
