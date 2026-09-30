const COOKIE = "turkmc_admin";
const SESSION_TTL = 8 * 60 * 60;

const TYPES = [
  "Survival",
  "SkyBlock",
  "Factions",
  "Towny",
  "TrapPvP",
  "PvP",
  "BedWars",
  "Pixelmon",
  "Klan",
  "Tier List",
  "Diğer"
];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=UTF-8"
    }
  });
}

function assets(env) {
  return env.ASSETS || null;
}

function clean(v, max = 2000) {
  return String(v ?? "").trim().slice(0, max);
}

function cookieValue(request, name) {
  const raw = request.headers.get("Cookie") || "";

  const part = raw
    .split(";")
    .map(x => x.trim())
    .find(x => x.startsWith(name + "="));

  return part
    ? decodeURIComponent(part.slice(name.length + 1))
    : "";
}

function b64url(bytes) {
  let s = "";

  for (const b of bytes) {
    s += String.fromCharCode(b);
  }

  return btoa(s)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function sign(secret, text) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256"
    },
    false,
    ["sign"]
  );

  return b64url(
    new Uint8Array(
      await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(text)
      )
    )
  );
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

  if (!Number.isFinite(n)) return false;

  const age = Math.floor(Date.now() / 1000) - n;

  if (age < 0 || age > SESSION_TTL) {
    return false;
  }

  const expected = await sign(secret, ts);

  return sig === expected;
}

async function authRequired(request, env) {
  return await validSession(request, env.ADMIN_PASSWORD);
}

