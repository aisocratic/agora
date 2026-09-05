/*
 * Three progressive enhancements, no dependencies. Without JS the page is a
 * complete, readable document: the code blocks are plain (selectable) text,
 * there is simply no copy button, and the theme defaults to dark.
 */
;(function () {
  "use strict"

  /* Theme preference cycles dark → light → system; all controls stay in sync. */
  var toggles = document.querySelectorAll(".theme-toggle")
  var prefersDark = window.matchMedia("(prefers-color-scheme: dark)")
  var preference = "dark"
  try {
    var saved = localStorage.getItem("agora-theme")
    if (["dark", "light", "system"].indexOf(saved) !== -1) preference = saved
  } catch (e) {}

  function applyTheme() {
    var resolved = preference === "system" ? (prefersDark.matches ? "dark" : "light") : preference
    document.documentElement.setAttribute("data-theme", resolved)
    var next = preference === "dark" ? "light" : preference === "light" ? "system" : "dark"
    toggles.forEach(function (toggle) {
      toggle.setAttribute("aria-label", "Theme: " + preference + ". Switch to " + next + " mode")
      toggle.title = "Theme: " + preference + ". Switch to " + next + " mode"
      toggle.hidden = false
    })
  }
  toggles.forEach(function (toggle) {
    toggle.addEventListener("click", function () {
      preference = preference === "dark" ? "light" : preference === "light" ? "system" : "dark"
      try { localStorage.setItem("agora-theme", preference) } catch (e) {}
      applyTheme()
    })
  })
  prefersDark.addEventListener("change", applyTheme)
  applyTheme()

  var menuToggle = document.getElementById("menu-toggle")
  var menu = document.getElementById("mobile-menu")
  var overlay = document.querySelector(".menu-overlay")
  function setMenu(open, restoreFocus) {
    menu.hidden = !open
    overlay.hidden = !open
    menuToggle.setAttribute("aria-expanded", String(open))
    menuToggle.setAttribute("aria-label", open ? "Close menu" : "Open menu")
    document.body.style.overflow = open ? "hidden" : ""
    if (restoreFocus) menuToggle.focus()
  }
  if (menuToggle && menu && overlay) {
    menuToggle.hidden = false
    menuToggle.addEventListener("click", function () { setMenu(menu.hidden, false) })
    overlay.addEventListener("click", function () { setMenu(false, true) })
    menu.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () { setMenu(false, false) })
    })
    document.addEventListener("keydown", function (event) {
      if (menu.hidden) return
      if (event.key === "Escape") { event.preventDefault(); setMenu(false, true) }
      if (event.key === "Tab") {
        var focusable = Array.from(document.querySelectorAll(".site-header a, .site-header button, .mobile-menu a")).filter(function (element) { return element.getClientRects().length })
        var first = focusable[0]
        var last = focusable[focusable.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }
    })
    window.matchMedia("(min-width: 64rem)").addEventListener("change", function (event) {
      if (event.matches) setMenu(false, false)
    })
  }

  /* ------------------------------------------------------------- JSON tint
   *
   * The plan output is the longest block on the page, and unhighlighted JSON at
   * this length reads as a wall. Hand-writing the spans in the HTML would bury
   * the content, so the markup stays plain text and gets tinted here. The input
   * is our own static content, but it is escaped anyway on principle. */

  function escapeHtml(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  }

  var TOKEN = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?)/g

  function highlightJson(text) {
    return escapeHtml(text).replace(TOKEN, function (match, str, colon, word, num) {
      if (str) {
        if (colon) {
          return '<span class="j-key">' + str + '</span><span class="j-punc">' + colon + "</span>"
        }
        return '<span class="j-str">' + str + "</span>"
      }
      if (word) return '<span class="j-bool">' + word + "</span>"
      return '<span class="j-num">' + num + "</span>"
    })
  }

  var blocks = document.querySelectorAll("code.language-json")
  for (var i = 0; i < blocks.length; i++) {
    blocks[i].innerHTML = highlightJson(blocks[i].textContent)
  }

  /* ------------------------------------------------------------ copy button
   *
   * Only rendered when the clipboard API is actually available, so a browser
   * that would fail the click never shows the affordance. */

  if (!navigator.clipboard || !navigator.clipboard.writeText) return

  var figures = document.querySelectorAll("figure.code[data-copy]")

  Array.prototype.forEach.call(figures, function (figure) {
    var head = figure.querySelector(".code-head")
    var source = figure.querySelector("pre code")
    if (!head || !source) return

    var button = document.createElement("button")
    button.type = "button"
    button.className = "copy-btn"
    button.textContent = "Copy"
    button.setAttribute("aria-label", "Copy this snippet to the clipboard")

    var reset

    button.addEventListener("click", function () {
      navigator.clipboard.writeText(source.textContent).then(
        function () {
          button.textContent = "Copied"
        },
        function () {
          button.textContent = "Press ⌘C"
        },
      )
      window.clearTimeout(reset)
      reset = window.setTimeout(function () {
        button.textContent = "Copy"
      }, 1800)
    })

    head.appendChild(button)
  })
})()
