(function () {
  const body = document.body;
  const header = document.querySelector(".site-header");
  const menuToggle = document.getElementById("menuToggle");
  const mobileMenu = document.getElementById("mobileMenu");
  const counters = document.querySelectorAll(".counter");
  const revealItems = document.querySelectorAll(".reveal");
  const yearEl = document.getElementById("year");
  const lastUpdatedEl = document.getElementById("lastUpdated");
  let countersStarted = false;

  window.addEventListener("load", () => {
    body.classList.add("loaded");
  });

  const syncHeader = () => {
    if (!header) return;
    header.classList.toggle("scrolled", window.scrollY > 24);
  };
  syncHeader();
  window.addEventListener("scroll", syncHeader, { passive: true });

  if (menuToggle && mobileMenu) {
    menuToggle.addEventListener("click", () => {
      const isOpen = mobileMenu.classList.toggle("open");
      menuToggle.setAttribute("aria-expanded", String(isOpen));
      mobileMenu.setAttribute("aria-hidden", String(!isOpen));
    });

    mobileMenu.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        mobileMenu.classList.remove("open");
        menuToggle.setAttribute("aria-expanded", "false");
        mobileMenu.setAttribute("aria-hidden", "true");
      });
    });
  }

  const animateCounter = (el) => {
    const target = Number(el.dataset.target || 0);
    const isPercent = /harmony/i.test(el.parentElement?.textContent || "");
    const duration = 1300;
    const start = performance.now();

    const tick = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.floor(target * eased);
      el.textContent = isPercent ? `${current}%` : current.toLocaleString("en-IN");
      if (progress < 1) {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  };

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in-view");
        }
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
  if (lastUpdatedEl) {
    const date = new Date();
    lastUpdatedEl.textContent = date.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }
})();

