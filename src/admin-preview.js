// 管理者用の鍵はURLの # 以降からだけ読む。
// fragment はサーバーのアクセスログや Referer に送られないため、query より漏れにくい。
export async function verifyAdminPreview() {
  let key = "";
  try {
    const h = new URLSearchParams(location.hash.replace(/^#/, ""));
    key = h.get("admin") || "";
  } catch (e) { return false; }
  if (!key) return false;

  try {
    const r = await fetch("/api/admin-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
      cache: "no-store",
    });
    return r.ok && Boolean((await r.json()).ok);
  } catch (e) {
    return false;
  }
}
