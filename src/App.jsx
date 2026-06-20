import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import {
  Search,
  Plus,
  Trash2,
  Lock,
  Unlock,
  Send,
  X,
  MessageCircle,
  Package,
  Shirt,
  Wrench,
  Laptop,
  ChevronRight,
  Check,
  ShoppingBag,
  Loader2,
} from "lucide-react";

const SUPABASE_URL = "https://prqsngajfwwekrpgpose.supabase.co";
const SUPABASE_KEY = "sb_publishable_h_QCXrb4Mp1aLQGHSNrmUA_ewPECzlN";

const sbHeaders = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
};

async function sbSelect(table, query = "") {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: sbHeaders,
  });
  if (!res.ok) throw new Error(`Erreur lecture ${table} (${res.status})`);
  return res.json();
}

async function sbInsert(table, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...sbHeaders, Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Erreur insertion ${table} (${res.status})`);
  return res.json();
}

async function sbDelete(table, id) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: "DELETE",
    headers: sbHeaders,
  });
  if (!res.ok) throw new Error(`Erreur suppression ${table} (${res.status})`);
}

const CATEGORIES = [
  { id: "info", label: "Informatique", icon: Laptop },
  { id: "habits", label: "Habits", icon: Shirt },
  { id: "industriel", label: "Matériel industriel", icon: Wrench },
];

const WHATSAPP_NUMBER = "22300000000";

const fmt = (n) =>
  new Intl.NumberFormat("fr-FR").format(Math.round(n)) + " FCFA";

function rowToProduct(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    price: Number(row.price),
    minPrice: Number(row.min_price),
    stock: row.stock,
    desc: row.description || "",
  };
}

function useProducts() {
  const [products, setProductsState] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await sbSelect("products", "select=*&order=created_at.desc");
      setProductsState(data.map(rowToProduct));
      setError(null);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const setProducts = useCallback(
    async (updater) => {
      const current = products;
      const next = typeof updater === "function" ? updater(current) : updater;

      const currentIds = new Set(current.map((p) => p.id));
      const nextIds = new Set(next.map((p) => p.id));

      const added = next.filter((p) => !currentIds.has(p.id));
      const removed = current.filter((p) => !nextIds.has(p.id));

      try {
        for (const p of added) {
          await sbInsert("products", {
            name: p.name,
            category: p.category,
            price: p.price,
            min_price: p.minPrice,
            stock: p.stock,
            description: p.desc,
          });
        }
        for (const p of removed) {
          await sbDelete("products", p.id);
        }
      } catch (e) {
        setError(e.message);
      }

      await fetchProducts();
    },
    [products, fetchProducts]
  );

  return { products, setProducts, loading, error, refetch: fetchProducts };
}

async function logNegotiation({ product, agreedPrice, status }) {
  try {
    await sbInsert("negotiations", {
      product_id: product.id,
      product_name: product.name,
      displayed_price: product.price,
      agreed_price: agreedPrice,
      status,
    });
  } catch (e) {
    console.error("Erreur enregistrement négociation:", e);
  }
}

function buildWaLink(product, agreedPrice) {
  const msg = `Bonjour, je suis intéressé par : ${product.name}\nPrix proposé en discussion: ${fmt(
    product.price
  )}\nPrix négocié: ${fmt(agreedPrice)}\nMerci de confirmer la disponibilité.`;
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
}
function NegotiationChat({ product, onClose }) {
  const [messages, setMessages] = useState([
    {
      from: "bot",
      text: `Bonjour ! Vous négociez pour "${product.name}", affiché à ${fmt(
        product.price
      )}. Proposez votre prix, je fais de mon mieux pour vous satisfaire 🙂`,
    },
  ]);
  const [input, setInput] = useState("");
  const [agreedPrice, setAgreedPrice] = useState(null);
  const [roundCount, setRoundCount] = useState(0);
  const [closed, setClosed] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const push = (from, text) =>
    setMessages((m) => [...m, { from, text }]);

  const handleOffer = (offerRaw) => {
    const offer = Number(String(offerRaw).replace(/[^\d]/g, ""));
    if (!offer || offer <= 0) {
      push("bot", "Je n'ai pas compris le montant. Indiquez un chiffre, par exemple 30000.");
      return;
    }

    const { price, minPrice } = product;

    if (offer >= price) {
      setAgreedPrice(price);
      setClosed(true);
      logNegotiation({ product, agreedPrice: price, status: "conclu" });
      push(
        "bot",
        `Parfait, ${fmt(price)} c'est notre prix affiché — marché conclu ! Cliquez ci-dessous pour confirmer sur WhatsApp.`
      );
      return;
    }

    if (offer < minPrice) {
      const round = roundCount + 1;
      setRoundCount(round);
      if (round >= 3) {
        push(
          "bot",
          `Je comprends, mais je ne peux vraiment pas descendre plus bas que ${fmt(
            minPrice
          )} pour cet article. C'est ma dernière offre — vous voulez conclure à ce prix ?`
        );
      } else {
        push(
          "bot",
          `Ce prix est un peu trop bas pour moi. Je peux descendre jusqu'à ${fmt(
            minPrice
          )} maximum. Voulez-vous proposer un montant entre ${fmt(
            minPrice
          )} et ${fmt(price)} ?`
        );
      }
      return;
    }

    const mid = Math.round((offer + price) / 2 / 500) * 500;
    if (offer >= minPrice * 1.04 || roundCount >= 1) {
      setAgreedPrice(offer);
      setClosed(true);
      logNegotiation({ product, agreedPrice: offer, status: "conclu" });
      push(
        "bot",
        `Marché conclu à ${fmt(offer)} ! C'est un bon prix. Cliquez ci-dessous pour confirmer la commande sur WhatsApp.`
      );
    } else {
      setRoundCount((r) => r + 1);
      push(
        "bot",
        `Je vous propose plutôt ${fmt(
          mid
        )}. C'est un bon compromis. Ça vous convient ?`
      );
    }
  };

  const handleSend = () => {
    if (!input.trim() || closed) return;
    push("user", input);
    const text = input;
    setInput("");
    setTimeout(() => handleOffer(text), 350);
  };

  const handleAcceptLastOffer = (value) => {
    setAgreedPrice(value);
    setClosed(true);
    logNegotiation({ product, agreedPrice: value, status: "conclu" });
    push("user", "J'accepte ce prix.");
    push("bot", "Très bien, marché conclu ! Confirmez sur WhatsApp ci-dessous.");
  };

  return (
    <div className="negchat-overlay" role="dialog" aria-modal="true">
      <div className="negchat-panel">
        <div className="negchat-header">
          <div className="negchat-header-info">
            <MessageCircle size={18} />
            <div>
              <p className="negchat-title">Négociation</p>
              <p className="negchat-subtitle">{product.name}</p>
            </div>
          </div>
          <button className="negchat-close" onClick={onClose} aria-label="Fermer">
            <X size={18} />
          </button>
        </div>

        <div className="negchat-price-bar">
          <span>Prix affiché</span>
          <strong>{fmt(product.price)}</strong>
        </div>

        <div className="negchat-messages">
          {messages.map((m, i) => (
            <div key={i} className={`negchat-bubble negchat-bubble--${m.from}`}>
              {m.text}
            </div>
          ))}
          <div ref={endRef} />
        </div>

        {!closed ? (
          <div className="negchat-input-row">
            <input
              type="text"
              inputMode="numeric"
              placeholder="Votre prix en FCFA, ex: 30000"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              className="negchat-input"
            />
            <button className="negchat-send" onClick={handleSend} aria-label="Envoyer">
              <Send size={16} />
            </button>
          </div>
        ) : (
          <div className="negchat-confirm">
            <div className="negchat-confirm-price">
              <Check size={16} />
              Prix convenu : <strong>{fmt(agreedPrice)}</strong>
            </div>
            
              href={buildWaLink(product, agreedPrice)}
              target="_blank"
              rel="noopener noreferrer"
              className="negchat-wa-btn"
            >
              Confirmer sur WhatsApp
              <ChevronRight size={16} />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

function ProductCard({ product, onNegotiate }) {
  const catIcon = CATEGORIES.find((c) => c.id === product.category)?.icon || Package;
  const Icon = catIcon;
  const lowStock = product.stock <= 3;

  return (
    <div className="product-card">
      <div className="product-card-media">
        <Icon size={34} strokeWidth={1.5} />
      </div>
      <div className="product-card-body">
        <span className="product-card-cat">
          {CATEGORIES.find((c) => c.id === product.category)?.label}
        </span>
        <h3 className="product-card-name">{product.name}</h3>
        <p className="product-card-desc">{product.desc}</p>
        <div className="product-card-footer">
          <span className="product-card-price">{fmt(product.price)}</span>
          <span className={`product-card-stock ${lowStock ? "is-low" : ""}`}>
            {product.stock > 0 ? `${product.stock} en stock` : "Épuisé"}
          </span>
        </div>
        <button
          className="product-card-cta"
          onClick={() => onNegotiate(product)}
          disabled={product.stock === 0}
        >
          <MessageCircle size={15} />
          Négocier le prix
        </button>
      </div>
    </div>
  );
}
const ADMIN_PASSWORD = "mali2026";

function AdminPanel({ products, setProducts, onClose }) {
  const [authed, setAuthed] = useState(false);
  const [pwd, setPwd] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    category: "info",
    price: "",
    minPrice: "",
    stock: "",
    desc: "",
  });

  const handleLogin = () => {
    if (pwd === ADMIN_PASSWORD) {
      setAuthed(true);
      setError("");
    } else {
      setError("Mot de passe incorrect.");
    }
  };

  const handleAdd = () => {
    if (!form.name || !form.price || !form.minPrice) return;
    const newProduct = {
      id: "p" + Date.now(),
      name: form.name,
      category: form.category,
      price: Number(form.price),
      minPrice: Number(form.minPrice),
      stock: Number(form.stock) || 0,
      desc: form.desc,
    };
    setProducts((p) => [newProduct, ...p]);
    setForm({ name: "", category: "info", price: "", minPrice: "", stock: "", desc: "" });
  };

  const handleDelete = (id) => setProducts((p) => p.filter((x) => x.id !== id));

  return (
    <div className="admin-overlay" role="dialog" aria-modal="true">
      <div className="admin-panel">
        <div className="admin-header">
          <div className="admin-header-info">
            <Lock size={17} />
            <p>Espace administrateur</p>
          </div>
          <button className="negchat-close" onClick={onClose} aria-label="Fermer">
            <X size={18} />
          </button>
        </div>

        {!authed ? (
          <div className="admin-login">
            <p className="admin-login-label">Entrez le mot de passe admin</p>
            <input
              type="password"
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              className="admin-input"
              placeholder="Mot de passe"
              autoFocus
            />
            {error && <p className="admin-error">{error}</p>}
            <button className="admin-login-btn" onClick={handleLogin}>
              <Unlock size={15} />
              Déverrouiller
            </button>
          </div>
        ) : (
          <div className="admin-body">
            <div className="admin-form">
              <p className="admin-form-title">Ajouter un produit</p>
              <div className="admin-form-grid">
                <input
                  className="admin-input"
                  placeholder="Nom du produit"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
                <select
                  className="admin-input"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <input
                  className="admin-input"
                  type="number"
                  placeholder="Prix affiché (FCFA)"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                />
                <input
                  className="admin-input"
                  type="number"
                  placeholder="Prix minimum négociable (FCFA)"
                  value={form.minPrice}
                  onChange={(e) => setForm({ ...form, minPrice: e.target.value })}
                />
                <input
                  className="admin-input"
                  type="number"
                  placeholder="Stock"
                  value={form.stock}
                  onChange={(e) => setForm({ ...form, stock: e.target.value })}
                />
                <input
                  className="admin-input"
                  placeholder="Description courte"
                  value={form.desc}
                  onChange={(e) => setForm({ ...form, desc: e.target.value })}
                />
              </div>
              <button className="admin-add-btn" onClick={handleAdd}>
                <Plus size={15} />
                Ajouter le produit
              </button>
            </div>

            <div className="admin-list">
              <p className="admin-form-title">Produits ({products.length})</p>
              {products.map((p) => (
                <div key={p.id} className="admin-list-row">
                  <div>
                    <p className="admin-list-name">{p.name}</p>
                    <p className="admin-list-meta">
                      {fmt(p.price)} · min {fmt(p.minPrice)} · stock {p.stock}
                    </p>
                  </div>
                  <button
                    className="admin-list-delete"
                    onClick={() => handleDelete(p.id)}
                    aria-label="Supprimer"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const { products, setProducts, loading, error } = useProducts();
  const [activeCategory, setActiveCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [negotiatingProduct, setNegotiatingProduct] = useState(null);
  const [adminOpen, setAdminOpen] = useState(false);

  const filtered = useMemo(() => {
    return products.filter((p) => {
      const matchCat = activeCategory === "all" || p.category === activeCategory;
      const matchQuery = p.name.toLowerCase().includes(query.toLowerCase());
      return matchCat && matchQuery;
    });
  }, [products, activeCategory, query]);

  return (
    <div className="shop-root">
      <header className="shop-header">
        <div className="shop-header-top">
          <div className="shop-brand">
            <ShoppingBag size={22} />
            <div>
              <p className="shop-brand-name">Bamako Marché</p>
              <p className="shop-brand-tag">Informatique · Habits · Matériel industriel</p>
            </div>
          </div>
          <button className="shop-admin-btn" onClick={() => setAdminOpen(true)}>
            <Lock size={14} />
            Admin
          </button>
        </div>

        <div className="shop-search-row">
          <Search size={16} className="shop-search-icon" />
          <input
            type="text"
            placeholder="Rechercher un produit..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="shop-search-input"
          />
        </div>

        <div className="shop-cats">
          <button
            className={`shop-cat-chip ${activeCategory === "all" ? "is-active" : ""}`}
            onClick={() => setActiveCategory("all")}
          >
            Tous
          </button>
          {CATEGORIES.map((c) => {
            const Icon = c.icon;
            return (
              <button
                key={c.id}
                className={`shop-cat-chip ${activeCategory === c.id ? "is-active" : ""}`}
                onClick={() => setActiveCategory(c.id)}
              >
                <Icon size={14} />
                {c.label}
              </button>
            );
          })}
        </div>
      </header>

      <main className="shop-grid">
        {loading ? (
          <div className="shop-empty">
            <Loader2 size={28} strokeWidth={1.5} className="shop-spin" />
            <p>Chargement des produits...</p>
          </div>
        ) : error ? (
          <div className="shop-empty">
            <Package size={28} strokeWidth={1.5} />
            <p>Connexion à la base impossible : {error}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="shop-empty">
            <Package size={28} strokeWidth={1.5} />
            <p>Aucun produit trouvé pour cette recherche.</p>
          </div>
        ) : (
          filtered.map((p) => (
            <ProductCard key={p.id} product={p} onNegotiate={setNegotiatingProduct} />
          ))
        )}
      </main>

      {negotiatingProduct && (
        <NegotiationChat
          product={negotiatingProduct}
          onClose={() => setNegotiatingProduct(null)}
        />
      )}

      {adminOpen && (
        <AdminPanel
          products={products}
          setProducts={setProducts}
          onClose={() => setAdminOpen(false)}
        />
      )} 
      <style>{`
        :root {
          --sand: #F7F1E8;
          --ink: #1C2B28;
          --terracotta: #C2562E;
          --sahel-green: #3C6E47;
          --gold: #D9A441;
          --line: #E4D9C6;
          --card: #FFFFFF;
        }

        * { box-sizing: border-box; }

        .shop-root {
          font-family: 'Inter', -apple-system, sans-serif;
          background: var(--sand);
          color: var(--ink);
          min-height: 100vh;
          padding-bottom: 40px;
        }

        .shop-header {
          background: var(--ink);
          color: var(--sand);
          padding: 20px 20px 16px;
          position: sticky;
          top: 0;
          z-index: 10;
        }

        .shop-header-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
        }

        .shop-brand {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .shop-brand-name {
          font-family: 'Georgia', serif;
          font-size: 19px;
          font-weight: 700;
          letter-spacing: 0.3px;
          margin: 0;
        }

        .shop-brand-tag {
          font-size: 11px;
          opacity: 0.65;
          margin: 2px 0 0;
        }

        .shop-admin-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.18);
          color: var(--sand);
          padding: 7px 12px;
          border-radius: 8px;
          font-size: 12px;
          cursor: pointer;
        }
        .shop-admin-btn:hover { background: rgba(255,255,255,0.15); }

        .shop-search-row {
          position: relative;
          margin-bottom: 14px;
        }

        .shop-search-icon {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          opacity: 0.5;
        }

        .shop-search-input {
          width: 100%;
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.15);
          color: var(--sand);
          padding: 10px 12px 10px 36px;
          border-radius: 10px;
          font-size: 14px;
          outline: none;
        }
        .shop-search-input::placeholder { color: rgba(247,241,232,0.45); }
        .shop-search-input:focus { border-color: var(--gold); }

        .shop-cats {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          padding-bottom: 2px;
        }

        .shop-cat-chip {
          display: flex;
          align-items: center;
          gap: 6px;
          white-space: nowrap;
          background: transparent;
          border: 1px solid rgba(255,255,255,0.2);
          color: var(--sand);
          padding: 7px 14px;
          border-radius: 20px;
          font-size: 12.5px;
          cursor: pointer;
          transition: all 0.15s;
        }
        .shop-cat-chip.is-active {
          background: var(--gold);
          border-color: var(--gold);
          color: var(--ink);
          font-weight: 600;
        }

        .shop-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
          gap: 16px;
          padding: 20px;
          max-width: 1100px;
          margin: 0 auto;
        }

        .shop-empty {
          grid-column: 1 / -1;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          padding: 60px 0;
          opacity: 0.55;
        }

        .shop-spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .product-card {
          background: var(--card);
          border: 1px solid var(--line);
          border-radius: 14px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          transition: transform 0.15s, box-shadow 0.15s;
        }
        .product-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(28,43,40,0.08);
        }

        .product-card-media {
          height: 110px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, var(--sand), #EFE6D4);
          color: var(--terracotta);
        }

        .product-card-body {
          padding: 14px 16px 16px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .product-card-cat {
          font-size: 10.5px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: var(--sahel-green);
          font-weight: 700;
        }

        .product-card-name {
          font-size: 15px;
          font-weight: 700;
          margin: 0;
          line-height: 1.3;
        }

        .product-card-desc {
          font-size: 12.5px;
          opacity: 0.65;
          margin: 0;
          line-height: 1.4;
          min-height: 34px;
        }

        .product-card-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: 4px;
        }

        .product-card-price {
          font-size: 16px;
          font-weight: 800;
          color: var(--terracotta);
        }

        .product-card-stock {
          font-size: 11px;
          color: var(--sahel-green);
          font-weight: 600;
        }
        .product-card-stock.is-low { color: var(--terracotta); }

        .product-card-cta {
          margin-top: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          background: var(--ink);
          color: var(--sand);
          border: none;
          padding: 10px;
          border-radius: 9px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s;
        }
        .product-card-cta:hover { background: #0f1916; }
        .product-card-cta:disabled {
          background: #ccc;
          cursor: not-allowed;
        }

        .negchat-overlay {
          position: fixed;
          inset: 0;
          background: rgba(28,43,40,0.55);
          display: flex;
          align-items: flex-end;
          justify-content: center;
          z-index: 50;
          padding: 0;
        }
        @media (min-width: 640px) {
          .negchat-overlay { align-items: center; padding: 20px; }
        }

        .negchat-panel {
          background: var(--card);
          width: 100%;
          max-width: 420px;
          border-radius: 18px 18px 0 0;
          display: flex;
          flex-direction: column;
          max-height: 85vh;
          overflow: hidden;
        }
        @media (min-width: 640px) {
          .negchat-panel { border-radius: 18px; max-height: 600px; }
        }

        .negchat-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 16px;
          background: var(--ink);
          color: var(--sand);
        }

        .negchat-header-info {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .negchat-title {
          font-size: 11px;
          opacity: 0.7;
          margin: 0;
          text-transform: uppercase;
          letter-spacing: 0.4px;
        }
        .negchat-subtitle {
          font-size: 13.5px;
          font-weight: 700;
          margin: 1px 0 0;
        }

        .negchat-close {
          background: rgba(255,255,255,0.1);
          border: none;
          color: var(--sand);
          width: 30px;
          height: 30px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }

        .negchat-price-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 16px;
          background: var(--sand);
          font-size: 12.5px;
          border-bottom: 1px solid var(--line);
        }
        .negchat-price-bar strong { color: var(--terracotta); font-size: 14px; }

        .negchat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .negchat-bubble {
          max-width: 82%;
          padding: 10px 13px;
          border-radius: 13px;
          font-size: 13.5px;
          line-height: 1.45;
        }
        .negchat-bubble--bot {
          background: #EFE6D4;
          color: var(--ink);
          align-self: flex-start;
          border-bottom-left-radius: 4px;
        }
        .negchat-bubble--user {
          background: var(--sahel-green);
          color: white;
          align-self: flex-end;
          border-bottom-right-radius: 4px;
        }

        .negchat-input-row {
          display: flex;
          gap: 8px;
          padding: 12px 14px;
          border-top: 1px solid var(--line);
        }

        .negchat-input {
          flex: 1;
          border: 1px solid var(--line);
          border-radius: 10px;
          padding: 10px 12px;
          font-size: 13.5px;
          outline: none;
        }
        .negchat-input:focus { border-color: var(--gold); }

        .negchat-send {
          width: 42px;
          background: var(--terracotta);
          border: none;
          border-radius: 10px;
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .negchat-send:hover { background: #a8481f; }

        .negchat-confirm {
          padding: 16px;
          border-top: 1px solid var(--line);
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .negchat-confirm-price {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13.5px;
          color: var(--sahel-green);
          font-weight: 600;
        }

        .negchat-wa-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          background: #25D366;
          color: white;
          text-decoration: none;
          padding: 12px;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 700;
        }
        .negchat-wa-btn:hover { background: #1fb955; }

        .admin-overlay {
          position: fixed;
          inset: 0;
          background: rgba(28,43,40,0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 60;
          padding: 16px;
        }

        .admin-panel {
          background: var(--card);
          width: 100%;
          max-width: 520px;
          border-radius: 16px;
          max-height: 88vh;
          overflow-y: auto;
        }

        .admin-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 18px;
          background: var(--ink);
          color: var(--sand);
          position: sticky;
          top: 0;
        }

        .admin-header-info {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          font-weight: 700;
        }

        .admin-login {
          padding: 30px 24px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .admin-login-label {
          font-size: 13px;
          opacity: 0.7;
          margin: 0 0 4px;
        }

        .admin-input {
          border: 1px solid var(--line);
          border-radius: 9px;
          padding: 10px 12px;
          font-size: 13.5px;
          outline: none;
          width: 100%;
        }
        .admin-input:focus { border-color: var(--gold); }

        .admin-error {
          color: var(--terracotta);
          font-size: 12.5px;
          margin: 0;
        }

        .admin-login-btn, .admin-add-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          background: var(--sahel-green);
          color: white;
          border: none;
          padding: 11px;
          border-radius: 9px;
          font-size: 13.5px;
          font-weight: 600;
          cursor: pointer;
          margin-top: 4px;
        }
        .admin-login-btn:hover, .admin-add-btn:hover { background: #2f5a39; }

        .admin-body {
          padding: 18px;
          display: flex;
          flex-direction: column;
          gap: 22px;
        }

        .admin-form-title {
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.4px;
          font-weight: 700;
          opacity: 0.6;
          margin: 0 0 10px;
        }

        .admin-form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          margin-bottom: 10px;
        }
        .admin-form-grid input:first-child,
        .admin-form-grid input:last-child {
          grid-column: 1 / -1;
        }

        .admin-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .admin-list-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 12px;
          background: var(--sand);
          border-radius: 9px;
        }

        .admin-list-name {
          font-size: 13px;
          font-weight: 600;
          margin: 0;
        }

        .admin-list-meta {
          font-size: 11.5px;
          opacity: 0.6;
          margin: 2px 0 0;
        }

        .admin-list-delete {
          background: transparent;
          border: none;
          color: var(--terracotta);
          cursor: pointer;
          padding: 6px;
        }
      `}</style>
    </div>
  );
}