async function adminPage(env, request) {
  const a = assets(env);

  if (!a) {
    return new Response("Assets binding bulunamadı.", {
      status: 500
    });
  }

  const adminUrl = new URL(request.url);
  adminUrl.pathname = "/admin.html";
  adminUrl.search = "";

  return a.fetch(
    new Request(adminUrl.toString(), {
      method: "GET",
      headers: request.headers
    })
  );
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    try {

      // ==========================================
      // ADMIN SAYFASI
      // ==========================================

      if (path === "/admin" || path === "/admin/") {
        return await adminPage(env, request);
      }


      // ==========================================
      // SUNUCULAR - ONAYLANMIŞLAR
      // ==========================================

      if (path === "/api/servers" && method === "GET") {

        if (!env.DB) {
          return json({
            error: "DB binding bulunamadı."
          }, 500);
        }

        const rows = await env.DB.prepare(
          `SELECT id,name,ip,type,description,website,status,created_at,updated_at
           FROM servers
           WHERE status='approved'
           ORDER BY id DESC`
        ).all();

        return json(rows.results || []);
      }


      // ==========================================
      // YENİ SUNUCU BAŞVURUSU
      // ==========================================

      if (path === "/api/servers" && method === "POST") {

        if (!env.DB) {
          return json({
            error: "DB binding bulunamadı."
          }, 500);
        }

        const body = await request.json();

        const name = clean(body.name, 100);
        const ip = clean(body.ip, 120);
        const type = clean(body.type, 40);
        const description = clean(body.description, 1200);
        const website = clean(body.website, 500);

        if (!name || !ip || !type) {
          return json({
            error: "Sunucu adı, IP ve tür zorunludur."
          }, 400);
        }

        if (!TYPES.includes(type)) {
          return json({
            error: "Geçersiz sunucu türü."
          }, 400);
        }

        await env.DB.prepare(
          `INSERT INTO servers
           (name,ip,type,description,website,status)
           VALUES (?,?,?,?,?,'pending')`
        )
        .bind(
          name,
          ip,
          type,
          description,
          website || null
        )
        .run();

        return json({
          ok: true,
          message: "Başvurun alındı. Yönetici onayı bekleniyor."
        }, 201);
      }


      // ==========================================
      // ADMIN LOGIN
      // ==========================================

      if (path === "/api/admin/login" && method === "POST") {

        const body = await request.json();

        if (!env.ADMIN_PASSWORD) {
          return json({
            error: "ADMIN_PASSWORD secret tanımlı değil."
          }, 500);
        }

        if (String(body.password || "") !== env.ADMIN_PASSWORD) {
          return json({
            error: "Şifre yanlış."
          }, 401);
        }

        const token = await makeSession(env.ADMIN_PASSWORD);

        return new Response(
          JSON.stringify({
            ok: true
          }),
          {
            status: 200,
            headers: {
              "content-type":
                "application/json; charset=UTF-8",

              "Set-Cookie":
                `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL}`
            }
          }
        );
      }


      // ==========================================
      // ADMIN LOGOUT
      // ==========================================

      if (path === "/api/admin/logout" && method === "POST") {

        return new Response(
          JSON.stringify({
            ok: true
          }),
          {
            status: 200,
            headers: {
              "content-type":
                "application/json; charset=UTF-8",

              "Set-Cookie":
                `${COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`
            }
          }
        );
      }


      // ==========================================
      // ADMIN - TÜM SUNUCULAR
      // ==========================================

      if (path === "/api/admin/servers") {

        if (!(await authRequired(request, env))) {
          return json({
            error: "Yetkisiz."
          }, 401);
        }

        if (!env.DB) {
          return json({
            error: "DB binding bulunamadı."
          }, 500);
        }

        if (method === "GET") {

          const rows = await env.DB.prepare(
            `SELECT id,name,ip,type,description,website,status,created_at,updated_at
             FROM servers
             ORDER BY
               CASE status
                 WHEN 'pending' THEN 0
                 ELSE 1
               END,
               id DESC`
          ).all();

          return json(rows.results || []);
        }
      }


      // ==========================================
      // ADMIN - SUNUCU ONAYLA
      // ==========================================

      const approve =
        path.match(
          /^\/api\/admin\/servers\/(\d+)\/approve$/
        );

      if (approve && method === "POST") {

        if (!(await authRequired(request, env))) {
          return json({
            error: "Yetkisiz."
          }, 401);
        }

        if (!env.DB) {
          return json({
            error: "DB binding bulunamadı."
          }, 500);
        }

        await env.DB.prepare(
          `UPDATE servers
           SET status='approved',
               updated_at=CURRENT_TIMESTAMP
           WHERE id=?`
        )
        .bind(Number(approve[1]))
        .run();

        return json({
          ok: true
        });
      }


      // ==========================================
      // ADMIN - SUNUCU DÜZENLE / SİL
      // ==========================================

      const item =
        path.match(
          /^\/api\/admin\/servers\/(\d+)$/
        );

      if (item) {

        if (!(await authRequired(request, env))) {
          return json({
            error: "Yetkisiz."
          }, 401);
        }

        if (!env.DB) {
          return json({
            error: "DB binding bulunamadı."
          }, 500);
        }

        const id = Number(item[1]);


        // SİL
        if (method === "DELETE") {

          await env.DB.prepare(
            `DELETE FROM servers WHERE id=?`
          )
          .bind(id)
          .run();

          return json({
            ok: true
          });
        }


        // DÜZENLE
        if (method === "PUT") {

          const body = await request.json();

          const name =
            clean(body.name, 100);

          const ip =
            clean(body.ip, 120);

          const type =
            clean(body.type, 40);

          const description =
            clean(body.description, 1200);

          const website =
            clean(body.website, 500);

          const status =
            body.status === "approved"
              ? "approved"
              : "pending";

          if (
            !name ||
            !ip ||
            !TYPES.includes(type)
          ) {
            return json({
              error: "Eksik veya geçersiz bilgi."
            }, 400);
          }

          await env.DB.prepare(
            `UPDATE servers
             SET name=?,
                 ip=?,
                 type=?,
                 description=?,
                 website=?,
                 status=?,
                 updated_at=CURRENT_TIMESTAMP
             WHERE id=?`
          )
          .bind(
            name,
            ip,
            type,
            description,
            website || null,
            status,
            id
          )
          .run();

          return json({
            ok: true
          });
        }
      }


      // ==========================================
      // STATİK DOSYALAR
      // ==========================================

      const a = assets(env);

      if (a) {
        return a.fetch(request);
      }

      return new Response(
        "TURKMC Worker çalışıyor.",
        {
          status: 200
        }
      );

    } catch (err) {

      return json({
        error:
          err?.message ||
          "Sunucu hatası."
      }, 500);
    }
  }
};
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // Veritabanı tablosunu otomatik oluştur
    try {
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS servers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          ip TEXT NOT NULL,
          type TEXT NOT NULL,
          link TEXT,
          description TEXT,
          status TEXT DEFAULT 'pending',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `).run();
    } catch(e) {}

    // 1. Herkesin görebileceği onaylanmış sunucular
    if (path === '/api/servers' && method === 'GET') {
      const { results } = await env.DB.prepare("SELECT id, name, ip, type, link, description FROM servers WHERE status = 'published' ORDER BY id DESC").all();
      return Response.json({ servers: results });
    }

    // 2. Kullanıcıların yeni sunucu ekleme isteği (pending olarak düşer)
    if (path === '/api/servers' && method === 'POST') {
      try {
        const body = await request.json();
        if (!body.name || !body.ip || !body.type) {
          return Response.json({ error: 'Gerekli alanlar eksik!' }, { status: 400 });
        }
        await env.DB.prepare("INSERT INTO servers (name, ip, type, link, description, status) VALUES (?, ?, ?, ?, ?, 'pending')")
          .bind(body.name, body.ip, body.type, body.link || '', body.description || '').run();
        return Response.json({ success: true });
      } catch (e) {
        return Response.json({ error: e.message }, { status: 500 });
      }
    }

    // 3. Admin Giriş İşlemi
    if (path === '/api/admin/login' && method === 'POST') {
      try {
        const body = await request.json();
        const adminPass = env.ADMIN_PASSWORD || 'turkmc2026'; // Varsayılan şifre
        if (body.password === adminPass) {
          // Basit oturum çerezi/token üretimi
          return new Response(JSON.stringify({ success: true }), {
            headers: {
              'Content-Type': 'application/json',
              'Set-Cookie': `turkmc_auth=true; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=86400`
            }
          });
        }
        return Response.json({ error: 'Geçersiz şifre' }, { status: 401 });
      } catch (e) {
        return Response.json({ error: 'Hata' }, { status: 500 });
      }
    }

    // Admin oturum kontrolü middleware yardımcı fonksiyonu
    const isAdmin = request.headers.get('Cookie')?.includes('turkmc_auth=true');

    if (path === '/api/admin/me') {
      if (isAdmin) return Response.json({ ok: true });
      return Response.json({ error: 'Yetkisiz' }, { status: 401 });
    }

    // 4. Admin Paneli: Tüm sunucuları listele (Bekleyenler ve Yayındakiler)
    if (path === '/api/admin/servers') {
      if (!isAdmin) return Response.json({ error: 'Yetkisiz' }, { status: 401 });
      const { results } = await env.DB.prepare("SELECT * FROM servers ORDER BY id DESC").all();
      return Response.json({ servers: results });
    }

    // 5. Admin: Sunucuyu Onayla (published yap)
    if (path.startsWith('/api/admin/servers/') && method === 'PATCH') {
      if (!isAdmin) return Response.json({ error: 'Yetkisiz' }, { status: 401 });
      const id = path.split('/').pop();
      await env.DB.prepare("UPDATE servers SET status = 'published' WHERE id = ?").bind(id).run();
      return Response.json({ success: true });
    }

    // 6. Admin: Sunucuyu Sil
    if (path.startsWith('/api/admin/servers/') && method === 'DELETE') {
      if (!isAdmin) return Response.json({ error: 'Yetkisiz' }, { status: 401 });
      const id = path.split('/').pop();
      await env.DB.prepare("DELETE FROM servers WHERE id = ?").bind(id).run();
      return Response.json({ success: true });
    }

    // Sayfa yönlendirmeleri (/admin route desteği için)
    if (path === '/admin') {
      // index.html içeriğini döndür ki istemci tarafı /admin rotasını yakalayabilsin
      // (Bunu Cloudflare Pages/Workers statik asset binding ile otomatik de yapabilirsiniz)
    }

    return new Response('Bulunamadı', { status: 404 });
  }
};
