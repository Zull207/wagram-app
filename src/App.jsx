import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import { Html5Qrcode } from "html5-qrcode";
import { QRCodeSVG } from "qrcode.react";
import {
  ArrowLeft,
  AtSign,
  BadgeCheck,
  Camera,
  CheckCheck,
  ChevronDown,
  History,
  Image as ImageIcon,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Mail,
  MessageCircle,
  MessagesSquare,
  Moon,
  Plus,
  QrCode,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sun,
  Trash2,
  User,
  UserPlus,
  Users,
  X,
  Zap,
} from "lucide-react";

// ------------------------------------------------------------------
// PRODUCTION NETWORKING — tanpa hardcoded localhost.
// Isi VITE_SERVER_URL di hosting/APK build, mis. https://wagram.onrender.com
// ------------------------------------------------------------------
const SERVER_URL = import.meta.env.VITE_SERVER_URL || window.location.origin;
const socket = io(SERVER_URL, { autoConnect: true });

const ACC_KEY = "wagram_accounts_v1";

// ---------- helpers ----------
const loadAccounts = () => {
  try {
    return JSON.parse(localStorage.getItem(ACC_KEY) || "[]");
  } catch {
    return [];
  }
};

async function api(path, opts = {}) {
  const r = await fetch(`${SERVER_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "Request gagal. Coba lagi.");
  return data;
}

const fmtTime = (iso) => {
  try {
    return new Date(iso).toLocaleString("id-ID", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
};

function App() {
  // ---------- session & multi-akun ----------
  const [user, setUser] = useState(null);
  const [accounts, setAccounts] = useState(loadAccounts);
  const [showAccMenu, setShowAccMenu] = useState(false);
  const [serverOk, setServerOk] = useState(null);
  const [onlineCount, setOnlineCount] = useState(0);

  // ---------- auth form ----------
  const [authMode, setAuthMode] = useState("login"); // login | register
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [authErr, setAuthErr] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // ---------- app nav ----------
  const [tab, setTab] = useState("chat"); // chat | status | tambah | pengaturan
  const [theme, setTheme] = useState("light");

  // ---------- chat ----------
  const [inbox, setInbox] = useState([]);
  const [activeContact, setActiveContact] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [pesan, setPesan] = useState("");
  const activeRoomRef = useRef(null);
  const chatBottomRef = useRef(null);

  // ---------- status ----------
  const [feed, setFeed] = useState([]);
  const [statusText, setStatusText] = useState("");
  const [statusImg, setStatusImg] = useState("");

  // ---------- tambah kontak ----------
  const [addMode, setAddMode] = useState("search"); // search | scan | myqr
  const [search, setSearch] = useState("");
  const [searchRes, setSearchRes] = useState(null);
  const [searchMsg, setSearchMsg] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState("");
  const [camErr, setCamErr] = useState("");
  const [manualQR, setManualQR] = useState("");
  const scannerRef = useRef(null);
  const scanHandledRef = useRef(false);

  const activeRoom = useMemo(() => activeRoomRef.current, [activeContact]);
  const myQR = user?.qr || "";

  // ================= THEME =================
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  // ================= SERVER HEALTH =================
  useEffect(() => {
    fetch(`${SERVER_URL}/health`)
      .then((r) => setServerOk(r.ok))
      .catch(() => setServerOk(false));
  }, []);

  const persistAccounts = (list) => {
    setAccounts(list);
    localStorage.setItem(ACC_KEY, JSON.stringify(list));
  };

  const rememberAccount = (profile, creds) => {
    const list = loadAccounts().filter((a) => a.email !== creds.email);
    list.unshift({ ...creds, profile });
    persistAccounts(list.slice(0, 5)); // max 5 akun tersimpan
  };

  // ================= DATA LOADERS =================
  const loadInbox = useCallback(async (uid) => {
    try {
      const { inbox: rows } = await api(`/api/inbox/${uid}`);
      setInbox(rows);
      rows.forEach((r) => socket.emit("join_room", r.room));
    } catch (e) {
      console.warn("inbox gagal:", e.message);
    }
  }, []);

  const loadFeed = useCallback(async (uid) => {
    try {
      const { feed: rows } = await api(`/api/feed/${uid}`);
      setFeed(rows);
    } catch (e) {
      console.warn("feed gagal:", e.message);
    }
  }, []);

  // Socket session init tiap login / ganti akun
  useEffect(() => {
    if (!user) return;
    socket.emit("user_online", { userId: user.id, username: user.username });
    loadInbox(user.id);
    loadFeed(user.id);
  }, [user, loadInbox, loadFeed]);

  // ================= SOCKET LISTENERS =================
  useEffect(() => {
    const onPesan = (m) => {
      if (m.room && m.room === activeRoomRef.current) {
        setMsgs((p) => [...p, m]);
      }
      setInbox((prev) =>
        prev.map((row) => (row.room === m.room ? { ...row, last: m } : row))
      );
    };
    const onKontak = () => {
      if (user) {
        loadInbox(user.id);
        loadFeed(user.id);
      }
    };
    const onStatus = () => {
      if (user) loadFeed(user.id);
    };
    const onOnline = (list) => setOnlineCount(list.length);
    socket.on("terima_pesan", onPesan);
    socket.on("kontak_baru", onKontak);
    socket.on("status_baru", onStatus);
    socket.on("online_list", onOnline);
    return () => {
      socket.off("terima_pesan", onPesan);
      socket.off("kontak_baru", onKontak);
      socket.off("status_baru", onStatus);
      socket.off("online_list", onOnline);
    };
  }, [user, loadInbox, loadFeed]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, activeContact]);

  // Stop kamera saat pindah tab / unmount
  const stopScan = useCallback(async () => {
    try {
      const s = scannerRef.current;
      if (s) {
        await s.stop().catch(() => {});
        try {
          s.clear();
        } catch {
          /* abaikan */
        }
      }
    } finally {
      scannerRef.current = null;
      setScanning(false);
    }
  }, []);

  useEffect(() => () => {
    try {
      scannerRef.current?.stop?.().catch(() => {});
    } catch {
      /* abaikan */
    }
  }, []);

  const goTab = (t) => {
    if (t !== "tambah") stopScan();
    setTab(t);
  };

  // ================= AUTH =================
  const validateAuth = () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      return "Format email tidak valid.";
    if (password.length < 6) return "Password minimal 6 karakter.";
    if (authMode === "register") {
      if (name.trim().length < 2) return "Display name minimal 2 karakter.";
      if (!/^@[a-z0-9_.]{2,19}$/i.test(username.trim()))
        return "Username harus diawali '@' (3-20 char, huruf/angka/._).";
    }
    return "";
  };

  const afterAuth = (profile, creds) => {
    rememberAccount(profile, creds);
    setUser(profile);
    setActiveContact(null);
    setMsgs([]);
    setTab("chat");
    setAuthErr("");
    setPassword("");
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    const v = validateAuth();
    if (v) return setAuthErr(v);
    setAuthLoading(true);
    setAuthErr("");
    try {
      const { user: profile } = await api("/api/login", {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), password }),
      });
      afterAuth(profile, { email: email.trim().toLowerCase(), password });
    } catch (err) {
      setAuthErr(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    const v = validateAuth();
    if (v) return setAuthErr(v);
    setAuthLoading(true);
    setAuthErr("");
    try {
      const { user: profile } = await api("/api/register", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim(),
          password,
          name: name.trim(),
          username: username.trim(),
        }),
      });
      afterAuth(profile, { email: email.trim().toLowerCase(), password });
    } catch (err) {
      setAuthErr(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const quickLogin = async (acc) => {
    setAuthErr("");
    setAuthLoading(true);
    try {
      const { user: profile } = await api("/api/login", {
        method: "POST",
        body: JSON.stringify({ email: acc.email, password: acc.password }),
      });
      afterAuth(profile, { email: acc.email, password: acc.password });
    } catch (err) {
      setAuthErr(`Gagal masuk sebagai ${acc.email}: ${err.message}`);
    } finally {
      setAuthLoading(false);
    }
  };

  const removeAccount = (em) =>
    persistAccounts(loadAccounts().filter((a) => a.email !== em));

  // ================= CHAT =================
  const openChat = async (contact) => {
    setActiveContact(contact);
    setTab("chat");
    const room = [user.id, contact.id].sort().join("__");
    const roomId = `dm:${room}`;
    activeRoomRef.current = roomId;
    socket.emit("join_room", roomId);
    try {
      const { messages } = await api(
        `/api/messages?room=${encodeURIComponent(roomId)}`
      );
      setMsgs(messages);
    } catch {
      setMsgs([]);
    }
  };

  const closeChat = () => {
    setActiveContact(null);
    setMsgs([]);
    activeRoomRef.current = null;
  };

  const kirimPesan = (e) => {
    e.preventDefault();
    if (!pesan.trim() || !user || !activeContact || !activeRoomRef.current)
      return;
    const dataPesan = {
      room: activeRoomRef.current,
      dari: user.id,
      dariNama: user.name,
      pengirim: user.name,
      ke: activeContact.id,
      teks: pesan.trim(),
      waktu: new Date().toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };
    socket.emit("kirim_pesan", dataPesan);
    setMsgs((p) => [...p, { ...dataPesan, id: `tmp-${Date.now()}` }]);
    setPesan("");
  };

  // ================= STATUS =================
  const postStatus = async (e) => {
    e.preventDefault();
    if (!statusText.trim() && !statusImg.trim()) return;
    try {
      const { status } = await api("/api/status", {
        method: "POST",
        body: JSON.stringify({
          userId: user.id,
          teks: statusText.trim(),
          imageUrl: statusImg.trim(),
        }),
      });
      socket.emit("status_baru", status);
      setFeed((p) => [status, ...p]);
      setStatusText("");
      setStatusImg("");
    } catch (err) {
      alert(err.message);
    }
  };

  // ================= TAMBAH KONTAK =================
  const addContactByTarget = async (target) => {
    const { contact, room } = await api("/api/contacts/add", {
      method: "POST",
      body: JSON.stringify({ userId: user.id, target }),
    });
    socket.emit("kontak_baru", { userId: user.id, targetId: contact.id });
    await loadInbox(user.id);
    await loadFeed(user.id);
    return { contact, room };
  };

  const cariUsername = async (e) => {
    e.preventDefault();
    setSearchMsg("");
    setSearchRes(null);
    const q = search.trim();
    if (!q) return;
    try {
      const { user: found } = await api(
        `/api/users/search?username=${encodeURIComponent(q)}`
      );
      setSearchRes(found);
    } catch (err) {
      setSearchMsg(err.message);
    }
  };

  const tambahDariHasil = async () => {
    if (!searchRes) return;
    try {
      const { contact } = await addContactByTarget(searchRes.username);
      setSearch("");
      setSearchRes(null);
      openChat(contact);
    } catch (err) {
      setSearchMsg(err.message);
    }
  };

  // ---------- REAL CAMERA SCANNER (html5-qrcode + WebRTC) ----------
  const onScanOK = async (decodedText) => {
    if (scanHandledRef.current) return;
    scanHandledRef.current = true;
    await stopScan();
    setScanMsg(`QR terbaca — menghubungkan…`);
    try {
      const { contact } = await addContactByTarget(decodedText.trim());
      setScanMsg(`Terhubung dengan ${contact.username}. Membuka chat…`);
      setTimeout(() => {
        setScanMsg("");
        openChat(contact);
      }, 700);
    } catch (err) {
      setScanMsg("");
      setCamErr(err.message);
    }
  };

  const startScan = () => {
    setCamErr("");
    setScanMsg("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamErr(
        "Perangkat ini tidak mendukung akses kamera (butuh HTTPS/localhost)."
      );
      return;
    }
    setScanning(true);
    // Tunggu viewport <div id="qr-reader"> ter-render dulu
    setTimeout(async () => {
      try {
        const s = new Html5Qrcode("qr-reader");
        scannerRef.current = s;
        scanHandledRef.current = false;
        await s.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decoded) => onScanOK(decoded),
          () => {}
        );
      } catch (err) {
        const msg = String(err?.message || err);
        setCamErr(
          /permission|denied|notallowed/i.test(msg)
            ? "Izin kamera ditolak. Aktifkan izin kamera untuk aplikasi/browser ini."
            : `Gagal membuka kamera: ${msg}`
        );
        setScanning(false);
      }
    }, 120);
  };

  const prosesManualQR = async (e) => {
    e.preventDefault();
    if (!manualQR.trim()) return;
    try {
      const { contact } = await addContactByTarget(manualQR.trim());
      setManualQR("");
      openChat(contact);
    } catch (err) {
      setCamErr(err.message);
    }
  };

  // ================================================================
  // PAGE 1 — PRE-LOGIN (Email & Password, tanpa pihak ketiga)
  // ================================================================
  if (!user) {
    const features = [
      { Icon: Zap, label: "Realtime" },
      { Icon: Users, label: "Kontak" },
      { Icon: ShieldCheck, label: "100% Lokal" },
    ];
    return (
      <div className="min-h-screen bg-stone-200 flex items-center justify-center p-4">
        <div className="max-w-md mx-auto min-h-[92vh] w-full shadow-2xl flex flex-col bg-white overflow-hidden rounded-3xl">
          <div className="relative bg-gradient-to-br from-[#075e54] via-[#00a884] to-[#6228d7] px-8 pt-10 pb-14 text-white overflow-hidden">
            <div className="absolute -top-10 -right-10 w-44 h-44 bg-white/20 rounded-full blur-2xl" />
            <div className="relative">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-white flex items-center justify-center shadow-lg">
                  <MessageCircle size={28} className="text-emerald-600" strokeWidth={2.2} />
                </div>
                <div>
                  <h1 className="text-2xl font-black tracking-tight leading-none">Wagram</h1>
                  <p className="text-xs font-medium text-white/80 tracking-widest uppercase mt-1">
                    WA + IG Hybrid
                  </p>
                </div>
              </div>
              <div className="flex justify-start gap-6 mt-5">
                {features.map(({ Icon, label }) => (
                  <div key={label} className="flex items-center gap-1.5 text-white/90">
                    <Icon size={15} />
                    <span className="text-[11px] font-semibold">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex-1 bg-white px-7 -mt-6 rounded-t-3xl relative py-6 overflow-y-auto nice-scroll">
            {/* Mode tabs */}
            <div className="grid grid-cols-2 bg-stone-100 rounded-full p-1 mb-5">
              {["login", "register"].map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    setAuthMode(m);
                    setAuthErr("");
                  }}
                  className={`py-2 rounded-full text-sm font-bold transition ${
                    authMode === m ? "bg-white shadow text-stone-900" : "text-stone-500"
                  }`}
                >
                  {m === "login" ? "Masuk" : "Daftar"}
                </button>
              ))}
            </div>

            <form onSubmit={authMode === "login" ? handleLogin : handleRegister} className="space-y-3">
              <label className="flex items-center gap-2 bg-stone-100 rounded-2xl px-3.5 py-3 focus-within:ring-2 focus-within:ring-emerald-500">
                <Mail size={17} className="text-stone-400 shrink-0" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  autoComplete="email"
                  className="bg-transparent flex-1 text-sm outline-none text-stone-800 placeholder:text-stone-400"
                />
              </label>
              <label className="flex items-center gap-2 bg-stone-100 rounded-2xl px-3.5 py-3 focus-within:ring-2 focus-within:ring-emerald-500">
                <KeyRound size={17} className="text-stone-400 shrink-0" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password (min. 6)"
                  autoComplete={authMode === "login" ? "current-password" : "new-password"}
                  className="bg-transparent flex-1 text-sm outline-none text-stone-800 placeholder:text-stone-400"
                />
              </label>
              {authMode === "register" && (
                <>
                  <label className="flex items-center gap-2 bg-stone-100 rounded-2xl px-3.5 py-3 focus-within:ring-2 focus-within:ring-emerald-500">
                    <User size={17} className="text-stone-400 shrink-0" />
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Display Name"
                      className="bg-transparent flex-1 text-sm outline-none text-stone-800 placeholder:text-stone-400"
                    />
                  </label>
                  <label className="flex items-center gap-2 bg-stone-100 rounded-2xl px-3.5 py-3 focus-within:ring-2 focus-within:ring-emerald-500">
                    <AtSign size={17} className="text-stone-400 shrink-0" />
                    <input
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="@username"
                      className="bg-transparent flex-1 text-sm outline-none text-stone-800 placeholder:text-stone-400"
                    />
                  </label>
                </>
              )}
              {authErr && (
                <p className="text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                  {authErr}
                </p>
              )}
              <button
                type="submit"
                disabled={authLoading}
                className="w-full bg-[#00a884] hover:bg-[#075e54] disabled:opacity-60 text-white font-bold py-3 rounded-full transition active:scale-[0.98] shadow-md text-sm"
              >
                {authLoading ? "Memproses…" : authMode === "login" ? "Masuk" : "Buat Akun"}
              </button>
            </form>

            {/* Multi-account quick switch */}
            {accounts.length > 0 && (
              <div className="mt-6">
                <p className="text-[11px] font-bold uppercase tracking-widest text-stone-400 mb-2">
                  Akun tersimpan
                </p>
                <div className="space-y-2">
                  {accounts.map((a) => (
                    <div
                      key={a.email}
                      className="flex items-center gap-2.5 bg-stone-50 border border-stone-200 rounded-2xl px-3 py-2"
                    >
                      <button onClick={() => quickLogin(a)} className="flex items-center gap-2.5 flex-1 min-w-0 text-left">
                        <span className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 text-white text-xs flex items-center justify-center font-bold shrink-0">
                          {(a.profile?.name || a.email).charAt(0).toUpperCase()}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-xs font-bold text-stone-800 truncate">
                            {a.profile?.name || a.email}
                          </span>
                          <span className="block text-[11px] text-stone-400 truncate">{a.email}</span>
                        </span>
                      </button>
                      <button
                        onClick={() => removeAccount(a.email)}
                        aria-label="Hapus akun tersimpan"
                        className="text-stone-300 hover:text-red-500 transition p-1"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="text-[11px] text-stone-400 text-center mt-5">
              Server: <code className="bg-stone-100 px-1.5 py-0.5 rounded">{SERVER_URL}</code>{" "}
              {serverOk === true && <span className="text-emerald-600 font-bold">• online</span>}
              {serverOk === false && <span className="text-red-500 font-bold">• offline</span>}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ================================================================
  // PAGE 2 — MAIN APP
  // ================================================================
  const tabs = [
    { id: "chat", label: "CHAT", Icon: MessageCircle },
    { id: "status", label: "STATUS", Icon: History },
    { id: "tambah", label: "TAMBAH", Icon: UserPlus },
    { id: "pengaturan", label: "PENGATURAN", Icon: Settings },
  ];

  return (
    <div className={`min-h-screen flex justify-center ${theme === "dark" ? "dark bg-stone-950" : "bg-stone-200"}`}>
      <div className="max-w-md mx-auto h-screen w-full shadow-2xl flex flex-col bg-white dark:bg-stone-900 overflow-hidden">
        {/* ---- Header ---- */}
        <header className="bg-white dark:bg-stone-900 border-b border-stone-200 dark:border-stone-800 px-4 pt-4 pb-3 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-xl font-black tracking-tight text-stone-900 dark:text-white">
              Wagram <span className="text-ig-gradient">•</span>{" "}
              <span className="text-xs font-semibold text-stone-400">hybrid</span>
            </h1>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
                aria-label="Ganti tema"
                className="w-8 h-8 rounded-full bg-stone-100 dark:bg-stone-800 flex items-center justify-center text-stone-600 dark:text-stone-300"
              >
                {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
              </button>
              {/* Profile pill + switch account */}
              <div className="relative">
                <button
                  onClick={() => setShowAccMenu((s) => !s)}
                  className="flex items-center gap-1.5 bg-stone-100 dark:bg-stone-800 rounded-full pl-1 pr-2 py-1"
                >
                  <img src={user.avatar} alt={user.name} className="w-7 h-7 rounded-full bg-white object-cover" />
                  <span className="text-xs font-semibold text-stone-700 dark:text-stone-200 max-w-[80px] truncate">
                    {user.name}
                  </span>
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" title="Online" />
                  <ChevronDown size={13} className="text-stone-400" />
                </button>
                {showAccMenu && (
                  <div className="absolute right-0 top-10 w-64 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-2xl shadow-xl p-2 z-30">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 px-2 py-1">
                      Ganti / Tambah Akun
                    </p>
                    {accounts
                      .filter((a) => a.email !== user.email)
                      .map((a) => (
                        <button
                          key={a.email}
                          onClick={() => {
                            setShowAccMenu(false);
                            quickLogin(a);
                          }}
                          className="w-full flex items-center gap-2 px-2 py-2 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-700 text-left"
                        >
                          <span className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 text-white text-[11px] flex items-center justify-center font-bold shrink-0">
                            {(a.profile?.name || a.email).charAt(0).toUpperCase()}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-xs font-bold text-stone-800 dark:text-stone-100 truncate">
                              {a.profile?.name || a.email}
                            </span>
                            <span className="block text-[10px] text-stone-400 truncate">
                              {a.profile?.username || a.email}
                            </span>
                          </span>
                        </button>
                      ))}
                    <button
                      onClick={() => {
                        setShowAccMenu(false);
                        setUser(null);
                        setActiveContact(null);
                        setAuthMode("register");
                      }}
                      className="w-full flex items-center gap-2 px-2 py-2 mt-1 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-xs font-bold"
                    >
                      <Plus size={14} /> Tambah Akun Baru
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between mt-2">
            <a
              href={`${SERVER_URL}/admin`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-full px-2.5 py-1 hover:bg-emerald-100 transition"
            >
              <LayoutDashboard size={12} />
              Admin Dashboard
            </a>
            <span className="text-[10px] text-stone-400 font-medium">
              {onlineCount} online
            </span>
          </div>
        </header>

        {/* ---- Nav Tabs ---- */}
        <nav className="bg-[#075e54] text-white flex text-center shrink-0">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => goTab(t.id)}
              className={`flex-1 py-3 text-[10px] font-bold tracking-widest border-b-4 transition ${
                tab === t.id ? "border-white text-white" : "border-transparent text-white/60 hover:text-white"
              }`}
            >
              <span className="inline-flex items-center gap-1 justify-center">
                <t.Icon size={13} />
                {t.label}
              </span>
            </button>
          ))}
        </nav>

        {/* ---- Content ---- */}
        <main className="flex-1 overflow-hidden flex flex-col min-h-0 bg-white dark:bg-stone-900">
          {/* ============ TAB CHAT ============ */}
          {tab === "chat" && !activeContact && (
            <div className="flex-1 overflow-y-auto nice-scroll">
              {inbox.length === 0 && (
                <div className="flex flex-col items-center text-center px-8 py-12">
                  <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center mb-3">
                    <MessagesSquare size={28} className="text-[#00a884]" />
                  </div>
                  <p className="text-sm font-bold text-stone-700 dark:text-stone-200">Belum ada kontak</p>
                  <p className="text-xs text-stone-400 mt-1">
                    Tambah teman via tab <b>TAMBAH</b> — cari @username atau scan QR kamera.
                  </p>
                  <button
                    onClick={() => goTab("tambah")}
                    className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-white bg-[#00a884] rounded-full px-4 py-2"
                  >
                    <UserPlus size={14} /> Tambah Kontak
                  </button>
                </div>
              )}
              {inbox.map(({ contact, last }) => (
                <button
                  key={contact.id}
                  onClick={() => openChat(contact)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-stone-50 dark:hover:bg-stone-800 border-b border-stone-100 dark:border-stone-800 text-left transition"
                >
                  <img src={contact.avatar} alt={contact.name} className="w-12 h-12 rounded-full bg-stone-100 object-cover shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-bold text-stone-800 dark:text-stone-100 truncate">
                        {contact.name}
                      </span>
                      {last && (
                        <span className="text-[10px] text-stone-400 shrink-0">{last.waktu}</span>
                      )}
                    </span>
                    <span className="block text-xs text-stone-500 dark:text-stone-400 truncate">
                      {last ? `${last.dari === user.id ? "Anda: " : ""}${last.teks}` : contact.username}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {tab === "chat" && activeContact && (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex items-center gap-2.5 bg-[#075e54] text-white px-2.5 py-2.5 shrink-0">
                <button onClick={closeChat} aria-label="Kembali" className="p-1.5 hover:bg-white/10 rounded-full">
                  <ArrowLeft size={19} />
                </button>
                <img src={activeContact.avatar} alt={activeContact.name} className="w-9 h-9 rounded-full bg-white/20 object-cover" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate">{activeContact.name}</p>
                  <p className="text-[11px] text-white/70 truncate">{activeContact.username} • online</p>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto nice-scroll chat-wallpaper px-3 py-4 space-y-2">
                {msgs.map((m, i) => {
                  const isMe = m.dari === user.id || m.pengirim === user.name;
                  return (
                    <div
                      key={m.id || i}
                      className={`max-w-[78%] px-3 py-2 rounded-2xl text-sm shadow-sm leading-relaxed ${
                        isMe
                          ? "ml-auto bg-[#d9fdd3] dark:bg-emerald-900 text-stone-800 dark:text-stone-100 rounded-br-md"
                          : "mr-auto bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-100 rounded-bl-md"
                      }`}
                    >
                      <p className="break-words">{m.teks}</p>
                      <p className="text-[10px] mt-1 text-right flex items-center justify-end gap-1 opacity-60">
                        {m.waktu} {isMe && <CheckCheck size={13} className="text-sky-500" />}
                      </p>
                    </div>
                  );
                })}
                <div ref={chatBottomRef} />
              </div>
              <form onSubmit={kirimPesan} className="shrink-0 bg-[#f0f2f5] dark:bg-stone-800 px-3 py-2.5 flex gap-2 items-center">
                <input
                  value={pesan}
                  onChange={(e) => setPesan(e.target.value)}
                  placeholder={`Chat ${activeContact.name}…`}
                  className="flex-1 py-2.5 px-4 rounded-full bg-white dark:bg-stone-700 text-sm text-stone-800 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#00a884] shadow-sm"
                />
                <button type="submit" aria-label="Kirim" className="w-11 h-11 shrink-0 rounded-full bg-[#00a884] hover:bg-[#075e54] text-white flex items-center justify-center shadow-md transition active:scale-95">
                  <Send size={18} />
                </button>
              </form>
            </div>
          )}

          {/* ============ TAB STATUS ============ */}
          {tab === "status" && (
            <div className="flex-1 overflow-y-auto nice-scroll bg-stone-50 dark:bg-stone-950">
              <form onSubmit={postStatus} className="bg-white dark:bg-stone-900 border-b border-stone-200 dark:border-stone-800 p-4 space-y-2.5">
                <textarea
                  value={statusText}
                  onChange={(e) => setStatusText(e.target.value)}
                  placeholder="Apa yang terjadi? Tulis status…"
                  rows={2}
                  className="w-full text-sm bg-stone-100 dark:bg-stone-800 rounded-2xl px-3.5 py-2.5 text-stone-800 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                />
                <label className="flex items-center gap-2 bg-stone-100 dark:bg-stone-800 rounded-2xl px-3.5 py-2.5 focus-within:ring-2 focus-within:ring-emerald-500">
                  <ImageIcon size={16} className="text-stone-400 shrink-0" />
                  <input
                    value={statusImg}
                    onChange={(e) => setStatusImg(e.target.value)}
                    placeholder="URL gambar (opsional)"
                    className="bg-transparent flex-1 text-xs outline-none text-stone-700 dark:text-stone-200 placeholder:text-stone-400"
                  />
                </label>
                <button type="submit" className="w-full py-2.5 rounded-full text-xs font-bold text-white bg-gradient-to-r from-[#00a884] to-[#6228d7] active:scale-[0.98] transition">
                  Posting Status
                </button>
              </form>
              <div className="p-3 space-y-2.5 pb-6">
                {feed.length === 0 && (
                  <p className="text-center text-xs text-stone-400 py-8">
                    Belum ada status. Posting status pertamamu di atas.
                  </p>
                )}
                {feed.map((s) => (
                  <article key={s.id} className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-3.5 shadow-sm">
                    <div className="flex items-center gap-2.5 mb-2">
                      <div className="p-[2px] rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600">
                        <div className="bg-white dark:bg-stone-900 rounded-full p-[1.5px]">
                          <span className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 text-white text-xs flex items-center justify-center font-bold">
                            {s.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-stone-800 dark:text-stone-100 truncate">
                          {s.userId === user.id ? "Status saya" : s.name}{" "}
                          <span className="font-medium text-stone-400">{s.username}</span>
                        </p>
                        <p className="text-[10px] text-stone-400">{fmtTime(s.createdAt)}</p>
                      </div>
                    </div>
                    {s.teks && <p className="text-sm text-stone-700 dark:text-stone-200">{s.teks}</p>}
                    {s.imageUrl && (
                      <img src={s.imageUrl} alt="status" loading="lazy" className="mt-2 w-full rounded-xl object-cover max-h-72" />
                    )}
                  </article>
                ))}
              </div>
            </div>
          )}

          {/* ============ TAB TAMBAH KONTAK ============ */}
          {tab === "tambah" && (
            <div className="flex-1 overflow-y-auto nice-scroll bg-stone-50 dark:bg-stone-950 p-4">
              <div className="grid grid-cols-3 gap-2 mb-4">
                {[
                  { id: "search", label: "Cari", Icon: Search },
                  { id: "scan", label: "Scan QR", Icon: Camera },
                  { id: "myqr", label: "QR Saya", Icon: QrCode },
                ].map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      if (m.id !== "scan") stopScan();
                      setAddMode(m.id);
                      setCamErr("");
                      setScanMsg("");
                    }}
                    className={`flex items-center justify-center gap-1.5 py-2.5 rounded-2xl text-xs font-bold transition ${
                      addMode === m.id
                        ? "bg-[#075e54] text-white shadow"
                        : "bg-white dark:bg-stone-900 text-stone-500 border border-stone-200 dark:border-stone-800"
                    }`}
                  >
                    <m.Icon size={15} />
                    {m.label}
                  </button>
                ))}
              </div>

              {/* --- Cara 1: Cari @username --- */}
              {addMode === "search" && (
                <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-200 dark:border-stone-800 p-5">
                  <h3 className="text-sm font-bold text-stone-800 dark:text-stone-100">Cari berdasarkan @username</h3>
                  <form onSubmit={cariUsername} className="flex gap-2 mt-3">
                    <label className="flex items-center gap-2 flex-1 bg-stone-100 dark:bg-stone-800 rounded-full px-3.5 py-2.5 focus-within:ring-2 focus-within:ring-emerald-500">
                      <AtSign size={15} className="text-stone-400 shrink-0" />
                      <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="@temanmu"
                        className="bg-transparent flex-1 text-sm outline-none text-stone-800 dark:text-stone-100 placeholder:text-stone-400"
                      />
                    </label>
                    <button type="submit" aria-label="Cari" className="w-11 h-11 shrink-0 rounded-full bg-[#00a884] text-white flex items-center justify-center">
                      <Search size={18} />
                    </button>
                  </form>
                  {searchMsg && (
                    <p className="mt-3 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{searchMsg}</p>
                  )}
                  {searchRes && (
                    <div className="mt-3 flex items-center gap-3 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-2xl p-3">
                      <img src={searchRes.avatar} alt={searchRes.name} className="w-11 h-11 rounded-full bg-white object-cover" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-stone-800 dark:text-stone-100 truncate">{searchRes.name}</p>
                        <p className="text-xs text-stone-400">{searchRes.username}</p>
                      </div>
                      <button onClick={tambahDariHasil} className="text-xs font-bold text-white bg-[#00a884] rounded-full px-4 py-2">
                        Tambah
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* --- Cara 2: SCAN QR KAMERA ASLI --- */}
              {addMode === "scan" && (
                <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-200 dark:border-stone-800 p-5 text-center">
                  <h3 className="text-sm font-bold text-stone-800 dark:text-stone-100">Scan QR Teman</h3>
                  <p className="text-xs text-stone-400 mt-1 mb-4">
                    Arahkan kamera ke QR code teman — kontak langsung terhubung &amp; chat terbuka otomatis.
                  </p>
                  {!scanning ? (
                    <button
                      onClick={startScan}
                      className="w-full py-3 rounded-full font-bold text-sm text-white bg-gradient-to-r from-[#00a884] to-[#6228d7] active:scale-[0.98] transition shadow-md inline-flex items-center justify-center gap-2"
                    >
                      <Camera size={17} />
                      Aktifkan Kamera &amp; Scan
                    </button>
                  ) : (
                    <>
                      <div id="qr-reader" className="qr-viewport w-full" />
                      <button
                        onClick={stopScan}
                        className="mt-3 w-full py-2.5 rounded-full text-xs font-bold text-red-600 bg-red-50 border border-red-200 inline-flex items-center justify-center gap-1.5"
                      >
                        <X size={14} /> Hentikan Kamera
                      </button>
                    </>
                  )}
                  {scanMsg && (
                    <p className="mt-3 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 inline-flex items-center gap-1.5">
                      <BadgeCheck size={14} />
                      {scanMsg}
                    </p>
                  )}
                  {camErr && (
                    <p className="mt-3 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                      {camErr}
                    </p>
                  )}
                  {/* Fallback manual: tempel string QR */}
                  <form onSubmit={prosesManualQR} className="flex gap-2 mt-4">
                    <input
                      value={manualQR}
                      onChange={(e) => setManualQR(e.target.value)}
                      placeholder="atau tempel isi QR di sini…"
                      className="flex-1 text-xs bg-stone-100 dark:bg-stone-800 rounded-full px-3.5 py-2.5 text-stone-700 dark:text-stone-200 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <button type="submit" className="text-xs font-bold text-emerald-700 px-3">
                      Proses
                    </button>
                  </form>
                  <p className="text-[10px] text-stone-400 mt-3">
                    Kamera membutuhkan HTTPS (atau localhost saat development).
                  </p>
                </div>
              )}

              {/* --- QR Saya (gambar QR dinamis asli) --- */}
              {addMode === "myqr" && (
                <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-200 dark:border-stone-800 p-6 text-center">
                  <h3 className="text-sm font-bold text-stone-800 dark:text-stone-100">QR Code Saya</h3>
                  <p className="text-xs text-stone-400 mt-0.5 mb-4">
                    Minta temanmu scan untuk chat instan dengan {user.username}
                  </p>
                  <div className="mx-auto w-fit rounded-2xl border-4 border-[#075e54] bg-white p-3">
                    <QRCodeSVG value={myQR} size={192} level="M" />
                    <p className="mt-2 text-[10px] font-mono font-bold bg-[#075e54] text-white px-2 py-1 rounded-full">
                      [ QR: {user.username} ]
                    </p>
                  </div>
                  <p className="text-[10px] font-mono text-stone-400 mt-3 break-all">{myQR}</p>
                </div>
              )}
            </div>
          )}

          {/* ============ TAB PENGATURAN ============ */}
          {tab === "pengaturan" && (
            <div className="flex-1 overflow-y-auto nice-scroll bg-stone-50 dark:bg-stone-950 p-4 space-y-3">
              <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-200 dark:border-stone-800 p-5 flex items-center gap-3.5">
                <img src={user.avatar} alt={user.name} className="w-16 h-16 rounded-full bg-stone-100 object-cover" />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-stone-900 dark:text-white truncate">{user.name}</p>
                  <p className="text-xs text-stone-400">{user.username}</p>
                  <p className="text-xs text-stone-400 truncate">{user.email}</p>
                </div>
                <button
                  onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
                  className="w-10 h-10 rounded-full bg-stone-100 dark:bg-stone-800 flex items-center justify-center text-stone-600 dark:text-stone-300"
                  aria-label="Ganti tema"
                >
                  {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
                </button>
              </div>

              <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-200 dark:border-stone-800 p-5 text-center">
                <p className="text-[11px] font-bold uppercase tracking-widest text-stone-400 mb-3">
                  QR Permanen Saya
                </p>
                <div className="mx-auto w-fit rounded-2xl border-4 border-[#075e54] bg-white p-2.5">
                  <QRCodeSVG value={myQR} size={140} level="M" />
                </div>
                <p className="text-[10px] font-mono text-stone-400 mt-2 break-all">{user.id}</p>
              </div>

              <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-200 dark:border-stone-800 p-4">
                <p className="text-[11px] font-bold uppercase tracking-widest text-stone-400 mb-2 px-1">
                  Kelola Akun ({accounts.length})
                </p>
                {accounts.map((a) => (
                  <div key={a.email} className="flex items-center gap-2.5 py-2 border-b last:border-0 border-stone-100 dark:border-stone-800">
                    <span className="text-xs font-semibold text-stone-700 dark:text-stone-200 flex-1 truncate">
                      {a.profile?.name || a.email}
                      {a.email === user.email && <span className="text-emerald-600"> • aktif</span>}
                    </span>
                    {a.email !== user.email && (
                      <button onClick={() => quickLogin(a)} className="text-[11px] font-bold text-[#00a884]">
                        Alihkan
                      </button>
                    )}
                    <button onClick={() => removeAccount(a.email)} aria-label="Hapus" className="text-stone-300 hover:text-red-500 p-1">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => {
                    setUser(null);
                    setActiveContact(null);
                    setAuthMode("register");
                  }}
                  className="mt-2 w-full py-2.5 rounded-full text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 inline-flex items-center justify-center gap-1.5"
                >
                  <Plus size={14} /> Tambah Akun
                </button>
                <button
                  onClick={() => {
                    setUser(null);
                    setActiveContact(null);
                    setAuthMode("login");
                  }}
                  className="mt-2 w-full py-2.5 rounded-full text-xs font-bold text-red-600 bg-red-50 border border-red-200 inline-flex items-center justify-center gap-1.5"
                >
                  <LogOut size={14} /> Keluar
                </button>
              </div>

              <a
                href={`${SERVER_URL}/admin`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 bg-[#075e54] text-white rounded-3xl p-3.5 text-xs font-bold"
              >
                <LayoutDashboard size={15} /> Buka Admin Activity Dashboard
              </a>
              <p className="text-center text-[10px] text-stone-400 pb-4">
                Server: <code className="bg-stone-200 dark:bg-stone-800 px-1.5 py-0.5 rounded">{SERVER_URL}</code>
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
