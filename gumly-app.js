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

  // Settings > API > Google Cloud Console — a "Browser key" restricted to gumly.tech,
  // with "Places API (New)" enabled. Powers the address autocomplete fields.
  // Leave as-is to disable autocomplete gracefully (fields just work as plain text inputs).
  GOOGLE_PLACES_API_KEY: "PASTE_YOUR_GOOGLE_PLACES_API_KEY_HERE",

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

/* ---------------------------------------------------------------------- */
/* Numeric-only input restriction — blocks letters from phone/card fields.
   Usage: add data-numeric-input="phone" (allows digits, spaces, + - ( ))
   or data-numeric-input="digits" (digits and spaces only, e.g. card numbers)
   to any <input>. */

function gumlyInitNumericInputs() {
  document.querySelectorAll("[data-numeric-input]").forEach((input) => {
    const mode = input.getAttribute("data-numeric-input");
    const allowed = mode === "digits" ? /[^0-9\s]/g : /[^0-9+\-()\s]/g;

    const sanitize = () => {
      const cleaned = input.value.replace(allowed, "");
      if (cleaned !== input.value) input.value = cleaned;
    };

    input.addEventListener("input", sanitize);
    input.addEventListener("paste", () => setTimeout(sanitize, 0));
  });
}

/* ---------------------------------------------------------------------- */
/* Address autocomplete — wires up any input tagged data-address-autocomplete
   with a custom-styled suggestion dropdown backed by Google Places.
   Degrades gracefully to a plain text field if no API key is configured
   or the Google Maps script fails to load. */

let _googleMapsLoadPromise = null;

function gumlyLoadGoogleMaps() {
  if (_googleMapsLoadPromise) return _googleMapsLoadPromise;

  const key = GUMLY_CONFIG.GOOGLE_PLACES_API_KEY;
  if (!key || key === "AIzaSyBXvX1uhVeSy1yVyy7GbzhqdcEZV3VyQ78") {
    return Promise.reject(new Error("Google Places API key not configured in gumly-app.js"));
  }

  _googleMapsLoadPromise = new Promise((resolve, reject) => {
    if (window.google?.maps?.importLibrary) {
      resolve(window.google);
      return;
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&loading=async&libraries=places&v=weekly`;
    script.async = true;
    script.onerror = () => reject(new Error("Failed to load Google Maps script"));
    script.onload = () => resolve(window.google);
    document.head.appendChild(script);
  });

  return _googleMapsLoadPromise;
}

function gumlyInitAddressAutocomplete() {
  const inputs = document.querySelectorAll("[data-address-autocomplete]");
  if (!inputs.length) return;

  gumlyLoadGoogleMaps()
    .then((google) => google.maps.importLibrary("places"))
    .then(({ AutocompleteSuggestion, AutocompleteSessionToken }) => {
      inputs.forEach((input) => wireAddressField(input, AutocompleteSuggestion, AutocompleteSessionToken));
    })
    .catch((err) => {
      console.warn("Address autocomplete disabled:", err.message);
    });
}

function wireAddressField(input, AutocompleteSuggestion, AutocompleteSessionToken) {
  let sessionToken = new AutocompleteSessionToken();
  let debounceTimer = null;
  let activeIndex = -1;
  let currentSuggestions = [];

  // Wrap the input so we can absolutely-position a dropdown beneath it,
  // without disturbing whatever layout already contains it.
  const wrapper = document.createElement("div");
  wrapper.style.position = "relative";
  input.parentNode.insertBefore(wrapper, input);
  wrapper.appendChild(input);

  const dropdown = document.createElement("div");
  dropdown.className = "gumly-address-dropdown";
  dropdown.style.display = "none";
  wrapper.appendChild(dropdown);

  function closeDropdown() {
    dropdown.style.display = "none";
    dropdown.innerHTML = "";
    activeIndex = -1;
    currentSuggestions = [];
  }

  function renderSuggestions(suggestions) {
    currentSuggestions = suggestions;
    activeIndex = -1;
    if (!suggestions.length) {
      closeDropdown();
      return;
    }
    dropdown.innerHTML = suggestions
      .map((s, i) => {
        const pred = s.placePrediction;
        const main = pred.mainText ? pred.mainText.toString() : pred.text.toString();
        const secondary = pred.secondaryText ? pred.secondaryText.toString() : "";
        return `<div class="gumly-address-option" data-index="${i}">
          <span class="gumly-address-main">📍 ${main}</span>
          ${secondary ? `<span class="gumly-address-secondary">${secondary}</span>` : ""}
        </div>`;
      })
      .join("");
    dropdown.style.display = "block";
  }

  async function selectSuggestion(index) {
    const suggestion = currentSuggestions[index];
    if (!suggestion) return;
    const place = suggestion.placePrediction.toPlace();
    await place.fetchFields({ fields: ["formattedAddress"] });
    input.value = place.formattedAddress || suggestion.placePrediction.text.toString();
    closeDropdown();
    // Fresh session token after a completed selection (per Google's billing guidance).
    sessionToken = new AutocompleteSessionToken();
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  input.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    const value = input.value.trim();
    if (value.length < 3) {
      closeDropdown();
      return;
    }
    debounceTimer = setTimeout(async () => {
      try {
        const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: value,
          sessionToken,
          includedRegionCodes: ["us"],
        });
        renderSuggestions(suggestions || []);
      } catch (err) {
        console.warn("Address suggestion fetch failed:", err.message);
        closeDropdown();
      }
    }, 300);
  });

  input.addEventListener("keydown", (e) => {
    if (dropdown.style.display === "none") return;
    const options = dropdown.querySelectorAll(".gumly-address-option");
    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, options.length - 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
    } else if (e.key === "Enter") {
      if (activeIndex >= 0) {
        e.preventDefault();
        selectSuggestion(activeIndex);
        return;
      }
    } else if (e.key === "Escape") {
      closeDropdown();
      return;
    } else {
      return;
    }
    options.forEach((el, i) => el.classList.toggle("active", i === activeIndex));
  });

  dropdown.addEventListener("mousedown", (e) => {
    const option = e.target.closest(".gumly-address-option");
    if (!option) return;
    e.preventDefault();
    selectSuggestion(parseInt(option.dataset.index, 10));
  });

  document.addEventListener("click", (e) => {
    if (!wrapper.contains(e.target)) closeDropdown();
  });
}

document.addEventListener("DOMContentLoaded", gumlyInitNav);
document.addEventListener("DOMContentLoaded", gumlyInitNumericInputs);
document.addEventListener("DOMContentLoaded", gumlyInitAddressAutocomplete);
