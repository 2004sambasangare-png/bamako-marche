import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Search, Plus, Trash2, Lock, Unlock, Send, X, MessageCircle, Package, Shirt, Wrench, Laptop, ChevronRight, Check, ShoppingBag, Loader2 } from "lucide-react";

const SUPABASE_URL = "https://prqsngajfwwekrpgpose.supabase.co";
const SUPABASE_KEY = "sb_publishable_h_QCXrb4Mp1aLQGHSNrmUA_ewPECzlN";

const sbHeaders = { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY, "Content-Type": "application/json" };

async function sbSelect(table, query) {
  const q = query || "";
  const res = await fetch(SUPABASE_URL + "/rest/v1/" + table + "?" + q, { headers: sbHeaders });
  if (!res.ok) throw new Error("Erreur lecture " + table + " (" + res.status + ")");
  return res.json();
}

async function sbInsert(table, body) {
  const res = await fetch(SUPABASE_URL + "/rest/v1/" + table, {
    method: "POST",
    headers: Object.assign({}, sbHeaders, { Prefer: "return=representation" }),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Erreur insertion " + table + " (" + res.status + ")");
  return res.json();
}

async function sbDelete(table, id) {
  const res = await fetch(SUPABASE_URL + "/rest/v1/" + table + "?id=eq." + id, { method: "DELETE", headers: sbHeaders });
  if (!res.ok) throw new Error("Erreur suppression " + table + " (" + res.status + ")");
}

const CATEGORIES = [
  { id: "info", label: "Informatique", icon: Laptop },
  { id: "habits", label: "Habits", icon: Shirt },
  { id: "industriel", label: "Materiel industriel", icon: Wrench },
];

const WHATSAPP_NUMBER = "22300000000";

function fmt(n) { return new Intl.NumberFormat("fr-FR").format(Math.round(n)) + " FCFA"; }

function rowToProduct(row) {
  return { id: row.id, name: row.name, category: row.category, price: Number(row.price), minPrice: Number(row.min_price), stock: row.stock, desc: row.description || "" };
}

function useProducts() {
  const [products, setProductsState] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchProducts = useCallback(function () {
    setLoading(true);
    return sbSelect("products", "select=*&order=created_at.desc")
      .then(function (data) { setProductsState(data.map(rowToProduct)); setError(null); })
      .catch(function (e) { setError(e.message); })
      .finally(function () { setLoading(false); });
  }, []);

  useEffect(function () { fetchProducts(); }, [fetchProducts]);

  const setProducts = useCallback(function (updater) {
    const current = products;
    const next = typeof updater === "function" ? updater(current) : updater;
    const currentIds = {};
    current.forEach(function (p) { currentIds[p.id] = true; });
    const nextIds = {};
    next.forEach(function (p) { nextIds[p.id] = true; });
    const added = next.filter(function (p) { return !currentIds[p.id]; });
    const removed = current.filter(function (p) { return !nextIds[p.id]; });
    const tasks = [];
    added.forEach(function (p) {
      tasks.push(sbInsert("products", { name: p.name, category: p.category, price: p.price, min_price: p.minPrice, stock: p.stock, description: p.desc }));
    });
    removed.forEach(function (p) { tasks.push(sbDelete("products", p.id)); });
    return Promise.all(tasks).catch(function (e) { setError(e.message); }).then(function () { return fetchProducts(); });
  }, [products, fetchProducts]);

  return { products: products, setProducts: setProducts, loading: loading, error: error, refetch: fetchProducts };
}

function logNegotiation(args) {
  const product = args.product, agreedPrice = args.agreedPrice, status = args.status;
  return sbInsert("negotiations", { product_id: product.id, product_name: product.name, displayed_price: product.price, agreed_price: agreedPrice, status: status })
    .catch(function (e) { console.error("Erreur enregistrement negociation:", e); });
}

function buildWaLink(product, agreedPrice) {
  const lines = ["Bonjour, je suis interesse par : " + product.name, "Prix propose en discussion: " + fmt(product.price), "Prix negocie: " + fmt(agreedPrice), "Merci de confirmer la disponibilite."];
  return "https://wa.me/" + WHATSAPP_NUMBER + "?text=" + encodeURIComponent(lines.join("\n"));
}

function NegotiationChat(props) {
  const product = props.product, onClose = props.onClose;
  const [messages, setMessages] = useState([{ from: "bot", text: 'Bonjour ! Vous negociez pour "' + product.name + '", affiche a ' + fmt(product.price) + ". Proposez votre prix, je fais de mon mieux pour vous satisfaire." }]);
  const [input, setInput] = useState("");
  const [agreedPrice, setAgreedPrice] = useState(null);
  const [roundCount, setRoundCount] = useState(0);
  const [closed, setClosed] = useState(false);
  const endRef = useRef(null);

  useEffect(function () { if (endRef.current) { endRef.current.scrollIntoView({ behavior: "smooth" }); } }, [messages]);

  function push(from, text) { setMessages(function (m) { return m.concat([{ from: from, text: text }]); }); }

  function handleOffer(offerRaw) {
    const offer = Number(String(offerRaw).replace(/[^0-9]/g, ""));
    if (!offer || offer <= 0) { push("bot", "Je n'ai pas compris le montant. Indiquez un chiffre, par exemple 30000."); return; }
    const price = product.price, minPrice = product.minPrice;
    if (offer >= price) {
      setAgreedPrice(price); setClosed(true);
      logNegotiation({ product: product, agreedPrice: price, status: "conclu" });
      push("bot", "Parfait, " + fmt(price) + " c'est notre prix affiche. Marche conclu ! Cliquez ci-dessous pour confirmer sur WhatsApp.");
      return;
    }
    if (offer < minPrice) {
      const round = roundCount + 1;
      setRoundCount(round);
      if (round >= 3) { push("bot", "Je comprends, mais je ne peux vraiment pas descendre plus bas que " + fmt(minPrice) + " pour cet article. C'est ma derniere offre, vous voulez conclure a ce prix ?"); }
      else { push("bot", "Ce prix est un peu trop bas pour moi. Je peux descendre jusqu'a " + fmt(minPrice) + " maximum. Voulez-vous proposer un montant entre " + fmt(minPrice) + " et " + fmt(price) + " ?"); }
      return;
    }
    const mid = Math.round((offer + price) / 2 / 500) * 500;
    if (offer >= minPrice * 1.04 || roundCount >= 1) {
      setAgreedPrice(offer); setClosed(true);
      logNegotiation({ product: product, agreedPrice: offer, status: "conclu" });
      push("bot", "Marche conclu a " + fmt(offer) + " ! C'est un bon prix. Cliquez ci-dessous pour confirmer la commande sur WhatsApp.");
    } else {
      setRoundCount(function (r) { return r + 1; });
      push("bot", "Je vous propose plutot " + fmt(mid) + ". C'est un bon compromis. Ca vous convient ?");
    }
  }

  function handleSend() {
    if (!input.trim() || closed) return;
    push("user", input);
    const text = input;
    setInput("");
    setTimeout(function () { handleOffer(text); }, 350);
  }

  function handleKeyDown(e) { if (e.key === "Enter") handleSend(); }

  return (
    <div className="negchat-overlay" role="dialog" aria-modal="true">
      <div className="negchat-panel">
        <div className="negchat-header">
          <div className="negchat-header-info">
            <MessageCircle size={18} />
            <div>
              <p className="negchat-title">Negociation</p>
              <p className="negchat-subtitle">{product.name}</p>
            </div>
          </div>
          <button className="negchat-close" onClick={onClose} aria-label="Fermer"><X size={18} /></button>
        </div>
        <div className="negchat-price-bar"><span>Prix affiche</span><strong>{fmt(product.price)}</strong></div>
        <div className="negchat-messages">
          {messages.map(function (m, i) { return <div key={i} className={"negchat-bubble negchat-bubble--" + m.from}>{m.text}</div>; })}
          <div ref={endRef}></div>
        </div>
        {!closed && (
          <div className="negchat-input-row">
            <input type="text" inputMode="numeric" placeholder="Votre prix en FCFA, ex: 30000" value={input} onChange={function (e) { setInput(e.target.value); }} onKeyDown={handleKeyDown} className="negchat-input" />
            <button className="negchat-send" onClick={handleSend} aria-label="Envoyer"><Send size={16} /></button>
          </div>
        )}
        {closed && (
          <div className="negchat-confirm">
            <div className="negchat-confirm-price"><Check size={16} /><span>Prix convenu : <strong>{fmt(agreedPrice)}</strong></span></div>
            <a href={buildWaLink(product, agreedPrice)} target="_blank" rel="noopener noreferrer" className="negchat-wa-btn"><span>Confirmer sur WhatsApp</span><ChevronRight size={16} /></a>
          </div>
        )}
      </div>
    </div>
  );
}

function ProductCard(props) {
  const product = props.product, onNegotiate = props.onNegotiate;
  let found = null;
  for (let i = 0; i < CATEGORIES.length; i++) { if (CATEGORIES[i].id === product.category) { found = CATEGORIES[i]; break; } }
  const Icon = found ? found.icon : Package;
  const lowStock = product.stock <= 3;
  return (
    <div className="product-card">
      <div className="product-card-media"><Icon size={34} strokeWidth={1.5} /></div>
      <div className="product-card-body">
        <span className="product-card-cat">{found ? found.label : ""}</span>
        <h3 className="product-card-name">{product.name}</h3>
        <p className="product-card-desc">{product.desc}</p>
        <div className="product-card-footer">
          <span className="product-card-price">{fmt(product.price)}</span>
          <span className={"product-card-stock" + (lowStock ? " is-low" : "")}>{product.stock > 0 ? product.stock + " en stock" : "Epuise"}</span>
        </div>
        <button className="product-card-cta" onClick={function () { onNegotiate(product); }} disabled={product.stock === 0}><MessageCircle size={15} /><span>Negocier le prix</span></button>
      </div>
    </div>
  );
}

const ADMIN_PASSWORD = "mali2026";

function AdminPanel(props) {
  const products = props.products, setProducts = props.setProducts, onClose = props.onClose;
  const [authed, setAuthed] = useState(false);
  const [pwd, setPwd] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", category: "info", price: "", minPrice: "", stock: "", desc: "" });

  function handleLogin() { if (pwd === ADMIN_PASSWORD) { setAuthed(true); setError(""); } else { setError("Mot de passe incorrect."); } }

  function handleAdd() {
    if (!form.name || !form.price || !form.minPrice) return;
    const newProduct = { id: "p" + Date.now(), name: form.name, category: form.category, price: Number(form.price), minPrice: Number(form.minPrice), stock: Number(form.stock) || 0, desc: form.desc };
    setProducts(function (p) { return [newProduct].concat(p); });
    setForm({ name: "", category: "info", price: "", minPrice: "", stock: "", desc: "" });
  }

  function handleDelete(id) { setProducts(function (p) { return p.filter(function (x) { return x.id !== id; }); }); }

  return (
    <div className="admin-overlay" role="dialog" aria-modal="true">
      <div className="admin-panel">
        <div className="admin-header">
          <div className="admin-header-info"><Lock size={17} /><p>Espace administrateur</p></div>
          <button className="negchat-close" onClick={onClose} aria-label="Fermer"><X size={18} /></button>
        </div>
        {!authed && (
          <div className="admin-login">
            <p className="admin-login-label">Entrez le mot de passe admin</p>
            <input type="password" value={pwd} onChange={function (e) { setPwd(e.target.value); }} onKeyDown={function (e) { if (e.key === "Enter") handleLogin(); }} className="admin-input" placeholder="Mot de passe" autoFocus />
            {error && <p className="admin-error">{error}</p>}
            <button className="admin-login-btn" onClick={handleLogin}><Unlock size={15} /><span>Deverrouiller</span></button>
          </div>
        )}
        {authed && (
          <div className="admin-body">
            <div className="admin-form">
              <p className="admin-form-title">Ajouter un produit</p>
              <div className="admin-form-grid">
                <input className="admin-input" placeholder="Nom du produit" value={form.name} onChange={function (e) { setForm(Object.assign({}, form, { name: e.target.value })); }} />
                <select className="admin-input" value={form.category} onChange={function (e) { setForm(Object.assign({}, form, { category: e.target.value })); }}>
                  {CATEGORIES.map(function (c) { return <option key={c.id} value={c.id}>{c.label}</option>; })}
                </select>
                <input className="admin-input" type="number" placeholder="Prix affiche (FCFA)" value={form.price} onChange={function (e) { setForm(Object.assign({}, form, { price: e.target.value })); }} />
                <input className="admin-input" type="number" placeholder="Prix minimum negociable (FCFA)" value={form.minPrice} onChange={function (e) { setForm(Object.assign({}, form, { minPrice: e.target.value })); }} />
                <input className="admin-input" type="number" placeholder="Stock" value={form.stock} onChange={function (e) { setForm(Object.assign({}, form, { stock: e.target.value })); }} />
                <input className="admin-input" placeholder="Description courte" value={form.desc} onChange={function (e) { setForm(Object.assign({}, form, { desc: e.target.value })); }} />
              </div>
              <button className="admin-add-btn" onClick={handleAdd}><Plus size={15} /><span>Ajouter le produit</span></button>
            </div>
            <div className="admin-list">
              <p className="admin-form-title">Produits ({products.length})</p>
              {products.map(function (p) {
                return (
                  <div key={p.id} className="admin-list-row">
                    <div><p className="admin-list-name">{p.name}</p><p className="admin-list-meta">{fmt(p.price)} - min {fmt(p.minPrice)} - stock {p.stock}</p></div>
                    <button className="admin-list-delete" onClick={function () { handleDelete(p.id); }} aria-label="Supprimer"><Trash2 size={15} /></button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const productsHook = useProducts();
  const products = productsHook.products, setProducts = productsHook.setProducts, loading = productsHook.loading, error = productsHook.error;
  const [activeCategory, setActiveCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [negotiatingProduct, setNegotiatingProduct] = useState(null);
  const [adminOpen, setAdminOpen] = useState(false);

  const filtered = useMemo(function () {
    return products.filter(function (p) {
      const matchCat = activeCategory === "all" || p.category === activeCategory;
      const matchQuery = p.name.toLowerCase().indexOf(query.toLowerCase()) !== -1;
      return matchCat && matchQuery;
    });
  }, [products, activeCategory, query]);

  return (
    <div className="shop-root">
      <header className="shop-header">
        <div className="shop-header-top">
          <div className="shop-brand">
            <ShoppingBag size={22} />
            <div><p className="shop-brand-name">Bamako Marche</p><p className="shop-brand-tag">Informatique - Habits - Materiel industriel</p></div>
          </div>
          <button className="shop-admin-btn" onClick={function () { setAdminOpen(true); }}><Lock size={14} /><span>Admin</span></button>
        </div>
        <div className="shop-search-row">
          <Search size={16} className="shop-search-icon" />
          <input type="text" placeholder="Rechercher un produit..." value={query} onChange={function (e) { setQuery(e.target.value); }} className="shop-search-input" />
        </div>
        <div className="shop-cats">
          <button className={"shop-cat-chip" + (activeCategory === "all" ? " is-active" : "")} onClick={function () { setActiveCategory("all"); }}>Tous</button>
          {CATEGORIES.map(function (c) {
            const Icon = c.icon;
            return (
              <button key={c.id} className={"shop-cat-chip" + (activeCategory === c.id ? " is-active" : "")} onClick={function () { setActiveCategory(c.id); }}>
                <Icon size={14} /><span>{c.label}</span>
              </button>
            );
          })}
        </div>
      </header>
      <main className="shop-grid">
        {loading && (<div className="shop-empty"><Loader2 size={28} strokeWidth={1.5} className="shop-spin" /><p>Chargement des produits...</p></div>)}
        {!loading && error && (<div className="shop-empty"><Package size={28} strokeWidth={1.5} /><p>Connexion a la base impossible : {error}</p></div>)}
        {!loading && !error && filtered.length === 0 && (<div className="shop-empty"><Package size={28} strokeWidth={1.5} /><p>Aucun produit trouve pour cette recherche.</p></div>)}
        {!loading && !error && filtered.length > 0 && filtered.map(function (p) { return <ProductCard key={p.id} product={p} onNegotiate={setNegotiatingProduct} />; })}
      </main>
      {negotiatingProduct && (<NegotiationChat product={negotiatingProduct} onClose={function () { setNegotiatingProduct(null); }} />)}
      {adminOpen && (<AdminPanel products={products} setProducts={setProducts} onClose={function () { setAdminOpen(false); }} />)}
      <style>{"\n:root{--sand:#F7F1E8;--ink:#1C2B28;--terracotta:#C2562E;--sahel-green:#3C6E47;--gold:#D9A441;--line:#E4D9C6;--card:#FFFFFF;}\n*{box-sizing:border-box;}\n.shop-root{font-family:'Inter',-apple-system,sans-serif;background:var(--sand);color:var(--ink);min-height:100vh;padding-bottom:40px;}\n.shop-header{background:var(--ink);color:var(--sand);padding:20px 20px 16px;position:sticky;top:0;z-index:10;}\n.shop-header-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;}\n.shop-brand{display:flex;align-items:center;gap:10px;}\n.shop-brand-name{font-family:'Georgia',serif;font-size:19px;font-weight:700;letter-spacing:0.3px;margin:0;}\n.shop-brand-tag{font-size:11px;opacity:0.65;margin:2px 0 0;}\n.shop-admin-btn{display:flex;align-items:center;gap:6px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.18);color:var(--sand);padding:7px 12px;border-radius:8px;font-size:12px;cursor:pointer;}\n.shop-admin-btn:hover{background:rgba(255,255,255,0.15);}\n.shop-search-row{position:relative;margin-bottom:14px;}\n.shop-search-icon{position:absolute;left:12px;top:50%;transform:translateY(-50%);opacity:0.5;}\n.shop-search-input{width:100%;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:var(--sand);padding:10px 12px 10px 36px;border-radius:10px;font-size:14px;outline:none;}\n.shop-search-input::placeholder{color:rgba(247,241,232,0.45);}\n.shop-search-input:focus{border-color:var(--gold);}\n.shop-cats{display:flex;gap:8px;overflow-x:auto;padding-bottom:2px;}\n.shop-cat-chip{display:flex;align-items:center;gap:6px;white-space:nowrap;background:transparent;border:1px solid rgba(255,255,255,0.2);color:var(--sand);padding:7px 14px;border-radius:20px;font-size:12.5px;cursor:pointer;transition:all 0.15s;}\n.shop-cat-chip.is-active{background:var(--gold);border-color:var(--gold);color:var(--ink);font-weight:600;}\n.shop-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px;padding:20px;max-width:1100px;margin:0 auto;}\n.shop-empty{grid-column:1/-1;display:flex;flex-direction:column;align-items:center;gap:10px;padding:60px 0;opacity:0.55;}\n.shop-spin{animation:spin 1s linear infinite;}\n@keyframes spin{from{transform:rotate(0deg);}to{transform:rotate(360deg);}}\n.product-card{background:var(--card);border:1px solid var(--line);border-radius:14px;overflow:hidden;display:flex;flex-direction:column;transition:transform 0.15s,box-shadow 0.15s;}\n.product-card:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(28,43,40,0.08);}\n.product-card-media{height:110px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,var(--sand),#EFE6D4);color:var(--terracotta);}\n.product-card-body{padding:14px 16px 16px;display:flex;flex-direction:column;gap:6px;}\n.product-card-cat{font-size:10.5px;text-transform:uppercase;letter-spacing:0.5px;color:var(--sahel-green);font-weight:700;}\n.product-card-name{font-size:15px;font-weight:700;margin:0;line-height:1.3;}\n.product-card-desc{font-size:12.5px;opacity:0.65;margin:0;line-height:1.4;min-height:34px;}\n.product-card-footer{display:flex;align-items:center;justify-content:space-between;margin-top:4px;}\n.product-card-price{font-size:16px;font-weight:800;color:var(--terracotta);}\n.product-card-stock{font-size:11px;color:var(--sahel-green);font-weight:600;}\n.product-card-stock.is-low{color:var(--terracotta);}\n.product-card-cta{margin-top:8px;display:flex;align-items:center;justify-content:center;gap:6px;background:var(--ink);color:var(--sand);border:none;padding:10px;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer;transition:background 0.15s;}\n.product-card-cta:hover{background:#0f1916;}\n.product-card-cta:disabled{background:#ccc;cursor:not-allowed;}\n.negchat-overlay{position:fixed;inset:0;background:rgba(28,43,40,0.55);display:flex;align-items:flex-end;justify-content:center;z-index:50;padding:0;}\n@media (min-width:640px){.negchat-overlay{align-items:center;padding:20px;}}\n.negchat-panel{background:var(--card);width:100%;max-width:420px;border-radius:18px 18px 0 0;display:flex;flex-direction:column;max-height:85vh;overflow:hidden;}\n@media (min-width:640px){.negchat-panel{border-radius:18px;max-height:600px;}}\n.negchat-header{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:var(--ink);color:var(--sand);}\n.negchat-header-info{display:flex;align-items:center;gap:10px;}\n.negchat-title{font-size:11px;opacity:0.7;margin:0;text-transform:uppercase;letter-spacing:0.4px;}\n.negchat-subtitle{font-size:13.5px;font-weight:700;margin:1px 0 0;}\n.negchat-close{background:rgba(255,255,255,0.1);border:none;color:var(--sand);width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer;}\n.negchat-price-bar{display:flex;justify-content:space-between;align-items:center;padding:10px 16px;background:var(--sand);font-size:12.5px;border-bottom:1px solid var(--line);}\n.negchat-price-bar strong{color:var(--terracotta);font-size:14px;}\n.negchat-messages{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;}\n.negchat-bubble{max-width:82%;padding:10px 13px;border-radius:13px;font-size:13.5px;line-height:1.45;}\n.negchat-bubble--bot{background:#EFE6D4;color:var(--ink);align-self:flex-start;border-bottom-left-radius:4px;}\n.negchat-bubble--user{background:var(--sahel-green);color:white;align-self:flex-end;border-bottom-right-radius:4px;}\n.negchat-input-row{display:flex;gap:8px;padding:12px 14px;border-top:1px solid var(--line);}\n.negchat-input{flex:1;border:1px solid var(--line);border-radius:10px;padding:10px 12px;font-size:13.5px;outline:none;}\n.negchat-input:focus{border-color:var(--gold);}\n.negchat-send{width:42px;background:var(--terracotta);border:none;border-radius:10px;color:white;display:flex;align-items:center;justify-content:center;cursor:pointer;}\n.negchat-send:hover{background:#a8481f;}\n.negchat-confirm{padding:16px;border-top:1px solid var(--line);display:flex;flex-direction:column;gap:10px;}\n.negchat-confirm-price{display:flex;align-items:center;gap:6px;font-size:13.5px;color:var(--sahel-green);font-weight:600;}\n.negchat-wa-btn{display:flex;align-items:center;justify-content:center;gap:6px;background:#25D366;color:white;text-decoration:none;padding:12px;border-radius:10px;font-size:14px;font-weight:700;}\n.negchat-wa-btn:hover{background:#1fb955;}\n.admin-overlay{position:fixed;inset:0;background:rgba(28,43,40,0.6);display:flex;align-items:center;justify-content:center;z-index:60;padding:16px;}\n.admin-panel{background:var(--card);width:100%;max-width:520px;border-radius:16px;max-height:88vh;overflow-y:auto;}\n.admin-header{display:flex;align-items:center;justify-content:space-between;padding:16px 18px;background:var(--ink);color:var(--sand);position:sticky;top:0;}\n.admin-header-info{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:700;}\n.admin-login{padding:30px 24px;display:flex;flex-direction:column;gap:10px;}\n.admin-login-label{font-size:13px;opacity:0.7;margin:0 0 4px;}\n.admin-input{border:1px solid var(--line);border-radius:9px;padding:10px 12px;font-size:13.5px;outline:none;width:100%;}\n.admin-input:focus{border-color:var(--gold);}\n.admin-error{color:var(--terracotta);font-size:12.5px;margin:0;}\n.admin-login-btn,.admin-add-btn{display:flex;align-items:center;justify-content:center;gap:6px;background:var(--sahel-green);color:white;border:none;padding:11px;border-radius:9px;font-size:13.5px;font-weight:600;cursor:pointer;margin-top:4px;}\n.admin-login-btn:hover,.admin-add-btn:hover{background:#2f5a39;}\n.admin-body{padding:18px;display:flex;flex-direction:column;gap:22px;}\n.admin-form-title{font-size:12px;text-transform:uppercase;letter-spacing:0.4px;font-weight:700;opacity:0.6;margin:0 0 10px;}\n.admin-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;}\n.admin-form-grid input:first-child,.admin-form-grid input:last-child{grid-column:1/-1;}\n.admin-list{display:flex;flex-direction:column;gap:8px;}\n.admin-list-row{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:var(--sand);border-radius:9px;}\n.admin-list-name{font-size:13px;font-weight:600;margin:0;}\n.admin-list-meta{font-size:11.5px;opacity:0.6;margin:2px 0 0;}\n.admin-list-delete{background:transparent;border:none;color:var(--terracotta);cursor:pointer;padding:6px;}\n"}</style>
    </div>
  );
}
