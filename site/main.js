/*
 * Three progressive enhancements, no dependencies. Without JS the page is a
 * complete, readable document: the code blocks are plain (selectable) text,
 * there is simply no copy button, and the theme follows the OS.
 */
;(function () {
  "use strict"

  /* ----------------------------------------------------------- theme toggle
   *
   * Stoa's ThemeToggle, by hand. A chosen theme lands on <html data-theme>,
   * which the vendored tokens key on, and is restored before first paint by
   * the inline script in <head>. With no choice the OS preference applies. */

  var toggle = document.querySelector(".theme-toggle")
  if (toggle) {
    var prefersDark = window.matchMedia("(prefers-color-scheme: dark)")

    var isDark = function () {
      var chosen = document.documentElement.getAttribute("data-theme")
      return chosen ? chosen === "dark" : prefersDark.matches
    }

    var relabel = function () {
      toggle.setAttribute("aria-label", isDark() ? "Switch to light mode" : "Switch to dark mode")
    }

    toggle.addEventListener("click", function () {
      var next = isDark() ? "light" : "dark"
      document.documentElement.setAttribute("data-theme", next)
      try {
        localStorage.setItem("agora-theme", next)
      } catch (e) {
        /* Private mode or storage disabled: the choice still holds for this page. */
      }
      relabel()
    })

    prefersDark.addEventListener("change", relabel)
    relabel()
    toggle.hidden = false
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
