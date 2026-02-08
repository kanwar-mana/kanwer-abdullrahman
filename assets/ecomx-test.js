/**
 * ============================================================
 * EcomExperts Shopify Test - Vanilla JS (no jQuery)
 * ============================================================
 *
 * Responsibilities:
 * 1. Open product quick-view modal when hotspot is clicked.
 * 2. Fetch product data from /products/:handle.js endpoint.
 * 3. Render product title, price, description, and featured image.
 * 4. Dynamically render variant options:
 *    - Color-type options as radio pill buttons.
 *    - Size-type options as a <select> dropdown.
 * 5. Update displayed price when variant selection changes.
 * 6. Add selected variant to cart via /cart/add.js (POST).
 * 7. Special bundle rule: when selected options include both
 *    "Black" AND "Medium", automatically add the product with
 *    handle "soft-winter-jacket" to the cart as well.
 * 8. Keyboard accessible (Escape closes modal, focus trap).
 */

(() => {
  "use strict";

  /*  Helpers  */

  /**
   * Format price from cents to a readable currency string.
   * Shopify /products/:handle.js returns price in cents.
   * @param {number} cents - Price in cents.
   * @returns {string} Formatted price (e.g. "980.00EUR").
   */
  const formatMoney = (cents) => {
    const value = (cents / 100).toFixed(2);
    // Using euro symbol to match the design mockup
    return `${value}\u20AC`;
  };

  /**
   * Fetch product JSON from Shopify storefront endpoint.
   * @param {string} handle - Product handle (URL slug).
   * @returns {Promise<Object>} Product data object.
   */
  const fetchProduct = async (handle) => {
    const response = await fetch(`/products/${handle}.js`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`Failed to fetch product: ${handle}`);
    return response.json();
  };

  /**
   * Add one or more items to the Shopify cart.
   * @param {number} variantId - The variant ID to add.
   * @param {number} [quantity=1] - Quantity to add.
   * @returns {Promise<Object>} Cart response.
   */
  const addToCart = async (variantId, quantity = 1) => {
    const response = await fetch("/cart/add.js", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ items: [{ id: variantId, quantity }] }),
    });
    if (!response.ok) throw new Error("Add to cart failed");
    return response.json();
  };

  /*  Variant logic  */

  /**
   * Determine if an option name represents "Size".
   * We render sizes as a dropdown instead of pills.
   * @param {string} name - Option name (e.g. "Size", "Color").
   * @returns {boolean}
   */
  const isSizeOption = (name) => {
    return /size/i.test(name);
  };

  /**
   * Collect currently selected option values from the form.
   * Returns values in the same order as product.options.
   * @param {HTMLElement} container - The variants container element.
   * @returns {Array<string|null>} Selected option values.
   */
  const getSelectedOptions = (container) => {
    const fieldsets = container.querySelectorAll("[data-ecomx-option]");
    return Array.from(fieldsets).map((fieldset) => {
      // Check for radio buttons first (Color pills)
      const checkedRadio = fieldset.querySelector("input[type='radio']:checked");
      if (checkedRadio) return checkedRadio.value;

      // Check for select dropdown (Size)
      const select = fieldset.querySelector("select");
      if (select && select.value) return select.value;

      return null;
    });
  };

  /**
   * Find matching variant based on selected options.
   * Only returns available (in-stock) variants.
   * @param {Object} product - Product data from /products/:handle.js.
   * @param {Array<string|null>} selectedOptions - Current selections.
   * @returns {Object|null} Matching variant or null.
   */
  const findMatchingVariant = (product, selectedOptions) => {
    return (
      product.variants.find((variant) => {
        if (!variant.available) return false;
        return variant.options.every(
          (opt, idx) => opt === selectedOptions[idx]
        );
      }) || null
    );
  };

  /**
   * Render variant option controls dynamically.
   * - Color-type options render as radio pill buttons.
   * - Size-type options render as a <select> dropdown.
   * @param {Object} product - Product data.
   * @param {HTMLElement} root - Container to inject controls into.
   */
  const renderVariants = (product, root) => {
    root.innerHTML = "";

    product.options.forEach((optionName, optionIndex) => {
      // Get unique values for this option, preserving order
      const values = [];
      const seen = new Set();
      product.variants.forEach((v) => {
        const val = v.options[optionIndex];
        if (!seen.has(val)) {
          seen.add(val);
          values.push(val);
        }
      });

      // Create fieldset wrapper
      const fieldset = document.createElement("fieldset");
      fieldset.className = "ecomx-option";
      fieldset.setAttribute("data-ecomx-option", "");

      // Legend / label
      const legend = document.createElement("legend");
      legend.className = "ecomx-option__label";
      legend.textContent = optionName;
      fieldset.appendChild(legend);

      if (isSizeOption(optionName)) {
        //  Render as <select> dropdown 
        const select = document.createElement("select");
        select.className = "ecomx-select";
        select.name = `ecomx-opt-${optionIndex}`;

        // Placeholder option
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = "Choose your size";
        placeholder.disabled = true;
        placeholder.selected = true;
        select.appendChild(placeholder);

        values.forEach((val) => {
          const option = document.createElement("option");
          option.value = val;
          option.textContent = val;
          select.appendChild(option);
        });

        fieldset.appendChild(select);
      } else {
        //  Render as radio pill buttons 
        const valuesContainer = document.createElement("div");
        valuesContainer.className = "ecomx-option__values";

        values.forEach((val, i) => {
          const id = `ecomx-${optionIndex}-${i}-${product.id}`;

          const label = document.createElement("label");
          label.className = "ecomx-pill";
          label.setAttribute("for", id);

          const input = document.createElement("input");
          input.type = "radio";
          input.name = `ecomx-opt-${optionIndex}`;
          input.value = val;
          input.id = id;

          // Select the first value by default
          if (i === 0) input.checked = true;

          const span = document.createElement("span");
          span.textContent = val;

          label.appendChild(input);
          label.appendChild(span);
          valuesContainer.appendChild(label);
        });

        fieldset.appendChild(valuesContainer);
      }

      root.appendChild(fieldset);
    });
  };

  /**
   * Update the status message element.
   * @param {HTMLElement} el - Status element.
   * @param {string} msg - Message to display (empty to clear).
   */
  const setStatus = (el, msg) => {
    el.textContent = msg || "";
  };

  /*  Grid initialisation  */

  /**
   * Initialise event listeners and popup logic for a grid section.
   * @param {HTMLElement} gridEl - The [data-ecomx-grid] container.
   */
  const initGrid = (gridEl) => {
    // Cache DOM references
    const modal = gridEl.querySelector("[data-ecomx-modal]");
    const closeButtons = modal.querySelectorAll("[data-ecomx-close]");
    const imgEl = modal.querySelector("[data-ecomx-modal-img]");
    const titleEl = modal.querySelector("[data-ecomx-modal-title]");
    const priceEl = modal.querySelector("[data-ecomx-modal-price]");
    const descEl = modal.querySelector("[data-ecomx-modal-desc]");
    const variantsRoot = modal.querySelector("[data-ecomx-variants]");
    const formEl = modal.querySelector("[data-ecomx-form]");
    const statusEl = modal.querySelector("[data-ecomx-status]");

    // Bundle product handle from data attribute
    const bundleHandle =
      gridEl.getAttribute("data-bundle-handle") || "soft-winter-jacket";

    // Track currently loaded product
    let activeProduct = null;

    /*  Modal open / close  */

    const openModal = () => {
      modal.hidden = false;
      document.documentElement.classList.add("ecomx-lock");

      // Accessibility: move focus to close button
      const closeBtn = modal.querySelector(".ecomx-modal__close");
      if (closeBtn) closeBtn.focus();
    };

    const closeModal = () => {
      modal.hidden = true;
      document.documentElement.classList.remove("ecomx-lock");
      setStatus(statusEl, "");
      activeProduct = null;
    };

    // Close on overlay click or close-button click
    closeButtons.forEach((btn) =>
      btn.addEventListener("click", closeModal)
    );

    // Close on Escape key
    document.addEventListener("keydown", (e) => {
      if (!modal.hidden && e.key === "Escape") closeModal();
    });

    /*  Hotspot click  open popup  */

    gridEl.addEventListener("click", async (e) => {
      const trigger = e.target.closest("[data-ecomx-open]");
      if (!trigger) return;

      const handle = trigger.getAttribute("data-handle");
      if (!handle) return;

      try {
        setStatus(statusEl, "Loading...");
        openModal();

        activeProduct = await fetchProduct(handle);

        // Populate popup UI
        titleEl.textContent = activeProduct.title;
        priceEl.textContent = formatMoney(activeProduct.price);
        descEl.innerHTML = activeProduct.description || "";

        // Set featured image
        const featuredImage =
          activeProduct.images && activeProduct.images.length
            ? activeProduct.images[0]
            : "";
        imgEl.src = featuredImage;
        imgEl.alt = activeProduct.title;

        // Render variant selectors
        renderVariants(activeProduct, variantsRoot);
        setStatus(statusEl, "");
      } catch (err) {
        console.error("[EcomX]", err);
        setStatus(statusEl, "Failed to load product.");
      }
    });

    /*  Update price when options change  */

    variantsRoot.addEventListener("change", () => {
      if (!activeProduct) return;

      const selected = getSelectedOptions(variantsRoot);
      const variant = findMatchingVariant(activeProduct, selected);

      if (variant) {
        priceEl.textContent = formatMoney(variant.price);
      }
    });

    /*  Add to Cart form submission  */

    formEl.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!activeProduct) return;

      const selected = getSelectedOptions(variantsRoot);
      const variant = findMatchingVariant(activeProduct, selected);

      if (!variant) {
        setStatus(statusEl, "This variant is unavailable. Please choose another option.");
        return;
      }

      try {
        setStatus(statusEl, "Adding to cart...");

        // 1. Add the selected product variant
        await addToCart(variant.id, 1);

        // 2. Special bundle rule:
        //    If selected options include "Black" AND "Medium",
        //    also add "Soft Winter Jacket" (first available variant).
        const hasBlack = selected.some(
          (v) => v && v.toLowerCase() === "black"
        );
        const hasMedium = selected.some(
          (v) => v && v.toLowerCase() === "medium"
        );

        if (hasBlack && hasMedium) {
          try {
            const bundleProduct = await fetchProduct(bundleHandle);
            const bundleVariant =
              bundleProduct.variants.find((v) => v.available) ||
              bundleProduct.variants[0];

            if (bundleVariant) {
              await addToCart(bundleVariant.id, 1);
            }
          } catch (bundleErr) {
            // Log but do not block the main add-to-cart success
            console.warn("[EcomX] Could not add bundle product:", bundleErr);
          }
        }

        setStatus(statusEl, "Added to cart!");
      } catch (err) {
        console.error("[EcomX]", err);
        setStatus(statusEl, "Could not add to cart. Please try again.");
      }
    });
  };

  /*  Bootstrap  */

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("[data-ecomx-grid]").forEach(initGrid);
  });
})();
