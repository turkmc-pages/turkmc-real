const COOKIE = "turkmc_admin";
const SESSION_TTL = 8 * 60 * 60;

const TYPES = [
  "Survival", "SkyBlock", "Factions", "Towny",
  "TrapPvP", "PvP", "BedWars", "Pixelmon", "Diğer"
];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {"content-type": "application/json; charset=UTF-8"}
  });
}

function assets(env) {
  return env.ASSETS || env["turkmc assets"] || env["turkmc_assets"] || null;
}

function clean(v, max = 2000) {
  return String(v ?? "").trim().slice(0, max);
}

function cookieValue(request, name) {
  const raw = request.headers.get("Cookie") || "";
  const part = raw.split(";").map(x => x.trim()).find(x => x.startsWith(name + "="));
  return part ? decodeURIComponent(part.slice(name.length + 1)) : "";
}

function b64url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromB64url(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

async function sign(secret, text) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    {name:"HMAC", hash:"SHA-256"}, false, ["sign"]
  );
  return b64url(new Uint8Array(await crypto.subtle.sign(
    "HMAC", key, new TextEncoder().encode(text)
  )));
}

async function makeSession(secret) {
  const ts = Math.floor(Date.now() / 1000);
  return ts + "." + await sign(secret, String(ts));
}

async function validSession(request, secret) {
  if (!secret) return false;
  const token = cookieValue(request, COOKIE);
  const [ts, sig] = token.split(".");
  if (!ts || !sig) return false;
  const n = Number(ts);
  if (!Number.isFinite(n) || Math.floor(Date.now()/1000) - n > SESSION_TTL) return false;
  const expected = await sign(secret, ts);
  return sig === expected;
}

function authRequired(request, env) {
  return validSession(request, env.ADMIN_PASSWORD);
}

async function adminPage(env, request) {
  const a = assets(env);
  if (!a) {
    return new Response("Assets binding bulunamadı. Cloudflare binding adı ASSETS veya turkmc assets olmalı.", {status:500});
  }
  return a.fetch(new Request(new URL("/admin.html", request.url), request));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    try {
      if (path === "/admin" || path === "/admin/") {
        return adminPage(env, request);
      }

      if (path === "/api/servers" && method === "GET") {
        const rows = await env.DB.prepare(
          `SELECT id,name,ip,type,description,website,status,created_at,updated_at
           FROM servers WHERE status='approved' ORDER BY id DESC`
        ).all();
        return json(rows.results || []);
      }

      if (path === "/api/servers" && method === "POST") {
        const body = await request.json();
        const name = clean(body.name, 100);
        const ip = clean(body.ip, 120);
        const type = clean(body.type, 40);
        const description = clean(body.description, 1200);
        const website = clean(body.website, 500);

        if (!name || !ip || !type) return json({error:"Sunucu adı, IP ve tür zorunludur."},400);
        if (!TYPES.includes(type)) return json({error:"Geçersiz sunucu türü."},400);

        await env.DB.prepare(
          `INSERT INTO servers (name,ip,type,description,website,status)
           VALUES (?,?,?,?,?,'pending')`
        ).bind(name,ip,type,description,website || null).run();

        return json({ok:true,message:"Başvurun alındı. Yönetici onayı bekleniyor."},201);
      }

      if (path === "/api/admin/login" && method === "POST") {
        const body = await request.json();
        if (!env.ADMIN_PASSWORD) return json({error:"ADMIN_PASSWORD secret tanımlı değil."},500);
        if (String(body.password || "") !== env.ADMIN_PASSWORD) {
          return json({error:"Şifre yanlış."},401);
        }
        const token = await makeSession(env.ADMIN_PASSWORD);
        return new Response(JSON.stringify({ok:true}), {
          headers: {
            "content-type":"application/json; charset=UTF-8",
            "Set-Cookie": `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL}`
          }
        });
      }

      if (path === "/api/admin/logout" && method === "POST") {
        return new Response(JSON.stringify({ok:true}), {
          headers: {
            "content-type":"application/json",
            "Set-Cookie": `${COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`
          }
        });
      }

      if (path === "/api/admin/servers") {
        if (!(await authRequired(request, env))) return json({error:"Yetkisiz."},401);
        if (method === "GET") {
          const rows = await env.DB.prepare(
            `SELECT id,name,ip,type,description,website,status,created_at,updated_at
             FROM servers ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, id DESC`
          ).all();
          return json(rows.results || []);
        }
      }

      const approve = path.match(/^\/api\/admin\/servers\/(\d+)\/approve$/);
      if (approve && method === "POST") {
        if (!(await authRequired(request, env))) return json({error:"Yetkisiz."},401);
        await env.DB.prepare(
          `UPDATE servers SET status='approved',updated_at=CURRENT_TIMESTAMP WHERE id=?`
        ).bind(Number(approve[1])).run();
        return json({ok:true});
      }

      const item = path.match(/^\/api\/admin\/servers\/(\d+)$/);
      if (item) {
        if (!(await authRequired(request, env))) return json({error:"Yetkisiz."},401);
        const id = Number(item[1]);

        if (method === "DELETE") {
          await env.DB.prepare(`DELETE FROM servers WHERE id=?`).bind(id).run();
          return json({ok:true});
        }

        if (method === "PUT") {
          const body = await request.json();
          const name = clean(body.name,100);
          const ip = clean(body.ip,120);
          const type = clean(body.type,40);
          const description = clean(body.description,1200);
          const website = clean(body.website,500);
          const status = body.status === "approved" ? "approved" : "pending";

          if (!name || !ip || !TYPES.includes(type)) {
            return json({error:"Eksik veya geçersiz bilgi."},400);
          }

          await env.DB.prepare(
            `UPDATE servers SET name=?,ip=?,type=?,description=?,website=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`
          ).bind(name,ip,type,description,website || null,status,id).run();

          return json({ok:true});
        }
      }

      const a = assets(env);
      if (a) return a.fetch(request);

      return new Response("TURKMC Worker çalışıyor.", {status:200});
    } catch (err) {
      return json({error: err?.message || "Sunucu hatası."},500);
    }
  }
};
