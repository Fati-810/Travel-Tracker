document.addEventListener("DOMContentLoaded", () => {
  const input = document.querySelector('input[name="country"]');
  if (!input) return;

  // Create a dropdown container
  const dropdown = document.createElement("div");
  dropdown.id = "suggestions";
  dropdown.style.position = "absolute";
  dropdown.style.background = "#fff";
  dropdown.style.border = "1px solid #ccc";
  dropdown.style.width = input.offsetWidth + "px";
  dropdown.style.maxHeight = "200px";
  dropdown.style.overflowY = "auto";
  dropdown.style.zIndex = "9999";
  dropdown.style.display = "none";

  // put dropdown below input
  const wrapper = document.createElement("div");
  wrapper.style.position = "relative";
  input.parentNode.insertBefore(wrapper, input);
  wrapper.appendChild(input);
  wrapper.appendChild(dropdown);

  let activeIndex = -1;
  let items = [];

  async function fetchSuggestions(q) {
    const res = await fetch(`/suggestions?q=${encodeURIComponent(q)}`, {
      cache: "no-store",
    });

    // If server sends 304 or empty, fallback
    if (!res.ok) return [];

    const data = await res.json();
    // expecting [{name, code}]
    return Array.isArray(data) ? data : [];
  }

  function renderDropdown(list) {
    dropdown.innerHTML = "";
    items = list;
    activeIndex = -1;

    if (!list.length) {
      dropdown.style.display = "none";
      return;
    }

    list.forEach((item, idx) => {
      const div = document.createElement("div");
      div.textContent = `${item.name} (${item.code})`;
      div.style.padding = "8px 10px";
      div.style.cursor = "pointer";

      div.addEventListener("mouseenter", () => {
        activeIndex = idx;
        highlightActive();
      });

      div.addEventListener("click", () => {
        // put country name in input so your /add route works (it matches by name)
        input.value = item.name;
        dropdown.style.display = "none";
      });

      dropdown.appendChild(div);
    });

    dropdown.style.display = "block";
  }

  function highlightActive() {
    const children = dropdown.querySelectorAll("div");
    children.forEach((c, i) => {
      c.style.background = i === activeIndex ? "#eee" : "#fff";
    });
  }

  let timer;
  input.addEventListener("input", () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 1) {
      dropdown.style.display = "none";
      return;
    }

    timer = setTimeout(async () => {
      try {
        const list = await fetchSuggestions(q);
        renderDropdown(list);
      } catch (e) {
        dropdown.style.display = "none";
      }
    }, 200);
  });

  input.addEventListener("keydown", (e) => {
    const children = dropdown.querySelectorAll("div");
    if (!children.length) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, children.length - 1);
      highlightActive();
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      highlightActive();
    }

    if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      input.value = items[activeIndex].name;
      dropdown.style.display = "none";
    }

    if (e.key === "Escape") {
      dropdown.style.display = "none";
    }
  });

  // close when clicking outside
  document.addEventListener("click", (e) => {
    if (!dropdown.contains(e.target) && e.target !== input) {
      dropdown.style.display = "none";
    }
  });
});
