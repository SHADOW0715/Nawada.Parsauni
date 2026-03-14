(async function () {
  const body = document.body;
  const header = document.querySelector(".site-header");
  const menuToggle = document.getElementById("menuToggle");
  const mobileMenu = document.getElementById("mobileMenu");
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

  const supportedLanguages = new Set(["en", "hi", "ur"]);
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
    const languageToggle = document.getElementById("languageToggle");
    if (languageToggle) {
      languageToggle.setAttribute("aria-label", tMessage("langLabel", {}, "Select language"));
      languageToggle.value = currentLanguage;
    }

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
    const selected = supportedLanguages.has(lang) ? lang : DEFAULT_LANGUAGE;
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
    localStorage.setItem(LANGUAGE_KEY, selected);
    localStorage.setItem(LEGACY_LANGUAGE_KEY, selected);

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

    const languageToggle = document.createElement("select");
    languageToggle.id = "languageToggle";
    languageToggle.className = "language-toggle";
    languageToggle.setAttribute("aria-label", "Select language");

    [
      { value: "en", label: "EN" },
      { value: "hi", label: "\u0939\u093f\u0902\u0926\u0940" },
      { value: "ur", label: "\u0627\u0631\u062f\u0648" },
    ].forEach((language) => {
      const option = document.createElement("option");
      option.value = language.value;
      option.textContent = language.label;
      languageToggle.appendChild(option);
    });

    controls.append(themeToggle, languageToggle);

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

    const localLanguageToggle = document.getElementById("languageToggle");
    if (localLanguageToggle) {
      localLanguageToggle.addEventListener("change", async (event) => {
        const target = event.target;
        if (!(target instanceof HTMLSelectElement)) return;
        await applyLanguage(target.value);
        trackEvent("language_change", {
          section_name: "display_controls",
          button_type: target.value,
        });
      });
    }
  };

  window.addEventListener("load", () => {
    body.classList.add("loaded");
  });
  initUiControls();
  await buildTranslationRegistry();
  registerTranslatableContent(document);
  window.updateTranslations = () => {
    registerTranslatableContent(document);
    updateTranslations();
  };
  await applyLanguage(localStorage.getItem(LANGUAGE_KEY) || localStorage.getItem(LEGACY_LANGUAGE_KEY) || DEFAULT_LANGUAGE);
  applyTheme(getSavedTheme());

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

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      let hasRefreshedForSw = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (hasRefreshedForSw) return;
        hasRefreshedForSw = true;
        window.location.reload();
      });

      navigator.serviceWorker
        .register("sw.js?v=20260307-3")
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

  if (menuToggle && mobileMenu) {
    const mobileMenuLinks = [...mobileMenu.querySelectorAll("a")];

    const setMobileMenuState = (isOpen) => {
      mobileMenu.classList.toggle("open", isOpen);
      menuToggle.setAttribute("aria-expanded", String(isOpen));
      mobileMenu.setAttribute("aria-hidden", String(!isOpen));
      mobileMenu.toggleAttribute("inert", !isOpen);
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

    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!mobileMenu.classList.contains("open")) return;
      const clickedToggle = menuToggle.contains(target);
      const clickedMenu = mobileMenu.contains(target);
      if (!clickedToggle && !clickedMenu) closeMenu();
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

  if (yearEl) yearEl.textContent = String(new Date().getFullYear());
  refreshLastUpdated();

  const searchInput = document.getElementById("siteSearch");
  const searchableCards = [...document.querySelectorAll(".searchable-card")];
  const noResultsEl = document.getElementById("searchNoResults");
  const resultCountEl = document.getElementById("searchResultCount");

  const normalize = (value) => (value || "").toString().toLowerCase().trim();

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

  const noticeDownloadButtons = [...document.querySelectorAll(".notice-download-btn")];

  const slugify = (value) =>
    (value || "notice")
      .toString()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "notice";

  const generateNoticePdf = (card) => {
    const jsPdfApi = window.jspdf?.jsPDF;
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
    button.addEventListener("click", () => {
      const noticeCard = button.closest(".notice-card");
      if (noticeCard) generateNoticePdf(noticeCard);
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

    contactForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (isSubmitting) return;

      const honeypotInput = contactForm.querySelector('input[name="_website"]');
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
        if (message) setStatus(message, "error");
        else setStatus(tMessage("formFailure", {}, "Could not send right now. Please try again after a short wait."), "error");
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
