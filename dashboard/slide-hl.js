/* Sliding highlight: a pill that moves under the item the pointer (or keyboard focus) is on,
   and back to the current item when the pointer leaves. Same behaviour as the e-PP dashboard.
   Used by the left icon menu (.nav, current item = a.on, set by scrolling) and the segmented buttons (.seg). */
(function () {
  function slideHL(box, items, cur) {
    if (!box || box.classList.contains("hl-on")) return;
    var ind = document.createElement("span");
    ind.className = "shl";
    ind.setAttribute("aria-hidden", "true");
    box.insertBefore(ind, box.firstChild);
    box.classList.add("hl-on");
    var hov = null;
    function move(b, instant) {
      if (!b || !b.offsetWidth) { ind.style.opacity = "0"; return; }
      if (instant) ind.style.transition = "none";
      ind.style.opacity = "1";
      ind.style.width = b.offsetWidth + "px";
      ind.style.height = b.offsetHeight + "px";
      ind.style.transform = "translate(" + b.offsetLeft + "px," + b.offsetTop + "px)";
      if (instant) { void ind.offsetWidth; ind.style.transition = ""; }
    }
    function sync(instant) { move(hov || box.querySelector(cur), instant); }
    box.querySelectorAll(items).forEach(function (b) {
      b.addEventListener("mouseenter", function () { hov = b; box.classList.add("hl-hov"); sync(); });
      b.addEventListener("focus", function () { if (b.matches(":focus-visible")) { hov = b; box.classList.add("hl-hov"); sync(); } });
      b.addEventListener("blur", function () { if (hov === b) { hov = null; box.classList.remove("hl-hov"); sync(); } });
    });
    box.addEventListener("mouseleave", function () { hov = null; box.classList.remove("hl-hov"); sync(); });
    /* current item changes (class "on"), buttons shown/hidden, or the group itself shown */
    new MutationObserver(function () { sync(); }).observe(box, { subtree: true, attributes: true, attributeFilter: ["class", "hidden"] });
    if (window.ResizeObserver) new ResizeObserver(function () { sync(true); }).observe(box);
    addEventListener("resize", function () { sync(true); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { sync(true); });
    setTimeout(function () { sync(true); }, 0);
  }
  function init() {
    slideHL(document.querySelector(".nav"), "a", "a.on");
    document.querySelectorAll('.seg[role="group"]').forEach(function (g) { slideHL(g, "button", "button.on"); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
