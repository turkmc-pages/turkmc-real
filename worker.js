/**
 * TÜRKMC - Cloudflare Workers Dağıtım Dosyası (worker.js)
 * Minecraft Türkiye Topluluğu: Sunucu, Klan ve Tierlist Tanıtım Sistemi
 */

// Varsayılan Sunucular (Boş başlar, sadece eklenen ve onaylananlar listelenir)
const DEFAULT_SERVERS = [];
const DEFAULT_CLANS = [];
const DEFAULT_TIERLIST = [];

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

    // --- API: Yayındaki Minecraft Sunucularını Getir ---
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

    // --- API: Yayındaki Klanları Getir ---
    if (path === "/api/clans" && request.method === "GET") {
      let clans = DEFAULT_CLANS;
      if (env && env.TURKMC_KV) {
        const stored = await env.TURKMC_KV.get("approved_clans", { type: "json" });
        if (stored && Array.isArray(stored)) clans = stored;
      }
      return new Response(JSON.stringify(clans), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // --- API: Yayındaki Tierlist Sunucularını Getir ---
    if (path === "/api/tierlist" && request.method === "GET") {
      let tierlist = DEFAULT_TIERLIST;
      if (env && env.TURKMC_KV) {
        const stored = await env.TURKMC_KV.get("approved_tierlist", { type: "json" });
        if (stored && Array.isArray(stored)) tierlist = stored;
      }
      return new Response(JSON.stringify(tierlist), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
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
