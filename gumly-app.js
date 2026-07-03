/* =========================================================================
   GUMLY — shared config + auth + API helpers
   Loaded on every page after the Supabase CDN script:
     <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
     <script src="gumly-app.js"></script>

   >>> EDIT THE CONFIG BLOCK BELOW <<<
   Everything else in this file should work as-is once the config is filled in.
   ========================================================================= */

const GUMLY_CONFIG = {
  // Settings > API > Project URL in your Supabase dashboard
  SUPABASE_URL: "https://ixzyvvseilpjodybpoyp.supabase.co",

  // Settings > API > Project API keys > "anon" "public" key (safe to expose client-side)
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml4enl2dnNlaWxwam9keWJwb3lwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2MTc4NDksImV4cCI6MjA5ODE5Mzg0OX0.H_juRBk_iDQH0z1YFXwcvRXECBu1XeiatSLesvXxlbo",

  // Your Express API on Render
  API_BASE_URL: "https://api.gumly.tech",

  // Adjust these paths to match your actual Express routes if they differ.
  ENDPOINTS: {
    BOOKINGS: "/api/bookings",   // GET  -> list current user's bookings
                                  // POST -> create a new booking
    SERVICES: "/api/services",   // GET  -> service catalog (optional; falls back to local list below)
  },
};

// Local fallback service catalog — used on the booking page if /api/services
// isn't wired up yet. Keeps the site fully clickable even before that route exists.
const GUMLY_SERVICES = [
  { id: "ac_tuneup",  name: "AC Tune-Up",    icon: "❄️", price: 95 },
  { id: "cable_run",  name: "Cable Run",     icon: "📡", price: 70 },
  { id: "cleaning",   name: "Home Cleaning", icon: "🧹", price: 89 },
  { id: "plumbing",   name: "Plumbing",      icon: "💧", price: 65 },
  { id: "electrical", name: "Electrical",    icon: "⚡", price: 75 },
  { id: "handyman",   name: "Handyman",      icon: "🔧", price: 55 },
];

/* ---------------------------------------------------------------------- */

const supabaseClient = window.supabase
  ? window.supabase.createClient(GUMLY_CONFIG.SUPABASE_URL, GUMLY_CONFIG.SUPABASE_ANON_KEY)
  : null;

function ensureSupabase() {
  if (!supabaseClient) {
    console.error(
      "Supabase SDK didn't load (check your network/CDN access), or SUPABASE_ANON_KEY isn't set in gumly-app.js."
    );
    return false;
  }
  return true;
}

const GumlyAuth = {
  async signUp(email, password, extra = {}) {
    if (!ensureSupabase()) return { error: { message: "Auth isn't configured yet — check gumly-app.js." } };
    return supabaseClient.auth.signUp({
      email,
      password,
      options: { data: extra }, // e.g. { full_name, role: 'homeowner' | 'technician' }
    });
  },

  async signIn(email, password) {
    if (!ensureSupabase()) return { error: { message: "Auth isn't configured yet — check gumly-app.js." } };
    return supabaseClient.auth.signInWithPassword({ email, password });
  },

  async signInWithGoogle(redirectPath = "dashboard.html") {
    if (!ensureSupabase()) return { error: { message: "Auth isn't configured yet — check gumly-app.js." } };
    return supabaseClient.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/${redirectPath}` },
    });
  },

  async signOut() {
    if (!ensureSupabase()) return { error: null };
    return supabaseClient.auth.signOut();
  },

  async getSession() {
    if (!ensureSupabase()) return null;
    const { data } = await supabaseClient.auth.getSession();
    return data.session;
  },

  onChange(callback) {
    if (!ensureSupabase()) return;
    supabaseClient.auth.onAuthStateChange((_event, session) => callback(session));
  },

  // Call at the top of pages that require login (book.html, dashboard.html).
  // Redirects to login.html (preserving where the user was headed) if signed out.
  async requireAuth() {
    const session = await this.getSession();
    if (!session) {
      const redirect = encodeURIComponent(window.location.pathname.split("/").pop());
      window.location.href = `login.html?redirect=${redirect}`;
      return null;
    }
    return session;
  },
};

const GumlyApi = {
  async request(path, { method = "GET", body } = {}) {
    const session = await GumlyAuth.getSession();
    const headers = { "Content-Type": "application/json" };
    if (session) headers["Authorization"] = `Bearer ${session.access_token}`;

    try {
      const res = await fetch(`${GUMLY_CONFIG.API_BASE_URL}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      const data = text ? JSON.parse(text) : null;
      if (!res.ok) {
        return { ok: false, status: res.status, error: data?.error || data?.message || `Request failed (${res.status})`, data: null };
      }
      return { ok: true, status: res.status, error: null, data };
    } catch (err) {
      return { ok: false, status: 0, error: "Couldn't reach the Gumly API. Check your connection and try again.", data: null };
    }
  },

  listBookings() {
    return this.request(GUMLY_CONFIG.ENDPOINTS.BOOKINGS, { method: "GET" });
  },

  createBooking(payload) {
    return this.request(GUMLY_CONFIG.ENDPOINTS.BOOKINGS, { method: "POST", body: payload });
  },
};

/* ---------------------------------------------------------------------- */
/* Auth-aware header: toggles Log in/Sign up vs. account chip on every page
   that includes an element with [data-nav-actions]. */

function gumlyDisplayName(user) {
  if (!user) return "";
  const meta = user.user_metadata || {};
  // Google OAuth typically provides full_name and/or name; our own signup form stores full_name.
  return meta.full_name || meta.name || user.email.split("@")[0];
}

function gumlyInitNav() {
  const navActions = document.querySelector("[data-nav-actions]");
  if (!navActions) return;
  navActions.setAttribute("data-authstate", "loading");

  const render = (session) => {
    navActions.setAttribute("data-authstate", session ? "in" : "out");
    const nameEl = navActions.querySelector("[data-user-email]");
    if (nameEl && session) nameEl.textContent = gumlyDisplayName(session.user);
    const avatarEl = navActions.querySelector("[data-user-avatar]");
    if (avatarEl && session) avatarEl.textContent = gumlyDisplayName(session.user).charAt(0).toUpperCase();
  };

  GumlyAuth.getSession().then(render);
  GumlyAuth.onChange(render);

  const logoutBtn = navActions.querySelector("[data-signout]");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      await GumlyAuth.signOut();
      window.location.href = "index.html";
    });
  }
}

document.addEventListener("DOMContentLoaded", gumlyInitNav);
