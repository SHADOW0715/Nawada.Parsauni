(async function () {
  const body = document.body;
  const header = document.querySelector(".site-header");
  const menuToggle = document.getElementById("menuToggle");
  const mobileMenu = document.getElementById("mobileMenu");
  const pageLoader = document.getElementById("pageLoader");
  const scrollProgressBar = document.getElementById("scrollProgressBar");
  const scrollTopBtn = document.getElementById("scrollTopBtn");
  const counters = document.querySelectorAll(".counter");
  const revealItems = document.querySelectorAll(".reveal");
  const yearEl = document.getElementById("year");
  const lastUpdatedEl = document.getElementById("lastUpdated");
  let countersStarted = false;
  const THEME_KEY = "np_theme";
  const LANGUAGE_KEY = "np_language";
  const LEGACY_LANGUAGE_KEY = "selectedLanguage";
  const COOKIE_CONSENT_KEY = "np_cookie_consent_v1";
  const DEFAULT_LANGUAGE = "en";
  const pageName = (location.pathname.split("/").pop() || "index.html").replace(".html", "");

  const supportedLanguages = new Set(["en"]);
  const localeCache = new Map();
  const registeredTextNodes = [];
  const registeredAttrs = [];
  const seenTextNodes = new WeakSet();
  const seenAttrEntries = new WeakMap();
  const translationKeyBySource = new Map();
  const usedTranslationKeys = new Map();
  const translations = { en: {}, hi: {}, ur: {} };
  const normalizedTranslations = { en: new Map(), hi: new Map(), ur: new Map() };
  let currentLocale = { dir: "ltr", locale: "en", strings: {}, messages: {} };
  let currentStringMap = new Map();
  const localeMeta = {
    en: { dir: "ltr", locale: "en" },
    hi: { dir: "ltr", locale: "hi" },
    ur: { dir: "rtl", locale: "ur" },
  };
  let currentLanguage = DEFAULT_LANGUAGE;
  const defaultMessages = {
    langLabel: "Select language",
    switchDark: "Switch to dark mode",
    switchLight: "Switch to light mode",
    installApp: "Install App",
    installAppAria: "Install this app",
    showingCount: "Showing {count} {itemLabel}",
    itemSingle: "item",
    itemPlural: "items",
    pdfMissing: "PDF generator is not loaded. Please refresh and try again.",
    pdfTitle: "Village Notice Board",
    pdfHeader: "Nawada Parsauni | UchkaGaon | Gopalganj | Bihar",
    pdfDate: "Date: {date}",
    pdfAdditional: "Additional Information:",
    pdfFooter: "Generated from Nawada Parsauni Community Portal",
    formBlocked: "Request blocked.",
    formWait: "Please wait {seconds} seconds before sending another request.",
    formUnavailable: "Form is unavailable right now. Please reload the page.",
    formNameError: "Please enter your full name (at least 3 characters).",
    formMobileError: "Please enter a valid 10-digit mobile number.",
    formMessageError: "Please enter a detailed message (minimum 15 characters).",
    formSubmitting: "Submitting your request...",
    formSuccess: "Request submitted successfully.",
    formFailure: "Could not send right now. Please try again after a short wait.",
    cookieText: 'We use cookies and local analytics to improve this village portal. <a href="privacy.html">Privacy Policy</a>',
    cookieAccept: "Accept",
  };

  const trackEvent = (eventName, payload = {}) => {
    if (typeof window.gtag !== "function") return;
    window.gtag("event", eventName, {
      page_name: pageName,
      section_name: payload.section_name || "general",
      button_type: payload.button_type || "interaction",
    });
  };

  const interpolate = (template, vars = {}) =>
    Object.entries(vars).reduce((out, [key, value]) => out.replace(new RegExp(`\\{${key}\\}`, "g"), String(value)), template);

  const isBrokenTranslation = (value) =>
    typeof value === "string" && (/\?{3,}/.test(value) || value.includes("\ufffd"));

  const isMojibakeText = (value) => {
    if (typeof value !== "string" || !value) return false;
    // Common mojibake signatures seen when UTF-8 text is decoded incorrectly.
    if (/(Ã.|Â.|à.|Ø.|Ù.)/.test(value)) return true;
    const latinSupplementChars = value.match(/[\u00C0-\u00FF]/g) || [];
    return latinSupplementChars.length >= 4;
  };

  const safeTranslation = (original, candidate) => {
    if (typeof candidate !== "string") return original;
    const trimmed = candidate.trim();
    if (!trimmed || isBrokenTranslation(trimmed) || isMojibakeText(trimmed)) return original;
    return candidate;
  };

  const slugifyTranslationKey = (value, prefix = "text") => {
    const base = (value || "")
      .toString()
      .trim()
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/_+/g, "_");
    return `${prefix}_${base || "value"}`;
  };

  const ensureTranslationKey = (source, prefix = "text") => {
    const normalizedSource = (source || "").toString().trim();
    if (!normalizedSource) return "";
    if (translationKeyBySource.has(normalizedSource)) return translationKeyBySource.get(normalizedSource);

    const baseKey = slugifyTranslationKey(normalizedSource, prefix);
    let candidate = baseKey;
    let suffix = 2;
    while (usedTranslationKeys.has(candidate) && usedTranslationKeys.get(candidate) !== normalizedSource) {
      candidate = `${baseKey}_${suffix}`;
      suffix += 1;
    }

    usedTranslationKeys.set(candidate, normalizedSource);
    translationKeyBySource.set(normalizedSource, candidate);
    return candidate;
  };

  const setTranslationValue = (lang, key, fallback, candidate) => {
    const safeValue = safeTranslation(fallback, candidate);
    translations[lang][key] = safeValue;
  };

  const normalizeTranslationSource = (value) =>
    (value || "")
      .toString()
      .replace(/\s+/g, " ")
      .trim();

  const getTranslation = (key, fallback = "") => {
    if (!key) return fallback;
    const english = translations.en[key] || fallback || key;
    const candidate = translations[currentLanguage]?.[key];
    const resolved = safeTranslation(english, candidate);
    if (resolved !== english) return resolved;

    const normalizedFallback = normalizeTranslationSource(fallback);
    if (!normalizedFallback) return english;
    const liveLocaleCandidate = currentStringMap.get(normalizedFallback);
    if (liveLocaleCandidate) return safeTranslation(english, liveLocaleCandidate);
    const normalizedCandidate = normalizedTranslations[currentLanguage]?.get(normalizedFallback);
    return safeTranslation(english, normalizedCandidate);
  };

  const tMessage = (key, vars = {}, fallback = "") => {
    const liveTemplate = currentLocale?.messages?.[key];
    const template = safeTranslation(
      fallback || defaultMessages[key] || key,
      liveTemplate || getTranslation(`msg_${key}`, fallback || defaultMessages[key] || key)
    );
    return interpolate(template, vars);
  };

  const getSavedTheme = () => (localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light");
  const runWhenIdle = (callback, timeout = 2000) => {
    if ("requestIdleCallback" in window) {
      requestIdleCallback(callback, { timeout });
    } else {
      setTimeout(callback, 1);
    }
  };

  const ensureLocaleFonts = (lang) => {
    if (!["hi", "ur"].includes(lang)) return;
    if (document.getElementById("localeFonts")) return;
    const link = document.createElement("link");
    link.id = "localeFonts";
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;600;700&family=Noto+Nastaliq+Urdu:wght@400;600;700&display=swap";
    document.head.appendChild(link);
  };

  const getLeadingAndTrailing = (value) => {
    const leading = (value.match(/^\s*/) || [""])[0];
    const trailing = (value.match(/\s*$/) || [""])[0];
    const core = value.trim();
    return { leading, trailing, core };
  };

  const loadLocale = async (lang) => {
    const selected = supportedLanguages.has(lang) ? lang : DEFAULT_LANGUAGE;
    if (localeCache.has(selected)) return localeCache.get(selected);

    try {
      const response = await fetch(`locales/${selected}.json`, { cache: "no-cache" });
      if (!response.ok) throw new Error(`Locale fetch failed: ${selected}`);
      const parsed = await response.json();
      localeCache.set(selected, parsed);
      return parsed;
    } catch (_) {
      if (selected !== DEFAULT_LANGUAGE) return loadLocale(DEFAULT_LANGUAGE);
      return { dir: "ltr", locale: "en", strings: {}, messages: {} };
    }
  };

  const annotateElementKey = (element, attrName, key) => {
    if (!(element instanceof HTMLElement) || !key) return;
    if (!attrName) {
      if (!element.dataset.i18n) element.dataset.i18n = key;
      return;
    }
    const attrKeyName = `i18n${attrName.replace(/(^|-)([a-z])/g, (_, __, char) => char.toUpperCase())}`;
    if (!element.dataset[attrKeyName]) element.dataset[attrKeyName] = key;
  };

  const buildTranslationRegistry = async () => {
    const locales = await Promise.all([...supportedLanguages].map(async (lang) => [lang, await loadLocale(lang)]));

    locales.forEach(([lang, locale]) => {
      localeMeta[lang] = {
        dir: locale?.dir === "rtl" ? "rtl" : "ltr",
        locale: locale?.locale || lang,
      };
    });

    const englishStrings = locales.find(([lang]) => lang === DEFAULT_LANGUAGE)?.[1]?.strings || {};
    Object.entries(englishStrings).forEach(([source, englishText]) => {
      const key = ensureTranslationKey(source, "text");
      setTranslationValue("en", key, source, englishText);
      normalizedTranslations.en.set(normalizeTranslationSource(source), englishText);
      locales.forEach(([lang, locale]) => {
        if (lang === "en") return;
        const translated = locale?.strings?.[source];
        setTranslationValue(lang, key, source, translated);
        normalizedTranslations[lang].set(normalizeTranslationSource(source), safeTranslation(source, translated));
      });
    });

    Object.entries(defaultMessages).forEach(([messageKey, englishText]) => {
      const key = `msg_${messageKey}`;
      setTranslationValue("en", key, englishText, englishText);
      locales.forEach(([lang, locale]) => {
        if (lang === "en") return;
        const translated = locale?.messages?.[messageKey];
        setTranslationValue(lang, key, englishText, translated);
      });
    });
  };

  const registerTextNode = (node) => {
    if (!(node instanceof Text) || seenTextNodes.has(node) || !node.parentElement) return;
    const original = node.nodeValue || "";
    const parts = getLeadingAndTrailing(original);
    if (!parts.core || !/[A-Za-z]/.test(parts.core)) return;

    const key = ensureTranslationKey(parts.core, "text");
    if (!translations.en[key]) setTranslationValue("en", key, parts.core, parts.core);
    registeredTextNodes.push({ node, key, original });
    seenTextNodes.add(node);

    const parent = node.parentElement;
    const textChildren = [...parent.childNodes].filter((child) => child.nodeType === Node.TEXT_NODE && (child.nodeValue || "").trim());
    if (textChildren.length === 1 && textChildren[0] === node && !parent.children.length) {
      annotateElementKey(parent, "", key);
    }
  };

  const registerAttribute = (element, attr, original) => {
    if (!(element instanceof Element)) return;
    const attrMap = seenAttrEntries.get(element) || new Set();
    if (attrMap.has(attr)) return;

    const key = ensureTranslationKey(original, attr.replace(/[^a-z]/g, "") || "attr");
    if (!translations.en[key]) setTranslationValue("en", key, original, original);
    registeredAttrs.push({ element, attr, key, original });
    attrMap.add(attr);
    seenAttrEntries.set(element, attrMap);
    annotateElementKey(element, attr, key);
  };

  const registerTranslatableContent = (root = document) => {
    const scope = root instanceof Document ? root.documentElement : root;
    if (!(scope instanceof Node)) return;

    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node || !node.parentElement) return NodeFilter.FILTER_REJECT;
        const parentTag = node.parentElement.tagName;
        if (["SCRIPT", "STYLE", "NOSCRIPT"].includes(parentTag)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    let node = scope.nodeType === Node.TEXT_NODE ? scope : walker.nextNode();
    while (node) {
      registerTextNode(node);
      node = walker.nextNode();
    }

    const attrs = ["placeholder", "aria-label", "title", "content"];
    const elements = scope instanceof Element ? [scope, ...scope.querySelectorAll("*")] : [...document.querySelectorAll("*")];
    elements.forEach((element) => {
      attrs.forEach((attr) => {
        const value = element.getAttribute?.(attr);
        if (!value || !/[A-Za-z]/.test(value)) return;
        registerAttribute(element, attr, value);
      });
    });
  };

  const updateTranslations = () => {
    registeredTextNodes.forEach((entry) => {
      if (!entry.node.isConnected) return;
      const parts = getLeadingAndTrailing(entry.original);
      if (!parts.core) return;
      entry.node.nodeValue = `${parts.leading}${getTranslation(entry.key, parts.core)}${parts.trailing}`;
    });

    registeredAttrs.forEach((entry) => {
      if (!entry.element.isConnected) return;
      entry.element.setAttribute(entry.attr, getTranslation(entry.key, entry.original));
    });
  };

  const refreshLastUpdated = () => {
    if (!lastUpdatedEl) return;
    const date = new Date();
    const localeCode = currentLanguage === "hi" ? "hi-IN" : currentLanguage === "ur" ? "ur-PK" : "en-IN";
    lastUpdatedEl.textContent = date.toLocaleDateString(localeCode, {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  const refreshLocalizedControls = () => {
    const installPwaBtn = document.getElementById("installPwaBtn");
    if (installPwaBtn) {
      installPwaBtn.textContent = tMessage("installApp", {}, "Install App");
      installPwaBtn.setAttribute("aria-label", tMessage("installAppAria", {}, "Install this app"));
    }
  };

  const applyTheme = (theme) => {
    const isDark = theme === "dark";
    body.classList.toggle("dark-mode", isDark);
    localStorage.setItem(THEME_KEY, isDark ? "dark" : "light");
    const toggle = document.getElementById("themeToggle");
    if (toggle) {
      toggle.setAttribute("aria-pressed", String(isDark));
      toggle.setAttribute("aria-label", isDark ? tMessage("switchLight", {}, "Switch to light mode") : tMessage("switchDark", {}, "Switch to dark mode"));
      toggle.classList.toggle("dark", isDark);
      const icon = toggle.querySelector(".theme-icon");
      if (icon) icon.textContent = isDark ? "\u263e" : "\u2600";
    }
  };

  const applyLanguage = async (lang) => {
    const selected = DEFAULT_LANGUAGE;
    currentLanguage = selected;
    currentLocale = await loadLocale(selected);
    currentStringMap = new Map();
    Object.entries(currentLocale?.strings || {}).forEach(([source, translated]) => {
      currentStringMap.set(normalizeTranslationSource(source), safeTranslation(source, translated));
    });
    const dir = currentLocale?.dir === "rtl" ? "rtl" : localeMeta[selected]?.dir === "rtl" ? "rtl" : "ltr";

    document.documentElement.lang = selected;
    document.documentElement.dir = dir;
    body.classList.toggle("rtl", dir === "rtl");
    localStorage.removeItem(LANGUAGE_KEY);
    localStorage.removeItem(LEGACY_LANGUAGE_KEY);

    body.classList.add("lang-switching");
    requestAnimationFrame(() => {
      updateTranslations();

      refreshLocalizedControls();
      applyTheme(body.classList.contains("dark-mode") ? "dark" : "light");
      refreshLastUpdated();
      document.dispatchEvent(new CustomEvent("np:languagechange", { detail: { language: selected } }));

      setTimeout(() => {
        body.classList.remove("lang-switching");
      }, 220);
    });
  };

  const initUiControls = () => {
    const navbar = document.querySelector(".navbar");
    if (!navbar || navbar.querySelector(".ui-controls")) return;

    const controls = document.createElement("div");
    controls.className = "ui-controls glass-control";

    const themeToggle = document.createElement("button");
    themeToggle.id = "themeToggle";
    themeToggle.className = "theme-toggle";
    themeToggle.type = "button";
    themeToggle.setAttribute("aria-label", "Switch to dark mode");
    themeToggle.setAttribute("aria-pressed", "false");

    const themeIcon = document.createElement("span");
    themeIcon.className = "theme-icon";
    themeIcon.setAttribute("aria-hidden", "true");
    themeIcon.textContent = "\u2600";
    themeToggle.appendChild(themeIcon);

    controls.append(themeToggle);

    const installBtn = document.createElement("button");
    installBtn.id = "installPwaBtn";
    installBtn.className = "install-btn";
    installBtn.type = "button";
    installBtn.hidden = true;
    installBtn.textContent = "Install App";
    installBtn.setAttribute("aria-label", "Install this app");
    controls.appendChild(installBtn);

    const localMenuToggle = navbar.querySelector("#menuToggle");
    if (localMenuToggle) {
      navbar.insertBefore(controls, localMenuToggle);
    } else {
      const firstNav = navbar.querySelector(".desktop-nav, .sub-nav");
      if (firstNav) navbar.insertBefore(controls, firstNav);
      else navbar.appendChild(controls);
    }

    const localThemeToggle = document.getElementById("themeToggle");
    if (localThemeToggle) {
      localThemeToggle.addEventListener("click", () => {
        const next = body.classList.contains("dark-mode") ? "light" : "dark";
        applyTheme(next);
        trackEvent("theme_toggle", {
          section_name: "display_controls",
          button_type: next,
        });
      });
    }

  };

  applyTheme(getSavedTheme());
  initUiControls();
  applyTheme(getSavedTheme());

  const ensureAdvertisementNavLink = () => {
    document.querySelectorAll(".sub-nav").forEach((nav) => {
      const hasLink = [...nav.querySelectorAll("a")].some((link) => (link.getAttribute("href") || "").includes("advertisements.html"));
      if (hasLink) return;
      const item = document.createElement("li");
      const link = document.createElement("a");
      link.href = "advertisements.html";
      link.textContent = "Advertisements";
      item.appendChild(link);
      nav.appendChild(item);
    });
  };

  ensureAdvertisementNavLink();

  const initializeI18n = async () => {
    await buildTranslationRegistry();
    registerTranslatableContent(document);
    window.updateTranslations = () => {
      registerTranslatableContent(document);
      updateTranslations();
    };
    await applyLanguage(DEFAULT_LANGUAGE);

    const contentObserver = new MutationObserver((mutations) => {
      let shouldRefreshTranslations = false;

      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((addedNode) => {
          if (addedNode.nodeType === Node.TEXT_NODE) {
            registerTextNode(addedNode);
            shouldRefreshTranslations = true;
            return;
          }

          if (addedNode instanceof Element) {
            registerTranslatableContent(addedNode);
            shouldRefreshTranslations = true;
          }
        });
      });

      if (shouldRefreshTranslations) updateTranslations();
    });

    if (body) {
      contentObserver.observe(body, {
        childList: true,
        subtree: true,
      });
    }
  };

  runWhenIdle(() => {
    initializeI18n().catch(() => {});
  });

  let deferredInstallPrompt = null;
  const installPwaBtn = document.getElementById("installPwaBtn");
  if (installPwaBtn) {
    installPwaBtn.addEventListener("click", async () => {
      trackEvent("pwa_install_click", {
        section_name: "pwa",
        button_type: "install_button",
      });

      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      try {
        await deferredInstallPrompt.userChoice;
      } catch (_) {
        // Ignore transient prompt failures.
      }
      deferredInstallPrompt = null;
      installPwaBtn.hidden = true;
    });
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    if (installPwaBtn) installPwaBtn.hidden = false;
  });

  window.addEventListener("appinstalled", () => {
    if (installPwaBtn) installPwaBtn.hidden = true;
    trackEvent("pwa_installed", {
      section_name: "pwa",
      button_type: "a2hs",
    });
  });

  const isLocalhost = ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
  if ("serviceWorker" in navigator && !isLocalhost) {
    window.addEventListener("load", () => {
      let hasRefreshedForSw = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (hasRefreshedForSw) return;
        hasRefreshedForSw = true;
        window.location.reload();
      });

      navigator.serviceWorker
        .register("sw.js?v=20260520-1")
        .then((registration) => registration.update())
        .catch(() => {});
    });
  }

  const syncHeader = () => {
    if (!header) return;
    header.classList.toggle("scrolled", window.scrollY > 24);
  };
  syncHeader();
  window.addEventListener("scroll", syncHeader, { passive: true });

  const updateScrollProgress = () => {
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    const progress = scrollable > 0 ? Math.min(100, Math.max(0, (window.scrollY / scrollable) * 100)) : 0;
    if (scrollProgressBar) scrollProgressBar.style.width = `${progress}%`;
    if (scrollTopBtn) scrollTopBtn.classList.toggle("visible", window.scrollY > 520);
  };

  updateScrollProgress();
  window.addEventListener("scroll", updateScrollProgress, { passive: true });
  window.addEventListener("resize", updateScrollProgress);

  if (scrollTopBtn) {
    scrollTopBtn.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  const hidePageLoader = () => {
    if (!pageLoader) return;
    pageLoader.classList.add("is-hidden");
    setTimeout(() => pageLoader.remove(), 420);
  };

  if (document.readyState === "complete") {
    hidePageLoader();
  } else {
    window.addEventListener("load", hidePageLoader, { once: true });
    setTimeout(hidePageLoader, 1800);
  }

  if (menuToggle && mobileMenu) {
    const mobileMenuLinks = [...mobileMenu.querySelectorAll("a")];

    const setMobileMenuState = (isOpen) => {
      mobileMenu.classList.toggle("open", isOpen);
      menuToggle.classList.toggle("is-open", isOpen);
      menuToggle.setAttribute("aria-expanded", String(isOpen));
      menuToggle.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");
      mobileMenu.setAttribute("aria-hidden", String(!isOpen));
      if ("inert" in mobileMenu) {
        mobileMenu.toggleAttribute("inert", !isOpen);
      } else if (isOpen) {
        mobileMenu.removeAttribute("inert");
      } else {
        mobileMenu.setAttribute("inert", "");
      }
      mobileMenuLinks.forEach((link) => {
        if (isOpen) link.removeAttribute("tabindex");
        else link.setAttribute("tabindex", "-1");
      });
    };

    const closeMenu = () => {
      setMobileMenuState(false);
    };

    setMobileMenuState(false);

    menuToggle.addEventListener("click", () => {
      const isOpen = !mobileMenu.classList.contains("open");
      setMobileMenuState(isOpen);
    });

    mobileMenu.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        closeMenu();
      });
    });

    window.addEventListener("resize", () => {
      if (window.matchMedia("(min-width: 768px)").matches) closeMenu();
    });

    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!mobileMenu.classList.contains("open")) return;
      const clickedToggle = menuToggle.contains(target);
      const clickedMenu = mobileMenu.contains(target);
      if (!clickedToggle && !clickedMenu) closeMenu();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && mobileMenu.classList.contains("open")) closeMenu();
    });
  }

  const animateCounter = (el) => {
    const target = Number(el.dataset.target || 0);

    const isPercent = el.dataset.unit === "percent" || /harmony|literacy/i.test(el.parentElement?.textContent || "");
    const hasFraction = !Number.isInteger(target);
    const duration = 1300;
    const start = performance.now();

    const tick = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = target * eased;

      if (isPercent) {
        const percentValue = progress < 1 ? current : target;
        const formattedPercent = hasFraction ? percentValue.toFixed(2) : Math.round(percentValue).toString();
        el.textContent = `${formattedPercent}%`;
      } else {
        el.textContent = Math.floor(current).toLocaleString("en-IN");
      }

      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) entry.target.classList.add("in-view");
      });

      if (!countersStarted && [...entries].some((entry) => entry.isIntersecting && entry.target.id === "stats")) {
        countersStarted = true;
        counters.forEach(animateCounter);
      }
    },
    { threshold: 0.25 }
  );

  revealItems.forEach((item) => observer.observe(item));
  const statsSection = document.getElementById("stats");
  if (statsSection) observer.observe(statsSection);

  const sectionNavLinks = [...document.querySelectorAll('.desktop-nav a[href^="#"], .mobile-menu a[href^="#"]')];
  const sectionNavMap = new Map();
  sectionNavLinks.forEach((link) => {
    const id = link.getAttribute("href")?.slice(1);
    if (!id) return;
    const links = sectionNavMap.get(id) || [];
    links.push(link);
    sectionNavMap.set(id, links);
  });

  const setActiveSection = (id) => {
    sectionNavLinks.forEach((link) => link.classList.remove("active"));
    (sectionNavMap.get(id) || []).forEach((link) => link.classList.add("active"));
  };

  const sectionObserver = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible?.target?.id) setActiveSection(visible.target.id);
    },
    {
      rootMargin: "-24% 0px -62% 0px",
      threshold: [0.08, 0.18, 0.32],
    }
  );

  sectionNavMap.forEach((_, id) => {
    const section = document.getElementById(id);
    if (section) sectionObserver.observe(section);
  });

  if (yearEl) yearEl.textContent = String(new Date().getFullYear());
  const searchInput = document.getElementById("siteSearch");
  let searchableCards = [...document.querySelectorAll(".searchable-card")];
  const noResultsEl = document.getElementById("searchNoResults");
  const resultCountEl = document.getElementById("searchResultCount");

  const normalize = (value) => (value || "").toString().toLowerCase().trim();
  const refreshSearchableCards = () => {
    searchableCards = [...document.querySelectorAll(".searchable-card")];
  };

  const runSearch = (query) => {
    if (!searchableCards.length) return;
    const term = normalize(query);
    let visibleCount = 0;

    searchableCards.forEach((card) => {
      const haystack = normalize([
        card.getAttribute("data-name"),
        card.getAttribute("data-category"),
        card.getAttribute("data-keywords"),
        card.textContent,
      ].join(" "));

      const isMatch = !term || haystack.includes(term);
      card.classList.toggle("search-hidden", !isMatch);
      if (isMatch) visibleCount += 1;
    });

    if (resultCountEl) {
      const itemLabel = visibleCount === 1 ? tMessage("itemSingle", {}, "item") : tMessage("itemPlural", {}, "items");
      resultCountEl.textContent = tMessage("showingCount", { count: visibleCount, itemLabel }, `Showing ${visibleCount} ${itemLabel}`);
    }

    if (noResultsEl) {
      const showEmptyState = term.length > 0 && visibleCount === 0;
      noResultsEl.classList.toggle("visible", showEmptyState);
    }
  };

  if (searchInput) {
    searchInput.addEventListener("input", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      runSearch(target.value);
    });
    searchInput.addEventListener("search", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      runSearch(target.value);
    });
  }
  runSearch(searchInput instanceof HTMLInputElement ? searchInput.value : "");

  document.addEventListener("np:languagechange", () => {
    runSearch(searchInput instanceof HTMLInputElement ? searchInput.value : "");
  });

  const fallbackAdvertisements = [
    {
      businessName: "Nawada Parsauni Village Hospital",
      category: "Hospitals",
      ownerName: "Dr. A. Kumar",
      phoneNumber: "+91 99555 00881",
      address: "Near Panchayat Bhawan, Nawada Parsauni",
      description: "Primary consultation, first-aid support, and health guidance for local families.",
      image: "image/sunlight.webp",
      logo: "icons/icon-192.png",
      websiteLink: "medical.html",
      locationLink: "https://www.google.com/maps/search/?api=1&query=Nawada+Parsauni+Hospital+Gopalganj+Bihar",
      rating: 4.8,
      status: "Open Daily",
      featured: true,
    },
    {
      businessName: "Maa Durga Kirana Store",
      category: "Shops",
      ownerName: "Manoj Gupta",
      phoneNumber: "+91 99555 01234",
      address: "Main Bazaar, Nawada Parsauni",
      description: "Groceries, packaged food, and daily household essentials.",
      image: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=70",
      logo: "icons/icon-192.png",
      websiteLink: "shops.html",
      locationLink: "https://www.google.com/maps/search/?api=1&query=Maa+Durga+Kirana+Store+Nawada+Parsauni",
      rating: 4.7,
      status: "Open Daily",
      featured: true,
    },
    {
      businessName: "Bright Future Coaching Institute",
      category: "Coaching Centers",
      ownerName: "S. Alam",
      phoneNumber: "+91 98111 04567",
      address: "Manbodh Parsauni Road, Nawada Parsauni",
      description: "School tuition, exam preparation, and scholarship guidance.",
      image: "https://images.unsplash.com/photo-1588072432836-e10032774350?auto=format&fit=crop&w=900&q=70",
      logo: "icons/icon-192.png",
      websiteLink: "education.html",
      locationLink: "https://www.google.com/maps/search/?api=1&query=Coaching+Institute+Nawada+Parsauni",
      rating: 4.9,
      status: "Admissions Open",
      featured: true,
    },
  ];

  const advertisementCategoryIcon = {
    Hospitals: "\u{1F3E5}",
    Shops: "\u{1F6D2}",
    Restaurants: "\u{1F37D}",
    "Medical Stores": "\u{1F48A}",
    "Coaching Centers": "\u{1F4DA}",
    Banks: "\u{1F3E6}",
    "Agriculture Services": "\u{1F69C}",
    "Transport Services": "\u{1F695}",
  };

  const advertisementTranslations = {
    hi: {
      "Featured Local Business": "विशेष स्थानीय व्यवसाय",
      "Featured Advertisements": "विशेष विज्ञापन",
      "Learn More": "और जानें",
      "Close": "बंद करें",
      "Contact": "संपर्क",
      "WhatsApp": "व्हाट्सऐप",
      "Location": "स्थान",
      "Visit Now": "अभी देखें",
      "Rating": "रेटिंग",
      "Owner:": "मालिक:",
      "Address:": "पता:",
      "Contact Number": "संपर्क नंबर",
      "Advertisements will appear here after approval.": "स्वीकृति के बाद विज्ञापन यहां दिखाई देंगे।",
      "Hospitals": "अस्पताल",
      "Shops": "दुकानें",
      "Restaurants": "रेस्तरां",
      "Medical Stores": "मेडिकल स्टोर",
      "Coaching Centers": "कोचिंग सेंटर",
      "Banks": "बैंक",
      "Agriculture Services": "कृषि सेवाएं",
      "Transport Services": "परिवहन सेवाएं",
      "Nawada Parsauni Village Hospital": "नवादा परसौनी गांव अस्पताल",
      "Maa Durga Kirana Store": "मां दुर्गा किराना स्टोर",
      "Shifa Medical Store": "शिफा मेडिकल स्टोर",
      "Bright Future Coaching Institute": "ब्राइट फ्यूचर कोचिंग संस्थान",
      "Parsauni Family Restaurant": "परसौनी फैमिली रेस्टोरेंट",
      "Kisan Agriculture Services": "किसान कृषि सेवाएं",
      "Thawe Bank Service Point": "थावे बैंक सेवा केंद्र",
      "Nawada Transport Service": "नवादा परिवहन सेवा",
      "Primary consultation, first-aid support, health guidance, and referral assistance for nearby families.": "नजदीकी परिवारों के लिए प्राथमिक परामर्श, प्राथमिक उपचार, स्वास्थ्य मार्गदर्शन और रेफरल सहायता।",
      "Groceries, packaged food, household essentials, and daily-use supplies for village families.": "गांव के परिवारों के लिए किराना, पैकेज्ड खाद्य सामग्री, घरेलू जरूरी सामान और दैनिक उपयोग की वस्तुएं।",
      "Medicine counter, basic health products, doctor-prescribed medicines, and emergency essentials.": "दवा काउंटर, बुनियादी स्वास्थ्य उत्पाद, डॉक्टर द्वारा लिखी दवाएं और आपातकालीन जरूरी सामान।",
      "School tuition, board exam preparation, scholarship guidance, and foundational learning support.": "स्कूल ट्यूशन, बोर्ड परीक्षा तैयारी, छात्रवृत्ति मार्गदर्शन और बुनियादी सीखने की सहायता।",
      "Tea, snacks, breakfast, and family-friendly food service for local visitors and villagers.": "स्थानीय आगंतुकों और ग्रामीणों के लिए चाय, नाश्ता, भोजन और परिवार-अनुकूल सेवा।",
      "Seeds, fertilizer guidance, farming tools, seasonal support, and agricultural service connections.": "बीज, उर्वरक मार्गदर्शन, कृषि उपकरण, मौसमी सहायता और कृषि सेवा संपर्क।",
      "Banking guidance, account support, withdrawal assistance, and government scheme payment help.": "बैंकिंग मार्गदर्शन, खाता सहायता, निकासी सहायता और सरकारी योजना भुगतान मदद।",
      "Local travel support, auto service, goods transport, and route assistance for nearby towns.": "स्थानीय यात्रा सहायता, ऑटो सेवा, माल परिवहन और नजदीकी शहरों के लिए मार्ग सहायता।",
      "Open Daily": "प्रतिदिन खुला",
      "Morning to Evening": "सुबह से शाम",
      "Admissions Open": "प्रवेश खुले हैं",
      "Seasonal Support": "मौसमी सहायता",
      "Working Hours": "कार्य समय",
      "Call Before Visit": "आने से पहले कॉल करें"
    },
    ur: {
      "Featured Local Business": "نمایاں مقامی کاروبار",
      "Featured Advertisements": "نمایاں اشتہارات",
      "Learn More": "مزید جانیں",
      "Close": "بند کریں",
      "Contact": "رابطہ",
      "WhatsApp": "واٹس ایپ",
      "Location": "مقام",
      "Visit Now": "ابھی دیکھیں",
      "Rating": "ریٹنگ",
      "Owner:": "مالک:",
      "Address:": "پتہ:",
      "Contact Number": "رابطہ نمبر",
      "Advertisements will appear here after approval.": "منظوری کے بعد اشتہارات یہاں دکھائی دیں گے۔",
      "Hospitals": "ہسپتال",
      "Shops": "دکانیں",
      "Restaurants": "ریستوران",
      "Medical Stores": "میڈیکل اسٹورز",
      "Coaching Centers": "کوچنگ سینٹرز",
      "Banks": "بینک",
      "Agriculture Services": "زرعی خدمات",
      "Transport Services": "ٹرانسپورٹ خدمات",
      "Nawada Parsauni Village Hospital": "نوادہ پرسونی گاؤں ہسپتال",
      "Maa Durga Kirana Store": "ماں درگا کرانہ اسٹور",
      "Shifa Medical Store": "شفا میڈیکل اسٹور",
      "Bright Future Coaching Institute": "برائٹ فیوچر کوچنگ انسٹی ٹیوٹ",
      "Parsauni Family Restaurant": "پرسونی فیملی ریسٹورنٹ",
      "Kisan Agriculture Services": "کسان زرعی خدمات",
      "Thawe Bank Service Point": "تھاوے بینک سروس پوائنٹ",
      "Nawada Transport Service": "نوادہ ٹرانسپورٹ سروس",
      "Primary consultation, first-aid support, health guidance, and referral assistance for nearby families.": "قریبی خاندانوں کے لیے بنیادی مشاورت، فرسٹ ایڈ، صحت رہنمائی اور ریفرل مدد۔",
      "Groceries, packaged food, household essentials, and daily-use supplies for village families.": "گاؤں کے خاندانوں کے لیے کرانہ، پیک شدہ غذا، گھریلو ضروریات اور روزمرہ سامان۔",
      "Medicine counter, basic health products, doctor-prescribed medicines, and emergency essentials.": "دوا کاؤنٹر، بنیادی صحت مصنوعات، ڈاکٹر کی تجویز کردہ ادویات اور ہنگامی ضروریات۔",
      "School tuition, board exam preparation, scholarship guidance, and foundational learning support.": "اسکول ٹیوشن، بورڈ امتحان تیاری، اسکالرشپ رہنمائی اور بنیادی تعلیم کی مدد۔",
      "Tea, snacks, breakfast, and family-friendly food service for local visitors and villagers.": "مقامی زائرین اور دیہاتیوں کے لیے چائے، ناشتہ، کھانا اور خاندانی سروس۔",
      "Seeds, fertilizer guidance, farming tools, seasonal support, and agricultural service connections.": "بیج، کھاد رہنمائی، زرعی اوزار، موسمی مدد اور زرعی خدمات کے رابطے۔",
      "Banking guidance, account support, withdrawal assistance, and government scheme payment help.": "بینکنگ رہنمائی، اکاؤنٹ مدد، رقم نکالنے کی مدد اور سرکاری اسکیم ادائیگی مدد۔",
      "Local travel support, auto service, goods transport, and route assistance for nearby towns.": "مقامی سفر، آٹو سروس، سامان نقل و حمل اور قریبی شہروں کے راستوں کی مدد۔",
      "Open Daily": "روزانہ کھلا",
      "Morning to Evening": "صبح سے شام",
      "Admissions Open": "داخلے جاری ہیں",
      "Seasonal Support": "موسمی مدد",
      "Working Hours": "اوقات کار",
      "Call Before Visit": "آنے سے پہلے کال کریں"
    }
  };

  const translateAdText = (value) => {
    const text = value || "";
    if (currentLanguage === DEFAULT_LANGUAGE) return text;
    return advertisementTranslations[currentLanguage]?.[text] || getTranslation(ensureTranslationKey(text, "text"), text);
  };

  const normalizePhoneForLink = (value) => (value || "").replace(/[^\d]/g, "");

  const loadAdvertisements = async () => {
    try {
      const response = await fetch("data/advertisements.json", { cache: "no-cache" });
      if (!response.ok) throw new Error("Advertisement data unavailable");
      const ads = await response.json();
      return Array.isArray(ads) && ads.length ? ads : fallbackAdvertisements;
    } catch (_) {
      return fallbackAdvertisements;
    }
  };

  const createAdvertisementCard = (ad) => {
    const card = document.createElement("article");
    card.className = "advertisement-card searchable-card";
    card.tabIndex = 0;
    card.dataset.name = ad.businessName || "";
    card.dataset.category = ad.category || "Advertisement";
    card.dataset.keywords = [ad.category, ad.ownerName, ad.address, ad.description].filter(Boolean).join(" ");

    const image = ad.image || "image/field.webp";
    const logo = ad.logo || "icons/icon-192.png";
    const phone = ad.phoneNumber || "";
    const phoneDigits = normalizePhoneForLink(phone);
    const whatsappHref = phoneDigits ? `https://wa.me/${phoneDigits}?text=Namaste%2C%20I%20am%20contacting%20from%20the%20Nawada%20Parsauni%20advertisement%20directory.` : "";
    const mapHref = ad.locationLink || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ad.address || ad.businessName || "Nawada Parsauni")}`;
    const websiteHref = ad.websiteLink || "#";
    const category = ad.category || "Local Business";
    const icon = advertisementCategoryIcon[category] || "\u{1F3EA}";
    const title = translateAdText(ad.businessName || "Local Business");
    const translatedCategory = translateAdText(category);
    const description = translateAdText(ad.description || "Local service provider for Nawada Parsauni and nearby areas.");
    const ownerLabel = translateAdText("Owner:");
    const addressLabel = translateAdText("Address:");
    const status = translateAdText(ad.status || "Contact before visit");
    const contactLabel = translateAdText("Contact");
    const whatsappLabel = translateAdText("WhatsApp");
    const locationLabel = translateAdText("Location");
    const visitLabel = translateAdText("Visit Now");
    const ratingLabel = translateAdText("Rating");

    card.innerHTML = `
      <div class="ad-media">
        <img class="ad-image" src="${image}" alt="${title}" loading="lazy" decoding="async">
        <span class="ad-category-badge">${icon} ${translatedCategory}</span>
      </div>
      <div class="ad-content">
        <div class="ad-title-row">
          <img class="ad-logo" src="${logo}" alt="" loading="lazy" decoding="async">
          <div>
            <h3>${title}</h3>
            <p class="ad-rating">&#9733; ${ad.rating || "4.5"} ${ratingLabel}</p>
          </div>
        </div>
        <p>${description}</p>
        <p class="ad-meta"><strong>${ownerLabel}</strong> ${translateAdText(ad.ownerName || "To be updated")}</p>
        <p class="ad-meta"><strong>${addressLabel}</strong> ${translateAdText(ad.address || "Nawada Parsauni, Bihar")}</p>
        <p class="ad-status">${status}</p>
        <div class="ad-actions">
          ${phoneDigits ? `<a class="btn btn-primary" href="tel:${phoneDigits}">${contactLabel}</a>` : ""}
          ${whatsappHref ? `<a class="btn btn-outline" href="${whatsappHref}" target="_blank" rel="noopener noreferrer">${whatsappLabel}</a>` : ""}
          <a class="btn btn-outline" href="${mapHref}" target="_blank" rel="noopener noreferrer">${locationLabel}</a>
          ${websiteHref !== "#" ? `<a class="btn btn-outline" href="${websiteHref}">${visitLabel}</a>` : ""}
        </div>
      </div>
    `;

    card.addEventListener("click", (event) => {
      if (event.target instanceof Element && event.target.closest("a, button")) return;
      openAdvertisementPoster(ad);
    });
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openAdvertisementPoster(ad);
    });

    return card;
  };

  const renderAdvertisements = (container, advertisements, options = {}) => {
    if (!container) return;
    const featuredOnly = container.dataset.adsFeatured === "true" || options.featuredOnly;
    const limit = Number(container.dataset.adsLimit || options.limit || 0);
    let visibleAds = featuredOnly ? advertisements.filter((ad) => ad.featured) : advertisements;
    if (limit > 0) visibleAds = visibleAds.slice(0, limit);

    container.innerHTML = "";
    visibleAds.forEach((ad) => {
      container.appendChild(createAdvertisementCard(ad));
    });

    if (!visibleAds.length) {
      container.innerHTML = '<p class="listing-disclaimer">Advertisements will appear here after approval.</p>';
    }
  };

  const openAdvertisementPoster = (ad, autoClose = false) => {
    if (!document.body || !ad) return;
    document.querySelectorAll(".ad-popup").forEach((existing) => existing.remove());
    const popup = document.createElement("div");
    popup.className = "ad-popup";
    popup.setAttribute("role", "dialog");
    popup.setAttribute("aria-modal", "true");
    popup.setAttribute("aria-label", translateAdText("Featured local business advertisement"));
    const image = ad.posterImage || ad.image || "image/field.webp";
    const logo = ad.logo || "icons/icon-192.png";
    const phone = ad.phoneNumber || translateAdText("Contact Number");
    const websiteHref = ad.websiteLink || "advertisements.html";
    popup.innerHTML = `
      <div class="ad-popup-card">
        <button class="ad-popup-close" type="button" aria-label="Close advertisement">&times;</button>
        <div class="ad-poster-wrap">
          <img class="ad-poster-image" src="${image}" alt="${translateAdText(ad.businessName || "Advertisement poster")}" loading="eager" decoding="async">
          <div class="ad-poster-overlay">
            <img class="ad-poster-logo" src="${logo}" alt="" loading="lazy" decoding="async">
            <p class="section-tag">${translateAdText("Featured Local Business")}</p>
            <h2>${translateAdText(ad.businessName || "Local Business")}</h2>
            <p>${translateAdText(ad.description || "Local service provider for Nawada Parsauni and nearby areas.")}</p>
          </div>
        </div>
        <div class="ad-popup-details">
          <p><strong>${translateAdText("Contact Number")}:</strong> ${phone}</p>
          <p><strong>${translateAdText("Address:")}</strong> ${translateAdText(ad.address || "Nawada Parsauni, Bihar")}</p>
        </div>
        <div class="ad-popup-actions">
          <a class="btn btn-primary" href="${websiteHref}">${translateAdText("Learn More")}</a>
          <button class="btn btn-outline ad-popup-close-action" type="button">${translateAdText("Close")}</button>
        </div>
      </div>
    `;
    document.body.appendChild(popup);

    const closePopup = () => {
      if (!popup.isConnected) return;
      popup.classList.add("closing");
      setTimeout(() => popup.remove(), 320);
    };

    requestAnimationFrame(() => popup.classList.add("open"));
    popup.querySelectorAll(".ad-popup-close, .ad-popup-close-action").forEach((button) => {
      button.addEventListener("click", closePopup);
    });
    popup.addEventListener("click", (event) => {
      if (event.target === popup) closePopup();
    });
    if (autoClose) setTimeout(closePopup, 5000);
  };

  const showAdvertisementPopup = (advertisements) => {
    if (!document.body) return;
    const featuredAds = advertisements.filter((ad) => ad.featured);
    const pool = featuredAds.length ? featuredAds : advertisements;
    const selected = pool[Math.floor(Math.random() * pool.length)];
    openAdvertisementPoster(selected, true);
  };

  let loadedAdvertisements = [];
  loadAdvertisements().then((advertisements) => {
    loadedAdvertisements = advertisements;
    renderAdvertisements(document.getElementById("featuredAdsGrid"), advertisements, { featuredOnly: true, limit: 6 });
    renderAdvertisements(document.getElementById("allAdsGrid"), advertisements);
    renderAdvertisements(document.getElementById("listingGrid"), advertisements, { limit: 6 });
    refreshSearchableCards();
    runSearch(searchInput instanceof HTMLInputElement ? searchInput.value : "");
    showAdvertisementPopup(advertisements);
  });

  document.addEventListener("np:languagechange", () => {
    if (!loadedAdvertisements.length) return;
    renderAdvertisements(document.getElementById("featuredAdsGrid"), loadedAdvertisements, { featuredOnly: true, limit: 6 });
    renderAdvertisements(document.getElementById("allAdsGrid"), loadedAdvertisements);
    renderAdvertisements(document.getElementById("listingGrid"), loadedAdvertisements, { limit: 6 });
    refreshSearchableCards();
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest("a");
    if (!(anchor instanceof HTMLAnchorElement)) return;

    const href = (anchor.getAttribute("href") || "").trim();
    if (!href) return;

    if (href.startsWith("tel:")) {
      const number = href.replace("tel:", "");
      if (["112", "108", "101"].includes(number)) {
        trackEvent("emergency_click", {
          section_name: "emergency",
          button_type: number,
        });
      }
      return;
    }

    const isMapClick =
      anchor.classList.contains("map-btn") ||
      href.includes("google.com/maps") ||
      href.includes("google.com/maps/search");
    if (isMapClick) {
      trackEvent("map_click", {
        section_name: "location",
        button_type: "maps_button",
      });
    }
  });

  const galleryGrid = document.getElementById("galleryGrid");
  const filterButtons = [...document.querySelectorAll(".filter-btn")];
  const galleryItems = [...document.querySelectorAll(".gallery-item")];
  const lightbox = document.getElementById("galleryLightbox");
  const lightboxImage = document.getElementById("lightboxImage");
  const lightboxCaption = document.getElementById("lightboxCaption");
  const lightboxClose = lightbox?.querySelector(".lightbox-close");

  const setActiveFilter = (filter) => {
    filterButtons.forEach((button) => {
      const isActive = button.dataset.filter === filter;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-selected", String(isActive));
    });

    galleryItems.forEach((item) => {
      const category = item.dataset.category || "all";
      const matches = filter === "all" || category === filter;
      item.classList.toggle("is-hidden", !matches);
    });
  };

  if (filterButtons.length) {
    filterButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const filter = button.dataset.filter || "all";
        setActiveFilter(filter);
      });
    });
  }

  const openLightbox = (item) => {
    if (!lightbox || !lightboxImage || !item) return;
    const img = item.querySelector("img");
    const caption = item.querySelector("figcaption span");
    if (!(img instanceof HTMLImageElement)) return;
    lightboxImage.src = img.currentSrc || img.src;
    lightboxImage.alt = img.alt || "Gallery image";
    if (lightboxCaption) {
      lightboxCaption.textContent = caption?.textContent?.trim() || img.alt || "";
    }
    lightbox.classList.add("open");
    lightbox.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  };

  const closeLightbox = () => {
    if (!lightbox || !lightboxImage) return;
    lightbox.classList.remove("open");
    lightbox.setAttribute("aria-hidden", "true");
    lightboxImage.src = "";
    document.body.style.overflow = "";
  };

  if (galleryGrid) {
    galleryGrid.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const item = target.closest(".gallery-item");
      if (!(item instanceof HTMLElement)) return;
      openLightbox(item);
    });
  }

  if (lightboxClose) {
    lightboxClose.addEventListener("click", closeLightbox);
  }

  if (lightbox) {
    lightbox.addEventListener("click", (event) => {
      if (event.target === lightbox) closeLightbox();
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && lightbox?.classList.contains("open")) {
      closeLightbox();
    }
  });

  const starButtons = [...document.querySelectorAll(".star-btn")];
  const ratingModal = document.getElementById("ratingModal");
  const ratingCloseBtn = ratingModal?.querySelector(".rating-close");
  const ratingStars = [...document.querySelectorAll(".rating-star")];
  const ratingSubmitBtn = document.getElementById("ratingSubmitBtn");
  const ratingThanks = document.getElementById("ratingThanks");
  let selectedRating = 0;

  const setRating = (value) => {
    selectedRating = value;
    starButtons.forEach((btn) => {
      const btnValue = Number(btn.dataset.value || 0);
      btn.classList.toggle("active", btnValue <= selectedRating);
    });
    ratingStars.forEach((star) => {
      const starValue = Number(star.dataset.value || 0);
      star.classList.toggle("active", starValue <= selectedRating);
    });
    if (ratingSubmitBtn) ratingSubmitBtn.disabled = selectedRating === 0;
  };

  const openRatingModal = (initialValue) => {
    if (!ratingModal) return;
    if (typeof initialValue === "number") setRating(initialValue);
    ratingModal.classList.add("open");
    ratingModal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  };

  const closeRatingModal = () => {
    if (!ratingModal) return;
    ratingModal.classList.remove("open");
    ratingModal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  };

  starButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const value = Number(button.dataset.value || 0);
      button.classList.add("is-clicked");
      setTimeout(() => button.classList.remove("is-clicked"), 160);
      openRatingModal(value);
    });
  });

  ratingStars.forEach((star) => {
    star.addEventListener("click", () => {
      const value = Number(star.dataset.value || 0);
      setRating(value);
    });
  });

  if (ratingSubmitBtn) {
    ratingSubmitBtn.addEventListener("click", () => {
      if (selectedRating === 0) return;
      closeRatingModal();
      if (ratingThanks) ratingThanks.textContent = "Thanks for your feedback";
    });
  }

  if (ratingCloseBtn) {
    ratingCloseBtn.addEventListener("click", closeRatingModal);
  }

  if (ratingModal) {
    ratingModal.addEventListener("click", (event) => {
      if (event.target === ratingModal) closeRatingModal();
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && ratingModal?.classList.contains("open")) {
      closeRatingModal();
    }
  });

  const mapPreview = document.querySelector(".map-preview");
  if (mapPreview instanceof HTMLButtonElement) {
    mapPreview.addEventListener("click", () => {
      const src = mapPreview.dataset.mapSrc;
      if (!src) return;
      const iframe = document.createElement("iframe");
      iframe.className = "map-frame";
      iframe.title = "Map of Nawada Parsauni, Gopalganj, Bihar";
      iframe.loading = "lazy";
      iframe.referrerPolicy = "no-referrer-when-downgrade";
      iframe.width = "600";
      iframe.height = "450";
      iframe.src = src;
      mapPreview.replaceWith(iframe);
    });
  }

  const noticeDownloadButtons = [...document.querySelectorAll(".notice-download-btn")];
  const loadJsPdf = (() => {
    let jsPdfPromise = null;
    return () => {
      if (window.jspdf?.jsPDF) return Promise.resolve(window.jspdf);
      if (jsPdfPromise) return jsPdfPromise;
      jsPdfPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js";
        script.async = true;
        script.onload = () => resolve(window.jspdf);
        script.onerror = () => reject(new Error("Failed to load jsPDF"));
        document.head.appendChild(script);
      });
      return jsPdfPromise;
    };
  })();

  const slugify = (value) =>
    (value || "notice")
      .toString()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "notice";

  const generateNoticePdf = async (card) => {
    const jsPdfNamespace = await loadJsPdf().catch(() => null);
    const jsPdfApi = jsPdfNamespace?.jsPDF;
    if (!jsPdfApi) {
      alert(tMessage("pdfMissing", {}, "PDF generator is not loaded. Please refresh and try again."));
      return;
    }

    const title = card.querySelector("h3")?.textContent?.trim() || "Village Notice";
    const summary = card.querySelector(":scope > p")?.textContent?.trim() || "";
    const date = card.querySelector(".notice-date")?.textContent?.trim() || "";
    const details = card.querySelector("details p")?.textContent?.trim() || "";

    const doc = new jsPdfApi({ orientation: "p", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    const contentWidth = pageWidth - margin * 2;
    let y = 20;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(tMessage("pdfTitle", {}, "Village Notice Board"), margin, y);
    y += 8;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(tMessage("pdfHeader", {}, "Nawada Parsauni | UchkaGaon | Gopalganj | Bihar"), margin, y);
    y += 10;

    doc.setDrawColor(180);
    doc.line(margin, y, pageWidth - margin, y);
    y += 10;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    const titleLines = doc.splitTextToSize(title, contentWidth);
    doc.text(titleLines, margin, y);
    y += titleLines.length * 6 + 2;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    if (date) {
      doc.text(tMessage("pdfDate", { date }, `Date: ${date}`), margin, y);
      y += 8;
    }

    if (summary) {
      const summaryLines = doc.splitTextToSize(summary, contentWidth);
      doc.text(summaryLines, margin, y);
      y += summaryLines.length * 5 + 6;
    }

    if (details) {
      doc.setFont("helvetica", "bold");
      doc.text(tMessage("pdfAdditional", {}, "Additional Information:"), margin, y);
      y += 7;
      doc.setFont("helvetica", "normal");
      const detailLines = doc.splitTextToSize(details, contentWidth);
      doc.text(detailLines, margin, y);
      y += detailLines.length * 5 + 6;
    }

    doc.setFontSize(9);
    doc.setTextColor(95);
    doc.text(tMessage("pdfFooter", {}, "Generated from Nawada Parsauni Community Portal"), margin, 285);

    const fileName = `${slugify(title)}-${slugify(date || "notice")}.pdf`;
    doc.save(fileName);
  };

  noticeDownloadButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      const noticeCard = button.closest(".notice-card");
      if (noticeCard) await generateNoticePdf(noticeCard);
    });
  });

  const current = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".bottom-menu a").forEach((a) => {
    const href = a.getAttribute("href");
    const isCurrent = href === current || (current === "index.html" && href === "index.html#notice-board");
    a.classList.toggle("active", isCurrent);
  });

  const contactForm = document.getElementById("contactRequestForm");
  if (contactForm) {
    const submitBtn = contactForm.querySelector('button[type="submit"]');
    const statusEl = document.getElementById("formStatus");
    const throttleKey = "np_contact_last_submit_at";
    const minCooldownMs = 90 * 1000;
    let isSubmitting = false;
    let allowNativeSubmit = false;

    const setStatus = (message, type) => {
      if (!statusEl) return;
      statusEl.textContent = message;
      statusEl.classList.remove("success", "error");
      if (type) statusEl.classList.add(type);
    };

    const sanitizeText = (value) => (value || "").toString().replace(/[<>]/g, "").trim();
    const sanitizePhone = (value) => (value || "").toString().replace(/\D/g, "");
    const readLastSubmitAt = () => Number(localStorage.getItem(throttleKey) || 0);
    const writeLastSubmitAt = (timestamp) => localStorage.setItem(throttleKey, String(timestamp));
    const nativeSubmitFallback = () => {
      allowNativeSubmit = true;
      contactForm.submit();
    };

    contactForm.addEventListener("submit", async (event) => {
      if (allowNativeSubmit) return;
      event.preventDefault();
      if (isSubmitting) return;

      const honeypotInput = contactForm.querySelector('input[name="_website"], input[name="_honey"]');
      if (honeypotInput instanceof HTMLInputElement && honeypotInput.value.trim() !== "") {
        setStatus(tMessage("formBlocked", {}, "Request blocked."), "error");
        return;
      }

      const now = Date.now();
      const waitMs = minCooldownMs - (now - readLastSubmitAt());
      if (waitMs > 0) {
        const waitSec = Math.ceil(waitMs / 1000);
        setStatus(tMessage("formWait", { seconds: waitSec }, `Please wait ${waitSec} seconds before sending another request.`), "error");
        return;
      }

      const nameInput = contactForm.querySelector("#fullName");
      const mobileInput = contactForm.querySelector("#mobileNumber");
      const messageInput = contactForm.querySelector("#message");

      if (
        !(nameInput instanceof HTMLInputElement) ||
        !(mobileInput instanceof HTMLInputElement) ||
        !(messageInput instanceof HTMLTextAreaElement)
      ) {
        setStatus(tMessage("formUnavailable", {}, "Form is unavailable right now. Please reload the page."), "error");
        return;
      }

      const safeName = sanitizeText(nameInput.value);
      const safePhone = sanitizePhone(mobileInput.value);
      const safeMessage = sanitizeText(messageInput.value);

      if (safeName.length < 3) {
        setStatus(tMessage("formNameError", {}, "Please enter your full name (at least 3 characters)."), "error");
        nameInput.focus();
        return;
      }
      if (!/^[6-9]\d{9}$/.test(safePhone)) {
        setStatus(tMessage("formMobileError", {}, "Please enter a valid 10-digit mobile number."), "error");
        mobileInput.focus();
        return;
      }
      if (safeMessage.length < 15) {
        setStatus(tMessage("formMessageError", {}, "Please enter a detailed message (minimum 15 characters)."), "error");
        messageInput.focus();
        return;
      }

      nameInput.value = safeName;
      mobileInput.value = safePhone;
      messageInput.value = safeMessage;

      if (!contactForm.checkValidity()) {
        contactForm.reportValidity();
        return;
      }

      const formData = new FormData(contactForm);
      const emailTarget = (contactForm.dataset.emailTarget || "update-nawadaparsauni@example.com").trim();
      const submitUrl = `https://formsubmit.co/ajax/${encodeURIComponent(emailTarget)}`;

      isSubmitting = true;
      if (submitBtn) submitBtn.disabled = true;
      setStatus(tMessage("formSubmitting", {}, "Submitting your request..."), "");

      try {
        const response = await fetch(submitUrl, {
          method: "POST",
          headers: { Accept: "application/json" },
          body: formData,
        });

        const payload = await response.json().catch(() => null);
        const apiMarkedSuccess =
          payload && Object.prototype.hasOwnProperty.call(payload, "success")
            ? payload.success === true || payload.success === "true"
            : response.ok;

        if (!response.ok || !apiMarkedSuccess) {
          const apiMessage = payload && typeof payload.message === "string" ? payload.message.trim() : "";
          throw new Error(apiMessage || "Submit request failed");
        }

        writeLastSubmitAt(now);
        setStatus(tMessage("formSuccess", {}, "Request submitted successfully."), "success");
        trackEvent("form_submit", {
          section_name: "contact_form",
          button_type: "submit",
        });
        contactForm.reset();
      } catch (error) {
        const message = error instanceof Error && error.message ? error.message : "";
        const fallbackMessage =
          message ||
          tMessage("formFailure", {}, "Could not send right now. Please try again after a short wait.");
        setStatus(`${fallbackMessage} Sending with the standard form method...`, "error");
        nativeSubmitFallback();
      } finally {
        isSubmitting = false;
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  const initCookieBanner = () => {
    try {
      if (localStorage.getItem(COOKIE_CONSENT_KEY) === "accepted") return;
    } catch (_) {
      return;
    }

    const banner = document.createElement("div");
    banner.className = "cookie-banner";
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-live", "polite");
    banner.innerHTML = `<p>${tMessage("cookieText", {}, 'We use cookies and local analytics to improve this village portal. <a href="privacy.html">Privacy Policy</a>')}</p><button type="button" class="btn btn-primary cookie-accept-btn">${tMessage("cookieAccept", {}, "Accept")}</button>`;
    document.body.appendChild(banner);

    requestAnimationFrame(() => {
      banner.classList.add("visible");
    });

    const acceptBtn = banner.querySelector(".cookie-accept-btn");
    if (acceptBtn instanceof HTMLButtonElement) {
      acceptBtn.addEventListener("click", () => {
        localStorage.setItem(COOKIE_CONSENT_KEY, "accepted");
        banner.classList.remove("visible");
        setTimeout(() => banner.remove(), 260);
      });
    }
  };

  initCookieBanner();
})();
