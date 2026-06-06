(function () {
  "use strict";

  const LOG_PREFIX = "[RMP GT]";
  const REQUEST_DELAY_MS = 150;
  const BATCH_SIZE = 3;

  const INSTRUCTOR_REGEX =
    /([A-Za-z][A-Za-z\s.'-]*),\s*([A-Za-z][A-Za-z\s.'-]*)(?:\s*\(P\))?/g;

  let enabled = true;
  let debounceTimer = null;
  let isProcessing = false;

  function log(...args) {
    console.log(LOG_PREFIX, ...args);
  }

  function logError(...args) {
    console.error(LOG_PREFIX, ...args);
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function toTitleCase(str) {
    return str
      .toLowerCase()
      .replace(/(?:^|\s|['-])\S/g, (char) => char.toUpperCase());
  }

  function normalizeName(name) {
    let normalized = name.trim().replace(/\s*\(P\)\s*$/i, "");
    if (
      normalized.length > 0 &&
      normalized === normalized.toUpperCase() &&
      /[A-Z]/.test(normalized)
    ) {
      normalized = toTitleCase(normalized);
    }
    return normalized;
  }

  function parseName(name) {
    const normalized = normalizeName(name);
    const match = normalized.match(/^(.+?),\s*(.+)$/);
    if (!match) return null;

    const lastName = match[1].trim();
    const firstName = match[2].trim();
    const queryText = `${firstName} ${lastName}`;

    return {
      original: normalized,
      lastName,
      firstName,
      queryText,
      cacheKey: normalized,
    };
  }

  function getRatingColor(rating) {
    if (rating >= 4.0) return "green";
    if (rating >= 3.0) return "yellow";
    return "red";
  }

  function getProfessorData(parsed) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        {
          type: "GET_PROFESSOR",
          cacheKey: parsed.cacheKey,
          queryText: parsed.queryText,
        },
        (response) => {
          if (chrome.runtime.lastError) {
            logError("Fetch failed for", parsed.queryText, chrome.runtime.lastError.message);
            resolve(null);
            return;
          }
          if (!response?.ok) {
            logError("Fetch failed for", parsed.queryText, response?.error);
            resolve(null);
            return;
          }
          if (response.fromCache) {
            log("Cache hit:", parsed.cacheKey);
          }
          resolve(response.data);
        }
      );
    });
  }

  function createBadge(data) {
    if (!data || data.found === false) {
      const notFound = document.createElement("span");
      notFound.className = "rmp-gt-not-found";
      notFound.setAttribute("data-rmp-injected", "true");
      notFound.textContent = "No RMP data";
      return notFound;
    }

    const badge = document.createElement("span");
    badge.className = "rmp-gt-badge";
    badge.setAttribute("data-rmp-injected", "true");

    const rating = data.rating ?? 0;
    const ratingCircle = document.createElement("span");
    ratingCircle.className = `rmp-gt-rating ${getRatingColor(rating)}`;
    ratingCircle.textContent = rating.toFixed(1);

    const meta = document.createElement("span");
    meta.className = "rmp-gt-meta";

    const diff = document.createElement("span");
    diff.className = "rmp-gt-diff";
    diff.textContent = `Diff: ${data.difficulty?.toFixed(1) ?? "?"}`;
    meta.appendChild(diff);

    if (data.wouldTakeAgain != null && data.wouldTakeAgain >= 0) {
      meta.appendChild(document.createElement("br"));
      const wta = document.createElement("span");
      wta.className = "rmp-gt-wta";
      wta.textContent = `${Math.round(data.wouldTakeAgain)}% retake`;
      meta.appendChild(wta);
    }

    meta.appendChild(document.createElement("br"));
    const ratingsCount = document.createElement("span");
    ratingsCount.className = "rmp-gt-meta";
    ratingsCount.textContent = `${data.numRatings} ratings`;
    meta.appendChild(ratingsCount);

    const tooltip = document.createElement("span");
    tooltip.className = "rmp-gt-tooltip";
    let tooltipText = `Overall: ${rating.toFixed(1)} / Difficulty: ${data.difficulty?.toFixed(1) ?? "?"}`;
    if (data.wouldTakeAgain != null && data.wouldTakeAgain >= 0) {
      tooltipText += ` / Would Take Again: ${Math.round(data.wouldTakeAgain)}%`;
    }
    tooltip.textContent = tooltipText;

    if (data.numRatings < 3) {
      const warning = document.createElement("span");
      warning.className = "rmp-gt-warning";
      warning.title = "Limited data";
      warning.textContent = "\u26A0";
      badge.appendChild(warning);
    }

    badge.appendChild(ratingCircle);
    badge.appendChild(meta);
    badge.appendChild(tooltip);

    if (data.legacyId) {
      badge.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.open(
          `https://www.ratemyprofessors.com/professor/${data.legacyId}`,
          "_blank"
        );
      });
    }

    return badge;
  }

  function extractInstructorsFromText(text) {
    const instructors = [];
    const regex = new RegExp(INSTRUCTOR_REGEX.source, "g");
    let match;

    while ((match = regex.exec(text)) !== null) {
      const name = match[0].replace(/\s*\(P\)\s*$/i, "").trim();
      if (name && !instructors.includes(name)) {
        instructors.push(name);
      }
    }

    return instructors;
  }

  function looksLikeInstructorName(text) {
    return /[A-Za-z][A-Za-z'-]+,\s*[A-Za-z]/.test(text);
  }

  function findClassicInstructorCells() {
    const cells = [];

    document.querySelectorAll("td.dddefault").forEach((cell) => {
      try {
        const text = cell.textContent.trim();
        if (!looksLikeInstructorName(text)) return;
        if (cell.querySelector("[data-rmp-injected]") && cell.querySelector("[data-rmp-name]")) {
          const instructors = extractInstructorsFromText(text);
          const allInjected = instructors.every((name) => {
            const parsed = parseName(name);
            return parsed && cell.querySelector(`[data-rmp-name="${parsed.cacheKey}"]`);
          });
          if (allInjected) return;
        }
        cells.push(cell);
      } catch (err) {
        logError("Error scanning cell:", err);
      }
    });

    return cells;
  }

  function findBannerInstructorElements() {
    const results = [];
    const seen = new Set();

    document.querySelectorAll("div, span, td, li, p").forEach((el) => {
      try {
        if (seen.has(el)) return;
        if (el.querySelector("[data-rmp-injected]")) return;

        const text = el.textContent.trim();
        if (text.length > 300 || text.length < 5) return;
        if (!looksLikeInstructorName(text)) return;

        const instructors = extractInstructorsFromText(text);
        if (instructors.length === 0) return;

        const childHasMatch = Array.from(el.children).some((child) => {
          const childText = child.textContent.trim();
          return (
            looksLikeInstructorName(childText) &&
            extractInstructorsFromText(childText).length > 0
          );
        });
        if (childHasMatch) return;

        seen.add(el);
        results.push({ element: el, instructors });
      } catch (err) {
        logError("Error scanning banner element:", err);
      }
    });

    return results;
  }

  function injectInstructorBadge(container, instructorName, cacheKey, badge) {
    if (container.querySelector(`[data-rmp-name="${cacheKey}"]`)) return;

    const patterns = [
      instructorName + " (P)",
      instructorName + "(P)",
      instructorName,
    ];

    const walker = document.createTreeWalker(
      container,
      NodeFilter.SHOW_TEXT,
      null
    );

    while (walker.nextNode()) {
      const textNode = walker.currentNode;
      const content = textNode.textContent;
      const parent = textNode.parentElement;
      if (!parent || parent.closest("[data-rmp-name]")) continue;

      for (const pattern of patterns) {
        const idx = content.indexOf(pattern);
        if (idx === -1) continue;

        const wrapper = document.createElement("span");
        wrapper.setAttribute("data-rmp-injected", "true");
        wrapper.setAttribute("data-rmp-name", cacheKey);
        wrapper.style.display = "inline";
        wrapper.appendChild(badge);

        const endIdx = idx + pattern.length;
        const before = content.substring(0, endIdx);
        const after = content.substring(endIdx);

        textNode.textContent = before;

        if (after) {
          const afterNode = document.createTextNode(after);
          parent.insertBefore(wrapper, textNode.nextSibling);
          parent.insertBefore(afterNode, wrapper.nextSibling);
        } else {
          parent.insertBefore(wrapper, textNode.nextSibling);
        }

        log("Injected badge for", cacheKey);
        return;
      }
    }

    logError("Could not find injection point for", instructorName, "in", container);
  }

  function isClassicInterface(hostname) {
    return (
      hostname === "oscar.gatech.edu" ||
      hostname === "localhost" ||
      hostname === "127.0.0.1"
    );
  }

  function collectPendingInstructors(hostname) {
    const pending = [];

    if (isClassicInterface(hostname)) {
      findClassicInstructorCells().forEach((cell) => {
        const html = cell.innerHTML;
        const parts = html.split(/<br\s*\/?>/i);

        parts.forEach((part) => {
          const temp = document.createElement("div");
          temp.innerHTML = part;
          const text = temp.textContent.trim();
          extractInstructorsFromText(text).forEach((instructorName) => {
            const parsed = parseName(instructorName);
            if (!parsed) return;
            if (cell.querySelector(`[data-rmp-name="${parsed.cacheKey}"]`)) return;
            pending.push({ element: cell, instructorName, parsed });
          });
        });
      });
    } else if (hostname === "registration.banner.gatech.edu") {
      findBannerInstructorElements().forEach(({ element, instructors }) => {
        instructors.forEach((instructorName) => {
          const parsed = parseName(instructorName);
          if (!parsed) return;
          if (element.querySelector(`[data-rmp-name="${parsed.cacheKey}"]`)) return;
          pending.push({ element, instructorName, parsed });
        });
      });
    }

    const unique = new Map();
    pending.forEach((item) => {
      const key = `${item.parsed.cacheKey}::${item.element}`;
      if (!unique.has(key)) unique.set(key, item);
    });

    return Array.from(unique.values());
  }

  async function processPendingInstructors(pending) {
    for (let i = 0; i < pending.length; i += BATCH_SIZE) {
      const batch = pending.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async ({ element, instructorName, parsed }) => {
          try {
            if (element.querySelector(`[data-rmp-name="${parsed.cacheKey}"]`)) {
              return;
            }

            const data = await getProfessorData(parsed);
            if (data === null) return;

            const badge = createBadge(data);
            if (!badge) return;

            injectInstructorBadge(
              element,
              instructorName,
              parsed.cacheKey,
              badge
            );
          } catch (err) {
            logError("Injection error:", err);
          }
        })
      );

      if (i + BATCH_SIZE < pending.length) {
        await delay(REQUEST_DELAY_MS);
      }
    }
  }

  async function injectRatings() {
    if (!enabled) return;
    if (isProcessing) return;

    isProcessing = true;

    try {
      const hostname = window.location.hostname;
      const pending = collectPendingInstructors(hostname);

      if (pending.length > 0) {
        log(`Found ${pending.length} instructor(s) to process`);
        await processPendingInstructors(pending);
      }
    } catch (err) {
      logError("injectRatings error:", err);
    } finally {
      isProcessing = false;
    }
  }

  function debouncedInject() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(injectRatings, 300);
  }

  function init() {
    log("Content script loaded on", window.location.hostname);

    chrome.storage.sync.get({ enabled: true }, (result) => {
      enabled = result.enabled;
      log("Extension enabled:", enabled);
      if (enabled) injectRatings();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "sync" && changes.enabled) {
        enabled = changes.enabled.newValue;
        if (enabled) injectRatings();
      }
    });

    const observer = new MutationObserver((mutations) => {
      const hasAddedNodes = mutations.some((m) => m.addedNodes.length > 0);
      if (hasAddedNodes) debouncedInject();
    });

    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    }

    if (isClassicInterface(window.location.hostname)) {
      document.addEventListener("DOMContentLoaded", injectRatings);
      window.addEventListener("load", injectRatings);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
