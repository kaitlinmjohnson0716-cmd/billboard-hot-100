// Billboard Hot 100 report — full-screen "strum to enter" intro gate.
// Desktop + mouse only, by design: no touch/pointer-event handling here,
// and no mobile layout tuning. Entirely self-contained (reads css/style.css's
// --series-2 var for one color, but otherwise doesn't touch the rest of the
// page beyond locking scroll while it's shown).
(function () {
  "use strict";

  var SESSION_KEY = "billboardIntroSeen";

  try {
    if (sessionStorage.getItem(SESSION_KEY) === "1") return;
  } catch (e) {
    // sessionStorage unavailable (e.g. locked-down privacy mode) — show the
    // intro anyway rather than failing open or throwing.
  }

  var TITLE = "Billboard Hot 100 Report";
  var DIRECTIONS = "Click and drag across the strings to strum and enter.";
  var MIN_STRINGS_FOR_STRUM = 4;

  // Standard guitar tuning, low string to high string — rendered top to
  // bottom, matching how the strings sit when you look at a guitar you're
  // about to strum.
  var STRING_NOTES = [
    { name: "E2", freq: 82.41 },
    { name: "A2", freq: 110.0 },
    { name: "D3", freq: 146.83 },
    { name: "G3", freq: 196.0 },
    { name: "B3", freq: 246.94 },
    { name: "E4", freq: 329.63 },
  ];
  var STRING_WIDTHS = [4, 3.4, 2.9, 2.4, 2, 1.7];

  var VB_W = 300, VB_H = 380;
  var STRING_X1 = 66, STRING_X2 = 234;
  var STRING_Y_TOP = 172, STRING_Y_BOTTOM = 288;
  var STRING_Y_STEP = (STRING_Y_BOTTOM - STRING_Y_TOP) / (STRING_NOTES.length - 1);
  var HIT_TOLERANCE = 9; // viewBox units — generous, so strings are easy to hit

  function stringY(i) {
    return STRING_Y_TOP + i * STRING_Y_STEP;
  }

  // ---------------- Build the overlay DOM ----------------

  var gate = document.createElement("div");
  gate.className = "intro-gate";
  gate.id = "intro-gate";

  var skip = document.createElement("a");
  skip.href = "#";
  skip.className = "intro-gate__skip";
  skip.textContent = "Skip intro";

  var content = document.createElement("div");
  content.className = "intro-gate__content";

  var titleEl = document.createElement("p");
  titleEl.className = "intro-gate__title";
  titleEl.textContent = TITLE;

  var guitarWrap = document.createElement("div");
  guitarWrap.className = "intro-gate__guitar-wrap";

  var svgNS = "http://www.w3.org/2000/svg";
  var svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("class", "intro-gate__guitar");
  svg.setAttribute("viewBox", "0 0 " + VB_W + " " + VB_H);
  svg.setAttribute("role", "img");
  svg.setAttribute(
    "aria-label",
    "Stylized guitar. Click and drag across the strings to strum and enter the report."
  );

  function svgEl(tag, attrs) {
    var el = document.createElementNS(svgNS, tag);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }

  svg.appendChild(
    svgEl("path", {
      class: "intro-neck",
      d: "M135 0 h30 a5 5 0 0 1 5 5 v65 h-40 v-65 a5 5 0 0 1 5 -5 Z",
    })
  );

  svg.appendChild(
    svgEl("path", {
      class: "intro-body",
      d:
        "M150 60 C80 60 50 100 50 145 C50 180 75 195 85 220 C60 240 45 275 45 315 " +
        "C45 360 95 375 150 375 C205 375 255 360 255 315 C255 275 240 240 215 220 " +
        "C225 195 250 180 250 145 C250 100 220 60 150 60 Z",
    })
  );

  svg.appendChild(svgEl("circle", { class: "intro-hole", cx: "150", cy: "230", r: "58" }));

  var stringEls = STRING_NOTES.map(function (note, i) {
    var line = svgEl("line", {
      class: "intro-string",
      x1: STRING_X1,
      x2: STRING_X2,
      y1: stringY(i),
      y2: stringY(i),
      "stroke-width": STRING_WIDTHS[i],
    });
    svg.appendChild(line);
    return line;
  });

  var sweep = document.createElement("div");
  sweep.className = "intro-gate__sweep";
  sweep.setAttribute("aria-hidden", "true");
  sweep.textContent = "👇"; // a small hand pointing down, sweeping across the strings

  guitarWrap.appendChild(svg);
  guitarWrap.appendChild(sweep);

  var directions = document.createElement("p");
  directions.className = "intro-gate__directions";
  directions.textContent = DIRECTIONS;

  content.appendChild(titleEl);
  content.appendChild(guitarWrap);
  content.appendChild(directions);

  gate.appendChild(skip);
  gate.appendChild(content);
  document.body.insertBefore(gate, document.body.firstChild);

  // Lock the report underneath: no scroll, and nothing beneath the overlay
  // is reachable since the gate covers the full viewport.
  var prevHtmlOverflow = document.documentElement.style.overflow;
  var prevBodyOverflow = document.body.style.overflow;
  document.documentElement.style.overflow = "hidden";
  document.body.style.overflow = "hidden";

  // ---------------- Web Audio: Karplus-Strong plucked strings ----------------
  // Pure synthesis, no audio files: each note is rendered up front into an
  // AudioBuffer by filtering a burst of noise through a decaying feedback
  // loop (the classic Karplus-Strong plucked-string algorithm), then played
  // back like a sample whenever that string is struck.

  var audioCtx = null;
  var noteBuffers = null;

  function getAudioContext() {
    if (!audioCtx) {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      audioCtx = new Ctx();
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  function buildPluckBuffer(ctx, frequency, duration) {
    var sampleRate = ctx.sampleRate;
    var bufferSize = Math.max(2, Math.round(sampleRate / frequency));
    var totalSamples = Math.floor(sampleRate * duration);
    var ring = new Float32Array(bufferSize);
    for (var i = 0; i < bufferSize; i++) ring[i] = Math.random() * 2 - 1;
    var out = new Float32Array(totalSamples);
    var idx = 0;
    var damping = 0.994;
    for (var n = 0; n < totalSamples; n++) {
      var a = ring[idx];
      var b = ring[(idx + 1) % bufferSize];
      out[n] = a;
      ring[idx] = 0.5 * (a + b) * damping;
      idx = (idx + 1) % bufferSize;
    }
    var buffer = ctx.createBuffer(1, totalSamples, sampleRate);
    buffer.copyToChannel(out, 0);
    return buffer;
  }

  function ensureNoteBuffers() {
    var ctx = getAudioContext();
    if (!ctx || noteBuffers) return;
    noteBuffers = STRING_NOTES.map(function (note) {
      return buildPluckBuffer(ctx, note.freq, 1.6);
    });
  }

  function pluckString(i) {
    var ctx = getAudioContext();
    if (ctx && noteBuffers) {
      var src = ctx.createBufferSource();
      src.buffer = noteBuffers[i];
      var gainNode = ctx.createGain();
      gainNode.gain.value = 0.22;
      src.connect(gainNode).connect(ctx.destination);
      src.start();
    }
    triggerStringAnimation(i);
  }

  function triggerStringAnimation(i) {
    var el = stringEls[i];
    el.classList.remove("is-plucked");
    void el.getBoundingClientRect(); // force reflow so the animation can restart
    el.classList.add("is-plucked");
  }

  function playFullChord() {
    STRING_NOTES.forEach(function (note, i) {
      setTimeout(function () {
        pluckString(i);
      }, i * 24);
    });
  }

  // ---------------- Drag-to-strum interaction ----------------

  var dragging = false;
  var struckThisDrag = null; // Set of string indices struck during the current drag
  var stringActive = STRING_NOTES.map(function () {
    return false;
  });

  function clientToSvgY(clientX, clientY) {
    var ctm = svg.getScreenCTM();
    if (!ctm) return null;
    var pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    return pt.matrixTransform(ctm.inverse()).y;
  }

  function handleMove(clientX, clientY) {
    var y = clientToSvgY(clientX, clientY);
    if (y === null) return;
    STRING_NOTES.forEach(function (note, i) {
      var inBand = Math.abs(y - stringY(i)) <= HIT_TOLERANCE;
      if (inBand && !stringActive[i]) {
        stringActive[i] = true;
        struckThisDrag.add(i);
        pluckString(i);
      } else if (!inBand) {
        stringActive[i] = false;
      }
    });
  }

  function onPointerDown(e) {
    if (e.button !== 0 || finished) return;
    ensureNoteBuffers();
    dragging = true;
    struckThisDrag = new Set();
    stringActive = STRING_NOTES.map(function () {
      return false;
    });
    handleMove(e.clientX, e.clientY);
    window.addEventListener("mousemove", onPointerMove);
    window.addEventListener("mouseup", onPointerUp);
  }

  function onPointerMove(e) {
    if (!dragging) return;
    handleMove(e.clientX, e.clientY);
  }

  function onPointerUp() {
    if (!dragging) return;
    dragging = false;
    window.removeEventListener("mousemove", onPointerMove);
    window.removeEventListener("mouseup", onPointerUp);

    if (struckThisDrag.size >= MIN_STRINGS_FOR_STRUM) {
      succeed();
    } else {
      nudge();
    }
  }

  guitarWrap.addEventListener("mousedown", onPointerDown);

  function nudge() {
    directions.classList.remove("is-nudge");
    void directions.getBoundingClientRect();
    directions.classList.add("is-nudge");
  }

  // ---------------- Success / skip / cleanup ----------------

  var finished = false;

  function succeed() {
    if (finished) return;
    finished = true;
    ensureNoteBuffers();
    playFullChord();
    setTimeout(dismiss, 1000); // let the strings ring before fading out
  }

  function dismiss() {
    if (gate.classList.contains("is-leaving")) return;
    gate.classList.add("is-leaving");
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch (e) {
      // ignore — worst case the intro shows again next load
    }
    document.removeEventListener("keydown", onKeyDown);
    setTimeout(function () {
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.overflow = prevBodyOverflow;
      if (gate.parentNode) gate.parentNode.removeChild(gate);
    }, 820); // slightly longer than the 0.8s CSS fade so it fully completes
  }

  function onKeyDown(e) {
    if (e.key === "Enter" || e.key === "Escape") {
      e.preventDefault();
      dismiss();
    }
  }

  skip.addEventListener("click", function (e) {
    e.preventDefault();
    dismiss();
  });

  document.addEventListener("keydown", onKeyDown);
})();
