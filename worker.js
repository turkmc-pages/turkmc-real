/**
 * TÜRKMC - Cloudflare Workers Dağıtım Dosyası (worker.js)
 * Minecraft Türkiye Topluluğu Sunucu Tanıtım ve Yönetim Sistemi
 */

// Varsayılan Sunucu Verileri (Başlangıçta boş başlar, sadece onaylanan sunucular görünür)
const DEFAULT_SERVERS = [];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // --- API: Yayındaki Sunucuları Getir ---
    if (path === "/api/servers" && request.method === "GET") {
      let servers = DEFAULT_SERVERS;
      if (env && env.TURKMC_KV) {
        const stored = await env.TURKMC_KV.get("approved_servers", { type: "json" });
        if (stored && Array.isArray(stored)) servers = stored;
      }
      return new Response(JSON.stringify(servers), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // --- API: Yeni Sunucu Başvurusu Yap ---
    if (path === "/api/servers/apply" && request.method === "POST") {
      try {
        const data = await request.json();
        data.id = "pending-" + Date.now();
        data.appliedAt = new Date().toLocaleString("tr-TR");
        data.status = "pending";

        if (env && env.TURKMC_KV) {
          let pending = (await env.TURKMC_KV.get("pending_servers", { type: "json" })) || [];
          pending.push(data);
          await env.TURKMC_KV.put("pending_servers", JSON.stringify(pending));
        }

        return new Response(JSON.stringify({ success: true, item: data }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 400, headers: corsHeaders });
      }
    }

    // --- API: Admin Bekleyen Başvuruları Getir ---
    if (path === "/api/admin/pending" && request.method === "GET") {
      let pending = [];
      if (env && env.TURKMC_KV) {
        pending = (await env.TURKMC_KV.get("pending_servers", { type: "json" })) || [];
      }
      return new Response(JSON.stringify(pending), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // --- API: Admin Başvuruyu Onayla / Kabul Et ---
    if (path === "/api/admin/approve" && request.method === "POST") {
      try {
        const { id } = await request.json();
        if (env && env.TURKMC_KV) {
          let pending = (await env.TURKMC_KV.get("pending_servers", { type: "json" })) || [];
          let approved = (await env.TURKMC_KV.get("approved_servers", { type: "json" })) || DEFAULT_SERVERS;

          const target = pending.find(p => p.id === id);
          if (target) {
            pending = pending.filter(p => p.id !== id);
            target.id = "srv-" + Date.now();
            target.status = "approved";
            approved.unshift(target);

            await env.TURKMC_KV.put("pending_servers", JSON.stringify(pending));
            await env.TURKMC_KV.put("approved_servers", JSON.stringify(approved));
            return new Response(JSON.stringify({ success: true, server: target }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
          }
        }
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 400, headers: corsHeaders });
      }
    }

    // --- API: Admin Başvuruyu Reddet / Sil ---
    if (path === "/api/admin/reject" && request.method === "POST") {
      try {
        const { id } = await request.json();
        if (env && env.TURKMC_KV) {
          let pending = (await env.TURKMC_KV.get("pending_servers", { type: "json" })) || [];
          pending = pending.filter(p => p.id !== id);
          await env.TURKMC_KV.put("pending_servers", JSON.stringify(pending));
        }
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 400, headers: corsHeaders });
      }
    }

    // Statik Dosyaları Sun (Cloudflare Workers Static Assets)
    if (env && env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("TÜRKMC Cloudflare Worker Aktif!", {
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
  }
};
