const COOKIE = 'turkmc_admin';
const SESSION_SECONDS = 8 * 60 * 60;

const TYPES = new Set(['Survival','SkyBlock','Factions','Towny','TrapPvP','PvP','BedWars','Pixelmon','Diğer']);

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=UTF-8', ...extra }
  });
}

function getAssets(env) {
  return env.ASSETS || env['turkmc assets'] || env.TURKMC_ASSETS || env.turkmc_assets;
}

function base64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64url(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

async function sign(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  return base64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))));
}

async function makeSession(secret) {
  const ts = Math.floor(Date.now() / 1000).toString();
  return `${ts}.${await sign(secret, ts)}`;
}

function getCookie(request, name) {
  const raw = request.headers.get('Cookie') || '';
  const part = raw.split(';').map(x => x.trim()).find(x => x.startsWith(name + '='));
  return part ? decodeURIComponent(part.slice(name.length + 1)) : null;
}

async function isAdmin(request, env) {
  if (!env.ADMIN_PASSWORD) return false;
  const token = getCookie(request, COOKIE);
  if (!token) return false;
  const [ts, sig] = token.split('.');
  if (!ts || !sig || !/^\d+$/.test(ts)) return false;
  const age = Math.floor(Date.now() / 1000) - Number(ts);
  if (age < 0 || age > SESSION_SECONDS) return false;
  const expected = await sign(env.ADMIN_PASSWORD, ts);
  return sig === expected;
}

function clean(value, max = 2000) {
  return String(value ?? '').trim().slice(0, max);
}

async function requireAdmin(request, env) {
  if (!(await isAdmin(request, env))) return json({ error: 'Yetkisiz erişim.' }, 401);
  return null;
}

async function api(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (!env.DB) return json({ error: 'D1 DB binding bulunamadı.' }, 500);

  if (request.method === 'GET' && path === '/api/servers') {
    const { results } = await env.DB.prepare(
      `SELECT id,name,ip,type,description,website,created_at
       FROM servers WHERE status='published' ORDER BY id DESC`
    ).all();
    return json({ servers: results.map(s => ({ ...s, link: s.website || '' })) });
  }

  if (request.method === 'POST' && path === '/api/servers') {
    let body;
    try { body = await request.json(); } catch { return json({ error: 'Geçersiz veri.' }, 400); }
    const name = clean(body.name, 100);
    const ip = clean(body.ip, 200);
    const type = clean(body.type, 40);
    const link = clean(body.link, 500);
    const description = clean(body.description, 1000);
    if (!name || !ip || !TYPES.has(type)) return json({ error: 'Sunucu adı, IP ve tür zorunludur.' }, 400);
    await env.DB.prepare(
      `INSERT INTO servers (name,ip,type,description,website,status)
       VALUES (?,?,?,?,?,'pending')`
    ).bind(name, ip, type, description, link || null).run();
    return json({ ok: true, message: 'Başvurun alındı. Yönetici onayı bekleniyor.' }, 201);
  }

  if (request.method === 'POST' && path === '/api/admin/login') {
    let body;
    try { body = await request.json(); } catch { return json({ error: 'Geçersiz veri.' }, 400); }
    if (!env.ADMIN_PASSWORD || body.password !== env.ADMIN_PASSWORD) return json({ error: 'Şifre hatalı.' }, 401);
    const token = await makeSession(env.ADMIN_PASSWORD);
    return json({ ok: true }, 200, {
      'Set-Cookie': `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_SECONDS}`
    });
  }

  if (request.method === 'POST' && path === '/api/admin/logout') {
    return json({ ok: true }, 200, {
      'Set-Cookie': `${COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`
    });
  }

  if (request.method === 'GET' && path === '/api/admin/me') {
    return isAdmin(request, env) ? json({ ok: true }) : json({ error: 'Yetkisiz.' }, 401);
  }

  if (path.startsWith('/api/admin/servers')) {
    const denied = await requireAdmin(request, env);
    if (denied) return denied;

    if (request.method === 'GET' && path === '/api/admin/servers') {
      const { results } = await env.DB.prepare(
        `SELECT id,name,ip,type,description,website,status,created_at,updated_at
         FROM servers ORDER BY CASE WHEN status='pending' THEN 0 ELSE 1 END, id DESC`
      ).all();
      return json({ servers: results.map(s => ({ ...s, link: s.website || '' })) });
    }

    const match = path.match(/^\/api\/admin\/servers\/(\d+)$/);
    if (!match) return json({ error: 'Geçersiz sunucu adresi.' }, 404);
    const id = Number(match[1]);

    if (request.method === 'DELETE') {
      await env.DB.prepare('DELETE FROM servers WHERE id=?').bind(id).run();
      return json({ ok: true });
    }

    if (request.method === 'PATCH' || request.method === 'PUT') {
      let body;
      try { body = await request.json(); } catch { return json({ error: 'Geçersiz veri.' }, 400); }
      const current = await env.DB.prepare('SELECT * FROM servers WHERE id=?').bind(id).first();
      if (!current) return json({ error: 'Sunucu bulunamadı.' }, 404);

      const name = clean(body.name ?? current.name, 100);
      const ip = clean(body.ip ?? current.ip, 200);
      const type = clean(body.type ?? current.type, 40);
      const link = clean(body.link ?? current.website ?? '', 500);
      const description = clean(body.description ?? current.description ?? '', 1000);
      const status = body.status === 'published' || body.status === 'pending' ? body.status : current.status;
      if (!name || !ip || !TYPES.has(type)) return json({ error: 'Geçersiz sunucu bilgisi.' }, 400);

      await env.DB.prepare(
        `UPDATE servers SET name=?,ip=?,type=?,description=?,website=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`
      ).bind(name, ip, type, description, link || null, status, id).run();
      return json({ ok: true });
    }
  }

  return json({ error: 'API endpoint bulunamadı.' }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      try { return await api(request, env); }
      catch (e) { return json({ error: 'Sunucu hatası.', detail: String(e?.message || e) }, 500); }
    }

    const assets = getAssets(env);
    if (!assets) return new Response('Assets binding bulunamadı.', { status: 500 });

    // /admin uses the same styled index.html. The page switches to the secure admin UI after login.
    if (url.pathname === '/admin' || url.pathname === '/admin/') {
      return assets.fetch(new Request(new URL('/index.html', request.url), request));
    }

    return assets.fetch(request);
  }
};
