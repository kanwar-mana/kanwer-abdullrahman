/**
 * EcomExperts Shopify Test
 * Vanilla JS only (no jQuery).
 *
 * Responsibilities:
 * - Open modal from hotspot click
 * - Fetch product JSON (/products/:handle.js)
 * - Render title, price, description, image
 * - Render variants dynamically based on options
 * - Add to cart via /cart/add.js
 * - Special rule: if selected options include "Black" and "Medium",
 *   also add bundle product (Soft Winter Jacket by handle) automatically.
 */

(() => {
  const moneyFormat = (cents) => {
    // Basic currency formatting; Shopify money format may vary but cents is consistent from .js endpoint
    const value = (cents / 100).toFixed(2);
    return `${value}`; // optionally prepend currency symbol if required by Figma
  };

  const fetchProduct = async (handle) => {
    const res = await fetch(`/products/${handle}.js`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error("Failed to fetch product JSON");
    return res.json();
  };

  const addToCart = async (variantId, quantity = 1) => {
    const res = await fetch("/cart/add.js", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ items: [{ id: variantId, quantity }] }),
    });
    if (!res.ok) throw new Error("Add to cart failed");
    return res.json();
  };

  const getSelectedOptions = (containerEl) => {
    // Collect selected values in the same order as product.options (we render fieldsets in that order)
    const fieldsets = containerEl.querySelectorAll("[data-ecomx-option]");
    return Array.from(fieldsets).map((fs) => {
      const checked = fs.querySelector("input[type='radio']:checked");
      return checked ? checked.value : null;
    });
  };

  const findMatchingVariant = (product, selectedOptions) => {
    // Product variants from /products/:handle.js have `options` array values in order.
    return (
      product.variants.find((v) => {
        if (!v.available) return false;
        return v.options.every((opt, idx) => opt === selectedOptions[idx]);
      }) || null
    );
  };

  const renderVariants = (product, variantsRoot) => {
    variantsRoot.innerHTML = "";

    product.options.forEach((optName, optIndex) => {
      // Unique values for this option index, in order
      const values = Array.from(
        new Set(product.variants.map((v) => v.options[optIndex])),
      );

      const fieldset = document.createElement("fieldset");
      fieldset.className = "ecomx-option";
      fieldset.setAttribute("data-ecomx-option", "");

      const legend = document.createElement("legend");
      legend.className = "ecomx-option__label";
      legend.textContent = optName;
      fieldset.appendChild(legend);

      const list = document.createElement("div");
      list.className = "ecomx-option__values";

      values.forEach((val, i) => {
        const id = `ecomx-${optIndex}-${i}-${product.id}`;

        const label = document.createElement("label");
        label.className = "ecomx-pill";
        label.setAttribute("for", id);

        const input = document.createElement("input");
        input.type = "radio";
        input.name = `ecomx-opt-${optIndex}`;
        input.value = val;
        input.id = id;

        // default select first value
        if (i === 0) input.checked = true;

        const span = document.createElement("span");
        span.textContent = val;

        label.appendChild(input);
        label.appendChild(span);
        list.appendChild(label);
      });

      fieldset.appendChild(list);
      variantsRoot.appendChild(fieldset);
    });
  };

  const setStatus = (el, msg) => {
    el.textContent = msg || "";
  };

  const initGrid = (gridEl) => {
    const modal = gridEl.querySelector("[data-ecomx-modal]");
    const overlayCloses = modal.querySelectorAll("[data-ecomx-close]");

    const imgEl = modal.querySelector("[data-ecomx-modal-img]");
    const titleEl = modal.querySelector("[data-ecomx-modal-title]");
    const priceEl = modal.querySelector("[data-ecomx-modal-price]");
    const descEl = modal.querySelector("[data-ecomx-modal-desc]");
    const variantsRoot = modal.querySelector("[data-ecomx-variants]");
    const formEl = modal.querySelector("[data-ecomx-form]");
    const statusEl = modal.querySelector("[data-ecomx-status]");

    const bundleHandle =
      gridEl.getAttribute("data-bundle-handle") || "soft-winter-jacket";

    let activeProduct = null;

    const openModal = () => {
      modal.hidden = false;
      document.documentElement.classList.add("ecomx-lock");
      // Accessibility: focus close button
      const closeBtn = modal.querySelector(".ecomx-modal__close");
      closeBtn && closeBtn.focus();
    };

    const closeModal = () => {
      modal.hidden = true;
      document.documentElement.classList.remove("ecomx-lock");
      setStatus(statusEl, "");
      activeProduct = null;
    };

    overlayCloses.forEach((btn) => btn.addEventListener("click", closeModal));
    document.addEventListener("keydown", (e) => {
      if (!modal.hidden && e.key === "Escape") closeModal();
    });

    gridEl.addEventListener("click", async (e) => {
      const openBtn = e.target.closest("[data-ecomx-open]");
      if (!openBtn) return;

      const handle = openBtn.getAttribute("data-handle");
      if (!handle) return;

      try {
        setStatus(statusEl, "Loading...");
        openModal();

        activeProduct = await fetchProduct(handle);

        // Populate UI
        titleEl.textContent = activeProduct.title;
        priceEl.textContent = moneyFormat(activeProduct.price);
        descEl.innerHTML = activeProduct.description || "";

        const firstImg =
          activeProduct.images && activeProduct.images[0]
            ? activeProduct.images[0]
            : "";
        imgEl.src = firstImg;
        imgEl.alt = activeProduct.title;

        renderVariants(activeProduct, variantsRoot);
        setStatus(statusEl, "");
      } catch (err) {
        console.error(err);
        setStatus(statusEl, "Failed to load product.");
      }
    });

    // Update price when options change
    variantsRoot.addEventListener("change", () => {
      if (!activeProduct) return;
      const selected = getSelectedOptions(variantsRoot);
      const variant = findMatchingVariant(activeProduct, selected);
      if (variant) priceEl.textContent = moneyFormat(variant.price);
    });

    formEl.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!activeProduct) return;

      const selected = getSelectedOptions(variantsRoot);
      const variant = findMatchingVariant(activeProduct, selected);

      if (!variant) {
        setStatus(statusEl, "This variant is unavailable.");
        return;
      }

      try {
        setStatus(statusEl, "Adding to cart...");

        // Add main product
        await addToCart(variant.id, 1);

        // Special rule: if selected options include "Black" and "Medium"
        const includesBlack = selected.some(
          (v) => v && v.toLowerCase() === "black",
        );
        const includesMedium = selected.some(
          (v) => v && v.toLowerCase() === "medium",
        );

        if (includesBlack && includesMedium) {
          // Add bundle product (Soft Winter Jacket) – choose first available variant
          const bundle = await fetchProduct(bundleHandle);
          const bundleVariant =
            bundle.variants.find((v) => v.available) || bundle.variants[0];
          if (bundleVariant) {
            await addToCart(bundleVariant.id, 1);
          }
        }

        setStatus(statusEl, "Added to cart!");
        // Optional: open cart drawer or redirect to cart if required by test
        // window.location.href = "/cart";
      } catch (err) {
        console.error(err);
        setStatus(statusEl, "Could not add to cart. Please try again.");
      }
    });
  };

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("[data-ecomx-grid]").forEach(initGrid);
  });
})();
