(function (global) {
  const TOAST_DURATION_MS = 5200;

  function ensureToastHost() {
    let host = document.getElementById("toastHost");
    if (!host) {
      host = document.createElement("div");
      host.id = "toastHost";
      host.className = "toast-host";
      host.setAttribute("aria-live", "polite");
      host.setAttribute("aria-relevant", "additions");
      document.body.appendChild(host);
    }
    return host;
  }

  function parseApiError(raw) {
    if (!raw) {
      return "Request failed";
    }
    try {
      const parsed = JSON.parse(raw);
      if (parsed.message) {
        return parsed.message;
      }
      if (parsed.errors) {
        return JSON.stringify(parsed.errors);
      }
    } catch {
      // Not JSON.
    }
    return raw;
  }

  function showToast({ type = "success", title = "", message = "", duration = TOAST_DURATION_MS } = {}) {
    const host = ensureToastHost();
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.setAttribute("role", type === "error" ? "alert" : "status");

    const iconClass =
      type === "error"
        ? "fa-circle-xmark"
        : type === "warning"
          ? "fa-triangle-exclamation"
          : "fa-circle-check";

    toast.innerHTML = `
      <div class="toast-icon"><i class="fa-solid ${iconClass}" aria-hidden="true"></i></div>
      <div class="toast-body">
        ${title ? `<strong class="toast-title">${escapeHtml(title)}</strong>` : ""}
        ${message ? `<p class="toast-message">${escapeHtml(message)}</p>` : ""}
      </div>
      <button type="button" class="toast-close" aria-label="Dismiss notification">&times;</button>
    `;

    const dismiss = () => {
      toast.classList.add("toast-out");
      setTimeout(() => toast.remove(), 220);
    };

    toast.querySelector(".toast-close").addEventListener("click", dismiss);
    host.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("toast-in"));

    if (duration > 0) {
      setTimeout(dismiss, duration);
    }

    return dismiss;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function setButtonLoading(button, loading, loadingLabel) {
    if (!button) {
      return;
    }

    if (loading) {
      if (!button.dataset.originalHtml) {
        button.dataset.originalHtml = button.innerHTML;
        button.dataset.originalDisabled = button.disabled ? "1" : "0";
      }
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
      button.classList.add("is-loading");

      if (button.classList.contains("btn-icon") || button.classList.contains("icon-btn")) {
        button.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>';
        if (loadingLabel) {
          button.title = loadingLabel;
        }
      } else {
        button.innerHTML = `<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> ${escapeHtml(loadingLabel || "Loading...")}`;
      }
      return;
    }

    button.disabled = button.dataset.originalDisabled === "1";
    button.removeAttribute("aria-busy");
    button.classList.remove("is-loading");
    if (button.dataset.originalHtml) {
      button.innerHTML = button.dataset.originalHtml;
      delete button.dataset.originalHtml;
      delete button.dataset.originalDisabled;
    }
  }

  function setContainerOverlay(container, visible, message) {
    if (!container) {
      return;
    }

    let overlay = container.querySelector(":scope > .section-overlay");
    if (!visible) {
      overlay?.classList.remove("visible");
      container.classList.remove("is-overlayed");
      container.removeAttribute("aria-busy");
      return;
    }

    if (!overlay) {
      overlay = document.createElement("div");
      overlay.className = "section-overlay";
      overlay.innerHTML = `
        <div class="section-overlay-inner">
          <i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>
          <span class="section-overlay-text"></span>
        </div>
      `;
      if (getComputedStyle(container).position === "static") {
        container.style.position = "relative";
      }
      container.appendChild(overlay);
    }

    const textEl = overlay.querySelector(".section-overlay-text");
    if (textEl) {
      textEl.textContent = message || "Working...";
    }
    overlay.classList.add("visible");
    container.classList.add("is-overlayed");
    container.setAttribute("aria-busy", "true");
  }

  function setButtonsDisabled(container, disabled) {
    if (!container) {
      return;
    }
    container.querySelectorAll("button, input, select, textarea, a.btn").forEach((el) => {
      if (disabled) {
        if (!el.dataset.wasDisabled) {
          el.dataset.wasDisabled = el.disabled ? "1" : "0";
        }
        el.disabled = true;
        el.setAttribute("aria-disabled", "true");
        if (el.tagName === "A") {
          el.classList.add("disabled");
          el.tabIndex = -1;
        }
      } else if (el.dataset.wasDisabled !== undefined) {
        el.disabled = el.dataset.wasDisabled === "1";
        delete el.dataset.wasDisabled;
        el.removeAttribute("aria-disabled");
        if (el.tagName === "A") {
          el.classList.remove("disabled");
          el.tabIndex = 0;
        }
      }
    });
  }

  function initDataTable(selector, options) {
    if (!global.jQuery || !global.jQuery.fn?.DataTable) {
      return null;
    }
    const $table = global.jQuery(selector);
    if (!$table.length) {
      return null;
    }
    try {
      if (global.jQuery.fn.DataTable.isDataTable(selector)) {
        $table.DataTable().destroy();
      }
      return $table.DataTable(options);
    } catch (error) {
      console.error("DataTable initialization failed", error);
      return null;
    }
  }

  global.AdminUI = {
    showToast,
    parseApiError,
    setButtonLoading,
    setContainerOverlay,
    setButtonsDisabled,
    initDataTable
  };
})(window);
