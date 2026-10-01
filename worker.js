/**
 * TÜRKMC - Cloudflare Workers Dağıtım Dosyası (worker.js)
 * Minecraft Türkiye Topluluğu Sunucu Tanıtım ve Yönetim Sistemi
 */

// Varsayılan Sunucu Verileri (İlk Kurulum İçin)
const DEFAULT_SERVERS = [
  {
    id: "srv-1",
    name: "PurpurMC",
    ip: "oyna.purpurmc.com",
    category: "Survival",
    version: "26.2 / 1.20 - 1.21",
    slot: "2026 Oyuncu",
    difficulty: "Emek",
    slogan: "26.2 Son Sürüm SMP - Sesli Sohbet, Özel Claim ve Ekonomi Sistemi!",
    banner: "https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=800&q=80",
    logo: "https://api.dicebear.com/7.x/identicon/svg?seed=PurpurMC",
    discord: "https://discord.gg/turkmc",
    web: "https://purpurmc.com",
    featured: true,
    description: "PurpurMC, Türkiye'nin en yenilikçi SMP Survival sunucularından biridir.\n\nÖzellikler:\n• Gelişmiş Claim & Güvenlik Sistemi\n• Sesli Sohbet Desteği\n• Özel Meslekler ve Ticaret Pazarı\n• 7/24 Kesintisiz Destek Ekibi"
  },
  {
    id: "srv-2",
    name: "RebornCraft",
    ip: "play.reborncraft.pw",
    category: "Skyblock",
    version: "1.16 - 1.20",
    slot: "1000 Oyuncu",
    difficulty: "Orta",
    slogan: "Yenilikçi Skyblock Deneyimi, Ada Yükseltmeleri ve Minyonlar!",
    banner: "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=800&q=80",
    logo: "https://api.dicebear.com/7.x/identicon/svg?seed=RebornCraft",
    discord: "https://discord.gg/turkmc",
    web: "",
    featured: true,
    description: "RebornCraft ile kendi adanı kur, adanı genişlet ve en güçlü ada ol!\n\nÖne Çıkanlar:\n• Özel Ada Görevleri\n• Otomatik Minyon Sistemleri\n• Haftalık Ada Sıralaması"
  },
  {
    id: "srv-3",
    name: "SentorCraft",
    ip: "play.sentorcraft.com",
    category: "Towny",
    version: "1.20.4",
    slot: "800 Oyuncu",
    difficulty: "Emek",
    slogan: "Gerçek Dünya Haritasında Kendi Şehrini ve Krallığını Kur!",
    banner: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=800&q=80",
    logo: "https://api.dicebear.com/7.x/identicon/svg?seed=SentorCraft",
    discord: "https://discord.gg/turkmc",
    web: "",
    featured: false,
    description: "SentorCraft Towny sunucusunda ulusunu kur, sınırlarını genişlet ve diplomasi geliştir!\n\nÖzellikler:\n• 1:500 Gerçek Dünya Haritası\n• Kuşatma ve Savaş Sistemleri"
  },
  {
    id: "srv-4",
    name: "MuzCraft",
    ip: "mc.muzcraft.com",
    category: "Faction",
    version: "1.8 - 1.20",
    slot: "1500 Oyuncu",
    difficulty: "Zor",
    slogan: "7 Yıldır Sıfırlanmayan Türkiye'nin Tek Köklü Faction Sunucusu!",
    banner: "https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=800&q=80",
    logo: "https://api.dicebear.com/7.x/identicon/svg?seed=MuzCraft",
    discord: "https://discord.gg/turkmc",
    web: "",
    featured: false,
    description: "MuzCraft Faction'da klanını topla ve kaleleri fethet!\n\nÖne Çıkanlar:\n• Sıfırlanmayan Emek Klan Arenası\n• Boss Zindanları"
  }
];

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
