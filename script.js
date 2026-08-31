/* ============================================================
   FileFlux — script.js
   Author: Avinash Walton
   All conversions run 100% in the browser. Zero server calls.
   ============================================================ */

"use strict";

/* PDF.js worker — set early, also reset inside DOMContentLoaded */
if (typeof pdfjsLib !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

/* ============================================================
   WAIT FOR DOM BEFORE DOING ANYTHING
   ============================================================ */
document.addEventListener("DOMContentLoaded", function () {

  /* Re-confirm PDF.js worker after DOM ready */
  if (typeof pdfjsLib !== "undefined") {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }

  /* ==========================================================
     UTILITIES
     ========================================================== */

  function showToast(msg, type, duration) {
    type = type || "info";
    duration = duration || 3000;
    var t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg;
    t.className = "toast show " + type;
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.className = "toast"; }, duration);
  }

  function setProgress(fillId, statusId, pct, msg) {
    var fill   = document.getElementById(fillId);
    var status = document.getElementById(statusId);
    if (fill)   fill.style.width = pct + "%";
    if (status) status.textContent = msg || "";
  }

  function triggerDownload(url, filename) {
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      document.body.removeChild(a);
      if (url.startsWith("blob:")) URL.revokeObjectURL(url);
    }, 1000);
  }

  function loadImageFromFile(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function (e) {
        var img = new Image();
        img.onload = function () { resolve(img); };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function canvasToBlob(canvas, mimeType, quality) {
    return new Promise(function (resolve) {
      canvas.toBlob(resolve, mimeType, quality);
    });
  }

  function basename(filename) {
    return filename.replace(/\.[^/.]+$/, "");
  }

  function formatBytes(bytes) {
    if (bytes < 1024)           return bytes + " B";
    if (bytes < 1024 * 1024)    return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  }

  /* ==========================================================
     DROP ZONE SETUP
     ========================================================== */

  function setupDropZone(dzId, inputId, onFile, opts) {
    opts = opts || {};
    var multiple = opts.multiple || false;
    var dz    = document.getElementById(dzId);
    var input = document.getElementById(inputId);
    if (!dz || !input) return;

    dz.addEventListener("dragover", function (e) {
      e.preventDefault();
      dz.classList.add("dragover");
    });
    dz.addEventListener("dragleave", function () { dz.classList.remove("dragover"); });
    dz.addEventListener("drop", function (e) {
      e.preventDefault();
      dz.classList.remove("dragover");
      var files = multiple ? Array.from(e.dataTransfer.files) : [e.dataTransfer.files[0]];
      if (files[0]) onFile(multiple ? files : files[0]);
    });
    input.addEventListener("change", function () {
      if (!input.files.length) return;
      var files = multiple ? Array.from(input.files) : input.files[0];
      onFile(files);
    });
  }

  function markDropZone(dzId, fileName) {
    var dz = document.getElementById(dzId);
    if (!dz) return;
    dz.classList.add("has-file");
    var hint = dz.querySelector(".dz-hint");
    if (hint) hint.textContent = "OK  " + fileName;
  }

  /* ==========================================================
     TABS
     ========================================================== */
  (function initTabs() {
    var allTabBtns   = document.querySelectorAll(".tab-btn");
    var allTabPanels = document.querySelectorAll(".tab-panel");

    function activateTab(tabBtn) {
      allTabBtns.forEach(function (tb) {
        tb.classList.remove("active");
        tb.setAttribute("aria-selected", "false");
      });
      allTabPanels.forEach(function (tp) {
        tp.classList.remove("active");
      });
      tabBtn.classList.add("active");
      tabBtn.setAttribute("aria-selected", "true");
      var panelId = "tab-" + tabBtn.getAttribute("data-tab");
      var panel   = document.getElementById(panelId);
      if (panel) {
        panel.classList.add("active");
        panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }

    allTabBtns.forEach(function (tabBtn) {
      tabBtn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        activateTab(tabBtn);
      });
    });

    /* Activate the default active tab on load */
    var defaultBtn = document.querySelector(".tab-btn.active");
    if (defaultBtn) activateTab(defaultBtn);
  })();

  /* ==========================================================
     HAMBURGER MENU
     ========================================================== */
  var hamburgerEl = document.getElementById("hamburger");
  var mobileNavEl = document.getElementById("mobileNav");
  if (hamburgerEl) {
    hamburgerEl.addEventListener("click", function () {
      var isOpen = hamburgerEl.classList.toggle("open");
      hamburgerEl.setAttribute("aria-expanded", isOpen);
      if (mobileNavEl) {
        mobileNavEl.classList.toggle("open", isOpen);
        mobileNavEl.setAttribute("aria-hidden", !isOpen);
      }
    });
  }
  if (mobileNavEl) {
    mobileNavEl.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () {
        if (hamburgerEl) hamburgerEl.classList.remove("open");
        mobileNavEl.classList.remove("open");
        mobileNavEl.setAttribute("aria-hidden", "true");
      });
    });
  }

  /* Footer year */
  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ==========================================================
     1. PNG -> JPG
     ========================================================== */
  (function () {
    var _file       = null;
    var qualSlider  = document.getElementById("q-png2jpg");
    var qualValEl   = document.getElementById("q-png2jpg-val");
    var bgInput     = document.getElementById("bg-png2jpg");
    var convertBtn  = document.getElementById("btn-png2jpg");
    var prevArea    = document.getElementById("prev-png2jpg");

    if (!convertBtn) return;

    if (qualSlider) {
      qualSlider.addEventListener("input", function () {
        if (qualValEl) qualValEl.textContent = qualSlider.value;
      });
    }

    setupDropZone("dz-png2jpg", "file-png2jpg", function (file) {
      if (!file || !file.type.includes("png")) {
        showToast("Please select a PNG file.", "error"); return;
      }
      _file = file;
      markDropZone("dz-png2jpg", file.name);
      convertBtn.disabled = false;
      if (prevArea) {
        prevArea.innerHTML = "";
        var img = document.createElement("img");
        img.src = URL.createObjectURL(file);
        prevArea.appendChild(img);
      }
    });

    convertBtn.addEventListener("click", async function () {
      if (!_file) return;
      try {
        convertBtn.disabled = true;
        convertBtn.textContent = "Converting...";
        var img    = await loadImageFromFile(_file);
        var canvas = document.createElement("canvas");
        canvas.width  = img.naturalWidth;
        canvas.height = img.naturalHeight;
        var ctx = canvas.getContext("2d");
        ctx.fillStyle = bgInput ? bgInput.value : "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        var quality = qualSlider ? parseInt(qualSlider.value) / 100 : 0.92;
        var blob    = await canvasToBlob(canvas, "image/jpeg", quality);
        triggerDownload(URL.createObjectURL(blob), basename(_file.name) + ".jpg");
        showToast("JPG downloaded!", "success");
      } catch (err) {
        showToast("Conversion failed: " + err.message, "error");
      } finally {
        convertBtn.disabled = false;
        convertBtn.textContent = "Convert & Download JPG";
      }
    });
  })();

  /* ==========================================================
     2. JPG -> PNG
     ========================================================== */
  (function () {
    var _file      = null;
    var convertBtn = document.getElementById("btn-jpg2png");
    var prevArea   = document.getElementById("prev-jpg2png");

    if (!convertBtn) return;

    setupDropZone("dz-jpg2png", "file-jpg2png", function (file) {
      if (!file || (!file.type.includes("jpeg") && !file.type.includes("jpg"))) {
        showToast("Please select a JPG file.", "error"); return;
      }
      _file = file;
      markDropZone("dz-jpg2png", file.name);
      convertBtn.disabled = false;
      if (prevArea) {
        prevArea.innerHTML = "";
        var img = document.createElement("img");
        img.src = URL.createObjectURL(file);
        prevArea.appendChild(img);
      }
    });

    convertBtn.addEventListener("click", async function () {
      if (!_file) return;
      try {
        convertBtn.disabled = true;
        convertBtn.textContent = "Converting...";
        var img    = await loadImageFromFile(_file);
        var canvas = document.createElement("canvas");
        canvas.width  = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext("2d").drawImage(img, 0, 0);
        var blob = await canvasToBlob(canvas, "image/png");
        triggerDownload(URL.createObjectURL(blob), basename(_file.name) + ".png");
        showToast("PNG downloaded!", "success");
      } catch (err) {
        showToast("Conversion failed: " + err.message, "error");
      } finally {
        convertBtn.disabled = false;
        convertBtn.textContent = "Convert & Download PNG";
      }
    });
  })();

  /* ==========================================================
     3. PDF -> Image (PDF.js)
     ========================================================== */
  (function () {
    var _file        = null;
    var scaleSlider  = document.getElementById("scale-pdf2img");
    var scaleValEl   = document.getElementById("scale-pdf2img-val");
    var convertBtn   = document.getElementById("btn-pdf2img");
    var prevArea     = document.getElementById("prev-pdf2img");
    var progressWrap = document.getElementById("pdf2img-progress");

    if (!convertBtn) return;

    if (scaleSlider) {
      scaleSlider.addEventListener("input", function () {
        if (scaleValEl) scaleValEl.textContent = scaleSlider.value + "x";
      });
    }

    setupDropZone("dz-pdf2img", "file-pdf2img", function (file) {
      if (!file || file.type !== "application/pdf") {
        showToast("Selecione um arquivo PDF.", "error"); return;
      }
      _file = file;
      markDropZone("dz-pdf2img", file.name);
      convertBtn.disabled = false;
      if (prevArea) prevArea.innerHTML = "";
    });

    convertBtn.addEventListener("click", async function () {
      if (!_file || typeof pdfjsLib === "undefined") {
        showToast("PDF.js not loaded. Check your connection.", "error"); return;
      }
      try {
        convertBtn.disabled = true;
        convertBtn.textContent = "Processando...";
        if (progressWrap) progressWrap.hidden = false;
        if (prevArea) prevArea.innerHTML = "";

        var ab    = await _file.arrayBuffer();
        var pdf   = await pdfjsLib.getDocument({ data: ab }).promise;
        var total = pdf.numPages;
        var scale = parseFloat(scaleSlider ? scaleSlider.value : 2);

        for (var i = 1; i <= total; i++) {
          setProgress("pdf2img-fill", "pdf2img-status",
            Math.round((i / total) * 100), "Page " + i + "/" + total + "...");
          var page     = await pdf.getPage(i);
          var viewport = page.getViewport({ scale: scale });
          var canvas   = document.createElement("canvas");
          canvas.width  = viewport.width;
          canvas.height = viewport.height;
          await page.render({ canvasContext: canvas.getContext("2d"), viewport: viewport }).promise;
          var blob = await canvasToBlob(canvas, "image/png");
          var url  = URL.createObjectURL(blob);
          if (prevArea) {
            var thumb = document.createElement("img");
            thumb.src   = url;
            thumb.title = "Page " + i;
            prevArea.appendChild(thumb);
          }
          triggerDownload(url, basename(_file.name) + "_page" + i + ".png");
          await new Promise(function (r) { setTimeout(r, 300); });
        }
        showToast(total + " page(s) downloaded!", "success");
      } catch (err) {
        showToast("PDF error: " + err.message, "error");
      } finally {
        convertBtn.disabled = false;
        convertBtn.textContent = "Convert Pages to PNG";
        if (progressWrap) progressWrap.hidden = true;
      }
    });
  })();

  /* ==========================================================
     4. Image -> PDF (jsPDF)
     ========================================================== */
  (function () {
    var _files     = [];
    var convertBtn = document.getElementById("btn-img2pdf");
    var prevArea   = document.getElementById("prev-img2pdf");

    if (!convertBtn) return;

    setupDropZone("dz-img2pdf", "file-img2pdf", function (files) {
      _files = files.filter(function (f) { return f.type.startsWith("image/"); });
      if (!_files.length) { showToast("No valid images selected.", "error"); return; }
      markDropZone("dz-img2pdf", _files.length + " file(s) selected");
      convertBtn.disabled = false;
      if (prevArea) {
        prevArea.innerHTML = "";
        _files.forEach(function (f) {
          var img = document.createElement("img");
          img.src = URL.createObjectURL(f);
          prevArea.appendChild(img);
        });
      }
    }, { multiple: true });

    convertBtn.addEventListener("click", async function () {
      if (!_files.length || typeof jspdf === "undefined") {
        showToast("jsPDF not loaded. Check your connection.", "error"); return;
      }
      try {
        convertBtn.disabled = true;
        convertBtn.textContent = "Generating PDF...";
        var { jsPDF } = jspdf;
        var pdf = null;
        for (var i = 0; i < _files.length; i++) {
          var imgEl = await loadImageFromFile(_files[i]);
          var w = imgEl.naturalWidth, h = imgEl.naturalHeight;
          var orient = w > h ? "l" : "p";
          if (i === 0) {
            pdf = new jsPDF({ orientation: orient, unit: "px", format: [w, h] });
          } else {
            pdf.addPage([w, h], orient);
          }
          var canvas = document.createElement("canvas");
          canvas.width = w; canvas.height = h;
          canvas.getContext("2d").drawImage(imgEl, 0, 0);
          pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, w, h);
        }
        pdf.save("images_to_pdf.pdf");
        showToast("PDF downloaded!", "success");
      } catch (err) {
        showToast("PDF generation failed: " + err.message, "error");
      } finally {
        convertBtn.disabled = false;
        convertBtn.textContent = "Convert to PDF & Download";
      }
    });
  })();

  /* ==========================================================
     5. Text -> Image
     ========================================================== */
  (function () {
    var textarea   = document.getElementById("txt2img-text");
    var fontSel    = document.getElementById("txt2img-font");
    var fontSizeEl = document.getElementById("txt2img-size");
    var colorEl    = document.getElementById("txt2img-color");
    var bgEl       = document.getElementById("txt2img-bg");
    var canvasWEl  = document.getElementById("txt2img-w");
    var paddingEl  = document.getElementById("txt2img-pad");
    var prevArea   = document.getElementById("prev-txt2img");
    var btnPrev    = document.getElementById("btn-txt2img-preview");
    var btnDl      = document.getElementById("btn-txt2img-dl");

    function renderCanvas() {
      var text    = textarea ? textarea.value : "";
      var font    = fontSel  ? fontSel.value  : "sans-serif";
      var size    = parseInt(fontSizeEl ? fontSizeEl.value : 28) || 28;
      var color   = colorEl  ? colorEl.value  : "#111111";
      var bg      = bgEl     ? bgEl.value     : "#ffffff";
      var width   = Math.min(parseInt(canvasWEl ? canvasWEl.value : 800) || 800, 4000);
      var pad     = parseInt(paddingEl ? paddingEl.value : 40) || 40;

      var canvas  = document.createElement("canvas");
      var ctx     = canvas.getContext("2d");
      ctx.font    = size + "px " + font;

      var usableW = width - pad * 2;
      var lines   = [];
      text.split("\n").forEach(function (rawLine) {
        if (!rawLine.trim()) { lines.push(""); return; }
        var words = rawLine.split(" ");
        var cur   = "";
        words.forEach(function (word) {
          var test = cur ? cur + " " + word : word;
          if (ctx.measureText(test).width > usableW && cur) {
            lines.push(cur); cur = word;
          } else { cur = test; }
        });
        if (cur) lines.push(cur);
      });

      var lineH  = size * 1.5;
      var height = pad * 2 + lines.length * lineH;
      canvas.width  = width;
      canvas.height = height;
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle    = color;
      ctx.font         = size + "px " + font;
      ctx.textBaseline = "top";
      lines.forEach(function (line, idx) {
        ctx.fillText(line, pad, pad + idx * lineH);
      });
      return canvas;
    }

    if (btnPrev) {
      btnPrev.addEventListener("click", function () {
        var canvas = renderCanvas();
        if (prevArea) {
          prevArea.innerHTML = "";
          canvas.style.maxWidth = "100%";
          prevArea.appendChild(canvas);
        }
      });
    }

    if (btnDl) {
      btnDl.addEventListener("click", async function () {
        if (!textarea || !textarea.value.trim()) {
          showToast("Please enter some text first.", "error"); return;
        }
        var canvas = renderCanvas();
        var blob   = await canvasToBlob(canvas, "image/png");
        triggerDownload(URL.createObjectURL(blob), "text_image.png");
        showToast("Image downloaded!", "success");
      });
    }
  })();

  /* ==========================================================
     6. Image -> Text (OCR — Tesseract.js)
     ========================================================== */
  (function () {
    var _file        = null;
    var convertBtn   = document.getElementById("btn-img2txt");
    var langSel      = document.getElementById("img2txt-lang");
    var prevArea     = document.getElementById("prev-img2txt");
    var progressWrap = document.getElementById("ocr-progress");
    var resultWrap   = document.getElementById("ocr-result-wrap");
    var resultTA     = document.getElementById("ocr-result");
    var btnCopy      = document.getElementById("btn-copy-ocr");
    var btnDl        = document.getElementById("btn-dl-ocr");

    if (!convertBtn) return;

    setupDropZone("dz-img2txt", "file-img2txt", function (file) {
      if (!file || !file.type.startsWith("image/")) {
        showToast("Please select a valid image.", "error"); return;
      }
      _file = file;
      markDropZone("dz-img2txt", file.name);
      convertBtn.disabled = false;
      if (resultWrap) resultWrap.hidden = true;
      if (prevArea) {
        prevArea.innerHTML = "";
        var img = document.createElement("img");
        img.src = URL.createObjectURL(file);
        prevArea.appendChild(img);
      }
    });

    convertBtn.addEventListener("click", async function () {
      if (!_file || typeof Tesseract === "undefined") {
        showToast("Tesseract.js not loaded. Check your connection.", "error"); return;
      }
      try {
        convertBtn.disabled = true;
        convertBtn.textContent = "Extracting...";
        if (progressWrap) progressWrap.hidden = false;
        if (resultWrap) resultWrap.hidden = true;

        var lang   = langSel ? langSel.value : "eng";
        var result = await Tesseract.recognize(_file, lang, {
          logger: function (m) {
            if (m.status === "recognizing text") {
              var pct = Math.round(m.progress * 100);
              setProgress("ocr-fill", "ocr-status", pct, "Recognizing... " + pct + "%");
            } else {
              setProgress("ocr-fill", "ocr-status", 10, m.status + "...");
            }
          }
        });
        if (resultTA) resultTA.value = result.data.text;
        if (resultWrap) resultWrap.hidden = false;
        showToast("Text extracted!", "success");
      } catch (err) {
        showToast("Falha no OCR: " + err.message, "error");
      } finally {
        convertBtn.disabled = false;
        convertBtn.textContent = "Extrair Texto";
        if (progressWrap) progressWrap.hidden = true;
      }
    });

    if (btnCopy) {
      btnCopy.addEventListener("click", function () {
        if (resultTA) navigator.clipboard.writeText(resultTA.value);
        showToast("Texto copiado!", "info");
      });
    }
    if (btnDl) {
      btnDl.addEventListener("click", function () {
        if (!resultTA) return;
        var blob = new Blob([resultTA.value], { type: "text/plain" });
        triggerDownload(URL.createObjectURL(blob), "extracted_text.txt");
        showToast("Arquivo de texto baixado!", "success");
      });
    }
  })();

  /* ==========================================================
     7. PDF -> Text (PDF.js)
     ========================================================== */
  (function () {
    var _file        = null;
    var convertBtn   = document.getElementById("btn-pdf2txt");
    var progressWrap = document.getElementById("pdf2txt-progress");
    var resultWrap   = document.getElementById("pdf2txt-result-wrap");
    var resultTA     = document.getElementById("pdf2txt-result");
    var btnCopy      = document.getElementById("btn-copy-pdf2txt");
    var btnDl        = document.getElementById("btn-dl-pdf2txt");

    if (!convertBtn) return;

    setupDropZone("dz-pdf2txt", "file-pdf2txt", function (file) {
      if (!file || file.type !== "application/pdf") {
        showToast("Please select a PDF file.", "error"); return;
      }
      _file = file;
      markDropZone("dz-pdf2txt", file.name);
      convertBtn.disabled = false;
      if (resultWrap) resultWrap.hidden = true;
    });

    convertBtn.addEventListener("click", async function () {
      if (!_file || typeof pdfjsLib === "undefined") {
        showToast("PDF.js não foi carregado. Verifique sua conexão.", "error"); return;
      }
      try {
        convertBtn.disabled = true;
        convertBtn.textContent = "Extracting...";
        if (progressWrap) progressWrap.hidden = false;

        var ab    = await _file.arrayBuffer();
        var pdf   = await pdfjsLib.getDocument({ data: ab }).promise;
        var total = pdf.numPages;
        var full  = "";

        for (var i = 1; i <= total; i++) {
          setProgress("pdf2txt-fill", "pdf2txt-status",
            Math.round((i / total) * 100), "Página " + i + "/" + total + "...");
          var page    = await pdf.getPage(i);
          var content = await page.getTextContent();
          var text    = content.items.map(function (item) { return item.str; }).join(" ");
          full += "--- Page " + i + " ---\n" + text + "\n\n";
        }

        if (resultTA) resultTA.value = full.trim();
        if (resultWrap) resultWrap.hidden = false;
        showToast("Texto extraído!", "success");
      } catch (err) {
        showToast("Extraction failed: " + err.message, "error");
      } finally {
        convertBtn.disabled = false;
        convertBtn.textContent = "Extract Text";
        if (progressWrap) progressWrap.hidden = true;
      }
    });

    if (btnCopy) {
      btnCopy.addEventListener("click", function () {
        if (resultTA) navigator.clipboard.writeText(resultTA.value);
        showToast("Copied to clipboard!", "info");
      });
    }
    if (btnDl) {
      btnDl.addEventListener("click", function () {
        if (!resultTA) return;
        var blob = new Blob([resultTA.value], { type: "text/plain" });
        triggerDownload(URL.createObjectURL(blob), "pdf_text.txt");
        showToast("Text file downloaded!", "success");
      });
    }
  })();

  /* ==========================================================
     8. Text -> PDF (jsPDF)
     ========================================================== */
  (function () {
    var convertBtn  = document.getElementById("btn-txt2pdf");
    var titleInput  = document.getElementById("txt2pdf-title");
    var contentTA   = document.getElementById("txt2pdf-text");
    var sizeInput   = document.getElementById("txt2pdf-size");
    var pageSelect  = document.getElementById("txt2pdf-page");
    var colorInput  = document.getElementById("txt2pdf-color");

    if (!convertBtn) return;

    convertBtn.addEventListener("click", function () {
      if (typeof jspdf === "undefined") {
        showToast("jsPDF not loaded. Check your connection.", "error"); return;
      }
      var text = contentTA ? contentTA.value.trim() : "";
      if (!text) { showToast("Please enter some content.", "error"); return; }

      try {
        convertBtn.disabled = true;
        convertBtn.textContent = "Generating...";
        var { jsPDF }  = jspdf;
        var pageSize   = pageSelect ? pageSelect.value : "a4";
        var fontSize   = parseInt(sizeInput ? sizeInput.value : 12) || 12;
        var hexColor   = colorInput ? colorInput.value : "#111111";
        var r = parseInt(hexColor.slice(1,3), 16);
        var g = parseInt(hexColor.slice(3,5), 16);
        var b = parseInt(hexColor.slice(5,7), 16);

        var pdf    = new jsPDF({ unit: "mm", format: pageSize });
        var pw     = pdf.internal.pageSize.getWidth();
        var ph     = pdf.internal.pageSize.getHeight();
        var margin = 18;
        var usable = pw - margin * 2;
        var y      = margin;

        pdf.setFontSize(fontSize);
        pdf.setTextColor(r, g, b);

        var title = titleInput ? titleInput.value.trim() : "";
        if (title) {
          pdf.setFontSize(fontSize + 6);
          pdf.setFont("helvetica", "bold");
          pdf.text(title, margin, y);
          y += 12;
          pdf.setFontSize(fontSize);
          pdf.setFont("helvetica", "normal");
        }

        var lineH = fontSize * 0.4 + 1.5;
        var lines = pdf.splitTextToSize(text, usable);
        lines.forEach(function (line) {
          if (y + lineH > ph - margin) { pdf.addPage(); y = margin; }
          pdf.text(line, margin, y);
          y += lineH;
        });

        var filename = (title || "document").replace(/[^a-z0-9]/gi, "_").toLowerCase() + ".pdf";
        pdf.save(filename);
        showToast("PDF downloaded!", "success");
      } catch (err) {
        showToast("PDF generation failed: " + err.message, "error");
      } finally {
        convertBtn.disabled = false;
        convertBtn.textContent = "Generate & Download PDF";
      }
    });
  })();

  /* ==========================================================
     9. Image Resizer
     ========================================================== */
  (function () {
    var _file      = null;
    var _origW     = 0;
    var _origH     = 0;
    var wInput     = document.getElementById("resize-w");
    var hInput     = document.getElementById("resize-h");
    var lockCB     = document.getElementById("resize-lock");
    var fmtSel     = document.getElementById("resize-fmt");
    var convertBtn = document.getElementById("btn-resize");
    var prevArea   = document.getElementById("prev-resize");
    var infoEl     = document.getElementById("resize-info");

    if (!convertBtn) return;

    setupDropZone("dz-resize", "file-resize", async function (file) {
      if (!file || !file.type.startsWith("image/")) {
        showToast("Please select a valid image.", "error"); return;
      }
      _file = file;
      var img = await loadImageFromFile(file);
      _origW = img.naturalWidth;
      _origH = img.naturalHeight;
      if (wInput) wInput.value = _origW;
      if (hInput) hInput.value = _origH;
      if (infoEl) { infoEl.textContent = "Original: " + _origW + " x " + _origH + "px - " + formatBytes(file.size); infoEl.style.display = "inline-block"; }
      markDropZone("dz-resize", file.name);
      convertBtn.disabled = false;
      if (prevArea) {
        prevArea.innerHTML = "";
        var thumb = document.createElement("img");
        thumb.src = URL.createObjectURL(file);
        prevArea.appendChild(thumb);
      }
    });

    if (wInput) {
      wInput.addEventListener("input", function () {
        if (lockCB && lockCB.checked && _origH) {
          if (hInput) hInput.value = Math.round(parseInt(wInput.value) * (_origH / _origW));
        }
      });
    }
    if (hInput) {
      hInput.addEventListener("input", function () {
        if (lockCB && lockCB.checked && _origW) {
          if (wInput) wInput.value = Math.round(parseInt(hInput.value) * (_origW / _origH));
        }
      });
    }

    convertBtn.addEventListener("click", async function () {
      if (!_file) return;
      try {
        convertBtn.disabled = true;
        convertBtn.textContent = "Redimensionando...";
        var img    = await loadImageFromFile(_file);
        var w      = parseInt(wInput ? wInput.value : _origW) || _origW;
        var h      = parseInt(hInput ? hInput.value : _origH) || _origH;
        var canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        var mime = fmtSel ? fmtSel.value : "image/png";
        var ext  = mime.split("/")[1];
        var blob = await canvasToBlob(canvas, mime, 0.92);
        triggerDownload(URL.createObjectURL(blob), basename(_file.name) + "_" + w + "x" + h + "." + ext);
        showToast("Resized to " + w + "x" + h + " and downloaded!", "success");
      } catch (err) {
        showToast("Resize failed: " + err.message, "error");
      } finally {
        convertBtn.disabled = false;
        convertBtn.textContent = "Resize & Download";
      }
    });
  })();

  /* ==========================================================
     10. Image Compressor
     ========================================================== */
  (function () {
    var _file      = null;
    var qSlider    = document.getElementById("q-compress");
    var qValEl     = document.getElementById("q-compress-val");
    var convertBtn = document.getElementById("btn-compress");
    var prevArea   = document.getElementById("prev-compress");
    var statsEl    = document.getElementById("compress-stats");

    if (!convertBtn) return;

    if (qSlider) {
      qSlider.addEventListener("input", function () {
        if (qValEl) qValEl.textContent = qSlider.value;
      });
    }

    setupDropZone("dz-compress", "file-compress", function (file) {
      if (!file || !file.type.startsWith("image/")) {
        showToast("Selecione uma imagem válida.", "error"); return;
      }
      _file = file;
      markDropZone("dz-compress", file.name);
      convertBtn.disabled = false;
      if (statsEl) statsEl.hidden = true;
      if (prevArea) {
        prevArea.innerHTML = "";
        var img = document.createElement("img");
        img.src = URL.createObjectURL(file);
        prevArea.appendChild(img);
      }
    });

    convertBtn.addEventListener("click", async function () {
      if (!_file) return;
      try {
        convertBtn.disabled = true;
        convertBtn.textContent = "Comprimindo...";
        var img     = await loadImageFromFile(_file);
        var canvas  = document.createElement("canvas");
        canvas.width  = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext("2d").drawImage(img, 0, 0);
        var quality = parseInt(qSlider ? qSlider.value : 80) / 100;
        var blob    = await canvasToBlob(canvas, "image/jpeg", quality);
        var saved   = _file.size - blob.size;
        var pct     = Math.round((saved / _file.size) * 100);
        if (statsEl) {
          statsEl.textContent = "Original: " + formatBytes(_file.size) + "  =>  Compressed: " + formatBytes(blob.size) + " (" + (pct > 0 ? "-" : "+") + Math.abs(pct) + "%)";
          statsEl.hidden = false;
        }
        triggerDownload(URL.createObjectURL(blob), basename(_file.name) + "_compressed.jpg");
        showToast("Comprimido e baixado!", "success");
      } catch (err) {
        showToast("Falha na compressão: " + err.message, "error");
      } finally {
        convertBtn.disabled = false;
        convertBtn.textContent = "Compress & Download";
      }
    });
  })();

  /* ==========================================================
     11. Merge Images
     ========================================================== */
  (function () {
    var _files     = [];
    var convertBtn = document.getElementById("btn-merge");
    var dirSel     = document.getElementById("merge-dir");
    var gapInput   = document.getElementById("merge-gap");
    var gapColor   = document.getElementById("merge-gap-color");
    var prevArea   = document.getElementById("prev-merge");

    if (!convertBtn) return;

    setupDropZone("dz-merge", "file-merge", function (files) {
      _files = files.filter(function (f) { return f.type.startsWith("image/"); });
      if (_files.length < 2) { showToast("Please select at least 2 images.", "error"); return; }
      markDropZone("dz-merge", _files.length + " images selected");
      convertBtn.disabled = false;
      if (prevArea) {
        prevArea.innerHTML = "";
        _files.forEach(function (f) {
          var img = document.createElement("img");
          img.src = URL.createObjectURL(f);
          prevArea.appendChild(img);
        });
      }
    }, { multiple: true });

    convertBtn.addEventListener("click", async function () {
      if (_files.length < 2) return;
      try {
        convertBtn.disabled = true;
        convertBtn.textContent = "Merging...";
        var dir    = dirSel    ? dirSel.value    : "vertical";
        var gap    = parseInt(gapInput  ? gapInput.value  : 0) || 0;
        var gColor = gapColor  ? gapColor.value  : "#ffffff";
        var images = await Promise.all(_files.map(loadImageFromFile));

        var totalW, totalH;
        if (dir === "vertical") {
          totalW = Math.max.apply(null, images.map(function (i) { return i.naturalWidth; }));
          totalH = images.reduce(function (s, i) { return s + i.naturalHeight; }, 0) + gap * (images.length - 1);
        } else {
          totalW = images.reduce(function (s, i) { return s + i.naturalWidth; }, 0) + gap * (images.length - 1);
          totalH = Math.max.apply(null, images.map(function (i) { return i.naturalHeight; }));
        }

        var canvas = document.createElement("canvas");
        canvas.width = totalW; canvas.height = totalH;
        var ctx = canvas.getContext("2d");
        ctx.fillStyle = gColor;
        ctx.fillRect(0, 0, totalW, totalH);

        var offset = 0;
        images.forEach(function (img) {
          if (dir === "vertical") {
            ctx.drawImage(img, 0, offset);
            offset += img.naturalHeight + gap;
          } else {
            ctx.drawImage(img, offset, 0);
            offset += img.naturalWidth + gap;
          }
        });

        var blob = await canvasToBlob(canvas, "image/png");
        triggerDownload(URL.createObjectURL(blob), "merged_image.png");
        showToast("Merged image downloaded!", "success");
      } catch (err) {
        showToast("Merge failed: " + err.message, "error");
      } finally {
        convertBtn.disabled = false;
        convertBtn.textContent = "Merge & Download PNG";
      }
    });
  })();

  /* ==========================================================
     12. PDF RESIZER
     Changes page DIMENSIONS only (A4/A3/Letter/Legal/Custom).
     Content is scaled to fit the new page size.
     File storage size is NOT the goal — use PDF Compressor for that.
     ========================================================== */
  (function () {
    var PAGE_SIZES = {
      a4:     [210,    297],
      a3:     [297,    420],
      a5:     [148,    210],
      b5:     [176,    250],
      letter: [215.9,  279.4],
      legal:  [215.9,  355.6]
    };

    var _file        = null;
    var sizeSelect   = document.getElementById("pdfresize-size");
    var orientSelect = document.getElementById("pdfresize-orient");
    var cwInput      = document.getElementById("pdfresize-cw");
    var chInput      = document.getElementById("pdfresize-ch");
    var cwWrap       = document.getElementById("custom-w-wrap");
    var chWrap       = document.getElementById("custom-h-wrap");
    var qualSelect   = document.getElementById("pdfresize-quality");
    var fitCB        = document.getElementById("pdfresize-fitcontent");
    var infoEl       = document.getElementById("pdfresize-info");
    var progressWrap = document.getElementById("pdfresize-progress");
    var convertBtn   = document.getElementById("btn-pdfresize");

    if (!convertBtn) return;

    if (sizeSelect) {
      sizeSelect.addEventListener("change", function () {
        var isCustom = sizeSelect.value === "custom";
        if (cwWrap) cwWrap.style.display = isCustom ? "" : "none";
        if (chWrap) chWrap.style.display = isCustom ? "" : "none";
      });
    }

    setupDropZone("dz-pdfresize", "file-pdfresize", function (file) {
      if (!file || file.type !== "application/pdf") {
        showToast("Please select a PDF file.", "error"); return;
      }
      _file = file;
      markDropZone("dz-pdfresize", file.name);
      if (infoEl) { infoEl.textContent = "Selected: " + file.name + "  |  " + formatBytes(file.size); infoEl.hidden = false; }
      convertBtn.disabled = false;
    });

    convertBtn.addEventListener("click", async function () {
      if (!_file) return;
      if (typeof pdfjsLib === "undefined" || typeof jspdf === "undefined") {
        showToast("Required libraries not loaded. Check your internet connection.", "error"); return;
      }
      try {
        convertBtn.disabled = true;
        convertBtn.textContent = "Resizing...";
        if (progressWrap) progressWrap.hidden = false;

        /* Target dimensions in mm */
        var sizeKey = sizeSelect ? sizeSelect.value : "a4";
        var tw, th;
        if (sizeKey === "custom") {
          tw = parseFloat(cwInput ? cwInput.value : 210) || 210;
          th = parseFloat(chInput ? chInput.value : 297) || 297;
        } else {
          var dims = PAGE_SIZES[sizeKey] || PAGE_SIZES.a4;
          tw = dims[0]; th = dims[1];
        }
        if (orientSelect && orientSelect.value === "landscape" && tw < th) {
          var tmp = tw; tw = th; th = tmp;
        }

        var renderScale = parseFloat(qualSelect ? qualSelect.value : "2.0") || 2.0;
        var MM_PX       = 96 / 25.4;            /* mm to pixels at 96dpi */
        var targetWpx   = tw * MM_PX;
        var targetHpx   = th * MM_PX;

        var ab     = await _file.arrayBuffer();
        var pdfDoc = await pdfjsLib.getDocument({ data: ab }).promise;
        var total  = pdfDoc.numPages;
        var { jsPDF } = jspdf;
        var outPdf = null;

        for (var i = 1; i <= total; i++) {
          setProgress("pdfresize-fill", "pdfresize-status",
            Math.round((i / total) * 95), "Page " + i + "/" + total + "...");

          var page   = await pdfDoc.getPage(i);
          var origVP = page.getViewport({ scale: 1 });

          /* Scale so content fills the new page */
          var scaleX   = (targetWpx / origVP.width)  * renderScale;
          var scaleY   = (targetHpx / origVP.height) * renderScale;
          var fitScale = (fitCB && fitCB.checked) ? Math.min(scaleX, scaleY) : renderScale;
          var viewport = page.getViewport({ scale: fitScale });

          var canvas    = document.createElement("canvas");
          canvas.width  = Math.round(targetWpx * renderScale);
          canvas.height = Math.round(targetHpx * renderScale);
          var ctx = canvas.getContext("2d");
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          /* Center the content on the new page canvas */
          var offsetX = (canvas.width  - viewport.width)  / 2;
          var offsetY = (canvas.height - viewport.height) / 2;
          await page.render({
            canvasContext: ctx,
            viewport:      viewport,
            transform:     [1, 0, 0, 1, offsetX, offsetY]
          }).promise;

          var imgData = canvas.toDataURL("image/jpeg", 0.92);
          var orient  = tw > th ? "l" : "p";
          if (!outPdf) {
            outPdf = new jsPDF({ unit: "mm", format: [tw, th], orientation: orient });
          } else {
            outPdf.addPage([tw, th], orient);
          }
          outPdf.addImage(imgData, "JPEG", 0, 0, tw, th);
        }

        var blob = outPdf.output("blob");
        setProgress("pdfresize-fill", "pdfresize-status", 100,
          "Done! Output size: " + formatBytes(blob.size));
        triggerDownload(URL.createObjectURL(blob), basename(_file.name) + "_resized.pdf");
        showToast("PDF resized to " + tw + " x " + th + " mm & downloaded!", "success");
      } catch (err) {
        showToast("PDF resize failed: " + err.message, "error");
        console.error(err);
      } finally {
        convertBtn.disabled = false;
        convertBtn.textContent = "Resize PDF & Download";
        setTimeout(function () { if (progressWrap) progressWrap.hidden = true; }, 4000);
      }
    });
  })();

  /* ==========================================================
     13. PDF MERGER — merge multiple PDFs, optional target file size
     ========================================================== */
  (function () {
    var _files         = [];
    var listEl         = document.getElementById("pdfmerge-list");
    var infoEl         = document.getElementById("pdfmerge-info");
    var progressWrap   = document.getElementById("pdfmerge-progress");
    var convertBtn     = document.getElementById("btn-pdfmerge");
    var targetEnableEl = document.getElementById("pdfmerge-targetsize-enable");
    var targetWrapEl   = document.getElementById("pdfmerge-targetsize-wrap");
    var targetKbInput  = document.getElementById("pdfmerge-targetkb");
    var targetUnitSel  = document.getElementById("pdfmerge-targetunit");

    if (!convertBtn) return;

    if (targetEnableEl) {
      targetEnableEl.addEventListener("change", function () {
        if (targetWrapEl) targetWrapEl.style.display = targetEnableEl.checked ? "" : "none";
      });
    }

    function renderList() {
      if (!listEl) return;
      listEl.innerHTML = "";
      if (!_files.length) { listEl.hidden = true; if (infoEl) infoEl.hidden = true; return; }
      listEl.hidden = false;
      if (infoEl) {
        infoEl.textContent = _files.length + " file(s)  |  " +
          formatBytes(_files.reduce(function (s, f) { return s + f.size; }, 0)) + " total";
        infoEl.hidden = false;
      }
      var hint = document.createElement("p");
      hint.className = "merge-list-hint";
      hint.textContent = "Drag rows to reorder  |  x to remove";
      listEl.appendChild(hint);

      _files.forEach(function (file, idx) {
        var item = document.createElement("div");
        item.className = "merge-file-item";
        item.draggable = true;
        item.dataset.idx = idx;
        item.innerHTML =
          '<span class="merge-file-drag-handle">&#9776;</span>' +
          '<span class="merge-file-name" title="' + file.name + '">&#128196; ' + file.name + '</span>' +
          '<span class="merge-file-size">' + formatBytes(file.size) + '</span>' +
          '<button class="merge-file-remove" title="Remove" data-idx="' + idx + '">&#x2715;</button>';

        item.querySelector(".merge-file-remove").addEventListener("click", function (e) {
          e.stopPropagation();
          _files.splice(parseInt(e.currentTarget.dataset.idx), 1);
          renderList();
          convertBtn.disabled = _files.length < 2;
        });

        var dragSrcIdx = null;
        item.addEventListener("dragstart", function () { dragSrcIdx = idx; item.classList.add("dragging"); });
        item.addEventListener("dragend",   function () { item.classList.remove("dragging"); });
        item.addEventListener("dragover",  function (e) { e.preventDefault(); item.classList.add("drag-over"); });
        item.addEventListener("dragleave", function () { item.classList.remove("drag-over"); });
        item.addEventListener("drop", function (e) {
          e.preventDefault(); item.classList.remove("drag-over");
          if (dragSrcIdx === null || dragSrcIdx === idx) return;
          var moved = _files.splice(dragSrcIdx, 1)[0];
          _files.splice(idx, 0, moved);
          renderList();
        });
        listEl.appendChild(item);
      });
    }

    setupDropZone("dz-pdfmerge", "file-pdfmerge", function (files) {
      var pdfs = files.filter(function (f) { return f.type === "application/pdf"; });
      if (!pdfs.length) { showToast("Please select PDF files only.", "error"); return; }
      _files = _files.concat(pdfs);
      renderList();
      convertBtn.disabled = _files.length < 2;
      markDropZone("dz-pdfmerge", _files.length + " PDF(s) selected");
    }, { multiple: true });

    async function buildMergedPdf(allDocs, quality, progressCb) {
      var { jsPDF } = jspdf;
      var outPdf    = null;
      var pageCount = 0;
      var totalPgs  = allDocs.reduce(function (s, d) { return s + d.numPages; }, 0);

      for (var di = 0; di < allDocs.length; di++) {
        var doc = allDocs[di];
        for (var pi = 1; pi <= doc.numPages; pi++) {
          pageCount++;
          if (progressCb) progressCb(pageCount / totalPgs, "Page " + pageCount + "/" + totalPgs + "...");

          var page = await doc.getPage(pi);
          var vp1  = page.getViewport({ scale: 1 });
          var w_mm = (vp1.width  / 72) * 25.4;
          var h_mm = (vp1.height / 72) * 25.4;
          var vp   = page.getViewport({ scale: 2 });

          var canvas    = document.createElement("canvas");
          canvas.width  = Math.round(vp.width);
          canvas.height = Math.round(vp.height);
          var ctx = canvas.getContext("2d");
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: ctx, viewport: vp }).promise;

          var orient = w_mm > h_mm ? "l" : "p";
          if (!outPdf) {
            outPdf = new jsPDF({ unit: "mm", format: [w_mm, h_mm], orientation: orient });
          } else {
            outPdf.addPage([w_mm, h_mm], orient);
          }
          outPdf.addImage(canvas.toDataURL("image/jpeg", quality), "JPEG", 0, 0, w_mm, h_mm);
        }
      }
      return outPdf;
    }

    convertBtn.addEventListener("click", async function () {
      if (_files.length < 2 || typeof pdfjsLib === "undefined" || typeof jspdf === "undefined") {
        showToast("Need at least 2 PDFs and libraries loaded.", "error"); return;
      }
      try {
        convertBtn.disabled = true;
        convertBtn.textContent = "Merging...";
        if (progressWrap) progressWrap.hidden = false;

        var allDocs = [];
        for (var fi = 0; fi < _files.length; fi++) {
          setProgress("pdfmerge-fill", "pdfmerge-status",
            Math.round((fi / _files.length) * 40), "Loading " + _files[fi].name + "...");
          var ab  = await _files[fi].arrayBuffer();
          var doc = await pdfjsLib.getDocument({ data: ab }).promise;
          allDocs.push(doc);
        }

        var useTarget = targetEnableEl && targetEnableEl.checked && targetKbInput && targetKbInput.value;
        var outPdf;

        if (useTarget) {
          var unit        = targetUnitSel ? targetUnitSel.value : "kb";
          var targetBytes = parseFloat(targetKbInput.value) * (unit === "mb" ? 1048576 : 1024);
          var lo = 0.05, hi = 0.92, bestPdf = null, bestDiff = Infinity;
          for (var iter = 0; iter < 8; iter++) {
            var mid = (lo + hi) / 2;
            setProgress("pdfmerge-fill", "pdfmerge-status",
              40 + iter * 7, "Quality pass " + (iter + 1) + "/8 - " + Math.round(mid * 100) + "%...");
            var testPdf = await buildMergedPdf(allDocs, mid, null);
            var tBlob   = testPdf.output("blob");
            var diff    = Math.abs(tBlob.size - targetBytes);
            if (diff < bestDiff) { bestDiff = diff; bestPdf = testPdf; }
            if (tBlob.size > targetBytes) hi = mid; else lo = mid;
            if (diff / targetBytes < 0.08) break;
          }
          outPdf = bestPdf;
        } else {
          outPdf = await buildMergedPdf(allDocs, 0.88, function (ratio, msg) {
            setProgress("pdfmerge-fill", "pdfmerge-status", 40 + Math.round(ratio * 55), msg);
          });
        }

        setProgress("pdfmerge-fill", "pdfmerge-status", 100, "Done!");
        var blob = outPdf.output("blob");
        triggerDownload(URL.createObjectURL(blob), "merged.pdf");
        showToast("Merged! Output: " + formatBytes(blob.size), "success");
      } catch (err) {
        showToast("PDF merge failed: " + err.message, "error");
        console.error(err);
      } finally {
        convertBtn.disabled = false;
        convertBtn.textContent = "Merge PDFs & Download";
        setTimeout(function () { if (progressWrap) progressWrap.hidden = true; }, 3000);
      }
    });
  })();

  /* ==========================================================
     14. PDF COMPRESSOR
     Reduces file SIZE (KB/MB) only.
     Page DIMENSIONS stay exactly the same.
     Mode 1: Preset quality level (Screen / eBook / Printer / Prepress)
     Mode 2: Target file size in KB/MB (binary-search on quality)
     ========================================================== */
  (function () {
    var LEVEL_QUALITY = { screen: 0.38, ebook: 0.62, printer: 0.82, prepress: 0.92 };

    var _file        = null;
    var _mode        = "preset";

    var levelSelect  = document.getElementById("pdfcompress-level");
    var targetKbInp  = document.getElementById("pdfcompress-targetkb");
    var targetUnitEl = document.getElementById("pdfcompress-targetunit");
    var infoEl       = document.getElementById("pdfcompress-info");
    var progressWrap = document.getElementById("pdfcompress-progress");
    var convertBtn   = document.getElementById("btn-pdfcompress");
    var presetPanel  = document.getElementById("compress-preset-panel");
    var targetPanel  = document.getElementById("compress-target-panel");
    var btnPreset    = document.getElementById("compressmode-preset");
    var btnTarget    = document.getElementById("compressmode-target");

    if (!convertBtn) return;

    function setMode(mode) {
      _mode = mode;
      if (mode === "preset") {
        if (presetPanel) presetPanel.style.display = "";
        if (targetPanel) targetPanel.style.display = "none";
        if (btnPreset)   btnPreset.classList.add("active");
        if (btnTarget)   btnTarget.classList.remove("active");
      } else {
        if (presetPanel) presetPanel.style.display = "none";
        if (targetPanel) targetPanel.style.display = "";
        if (btnPreset)   btnPreset.classList.remove("active");
        if (btnTarget)   btnTarget.classList.add("active");
      }
    }
    if (btnPreset) btnPreset.addEventListener("click", function () { setMode("preset"); });
    if (btnTarget) btnTarget.addEventListener("click", function () { setMode("target"); });

    setupDropZone("dz-pdfcompress", "file-pdfcompress", function (file) {
      if (!file || file.type !== "application/pdf") {
        showToast("Please select a PDF file.", "error"); return;
      }
      _file = file;
      markDropZone("dz-pdfcompress", file.name);
      if (infoEl) { infoEl.textContent = "Original: " + file.name + "  |  " + formatBytes(file.size); infoEl.hidden = false; }
      convertBtn.disabled = false;
    });

    /* Render all pages at given JPEG quality — dimensions PRESERVED */
    async function renderCompressed(pdfDoc, jpegQuality, progressCb) {
      var { jsPDF } = jspdf;
      var total  = pdfDoc.numPages;
      var outPdf = null;

      for (var i = 1; i <= total; i++) {
        if (progressCb) progressCb(Math.round((i / total) * 88), "Page " + i + "/" + total + "...");

        var page = await pdfDoc.getPage(i);
        var vp1  = page.getViewport({ scale: 1 });
        /* Render at 1.5x for visual sharpness, but keep original page mm dimensions */
        var vp   = page.getViewport({ scale: 1.5 });

        var canvas    = document.createElement("canvas");
        canvas.width  = Math.round(vp.width);
        canvas.height = Math.round(vp.height);
        var ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport: vp }).promise;

        /* Original page dimensions in mm — NEVER CHANGED */
        var w_mm   = (vp1.width  / 72) * 25.4;
        var h_mm   = (vp1.height / 72) * 25.4;
        var orient = w_mm > h_mm ? "l" : "p";

        if (!outPdf) {
          outPdf = new jsPDF({ unit: "mm", format: [w_mm, h_mm], orientation: orient });
        } else {
          outPdf.addPage([w_mm, h_mm], orient);
        }
        outPdf.addImage(canvas.toDataURL("image/jpeg", jpegQuality), "JPEG", 0, 0, w_mm, h_mm);
      }
      return outPdf;
    }

    /* Binary-search the quality level that hits targetBytes (within 8%) */
    async function compressToTarget(pdfDoc, targetBytes) {
      var lo = 0.05, hi = 0.92, bestPdf = null, bestDiff = Infinity;

      for (var iter = 0; iter < 10; iter++) {
        var mid = (lo + hi) / 2;
        setProgress("pdfcompress-fill", "pdfcompress-status",
          8 + iter * 9, "Pass " + (iter + 1) + "/10 - testing " + Math.round(mid * 100) + "% quality...");

        var pdf  = await renderCompressed(pdfDoc, mid, null);
        var blob = pdf.output("blob");
        var diff = Math.abs(blob.size - targetBytes);

        if (diff < bestDiff) { bestDiff = diff; bestPdf = pdf; }
        if (blob.size > targetBytes) hi = mid; else lo = mid;
        if (diff / targetBytes < 0.08) break;
      }
      return bestPdf;
    }

    convertBtn.addEventListener("click", async function () {
      if (!_file) return;
      if (typeof pdfjsLib === "undefined" || typeof jspdf === "undefined") {
        showToast("Required libraries not loaded. Check your internet connection.", "error"); return;
      }
      if (_mode === "target") {
        var val = targetKbInp ? parseFloat(targetKbInp.value) : 0;
        if (!val || val <= 0) { showToast("Please enter a valid target file size.", "error"); return; }
      }

      try {
        convertBtn.disabled = true;
        convertBtn.textContent = "Compressing...";
        if (progressWrap) progressWrap.hidden = false;

        var ab     = await _file.arrayBuffer();
        var pdfDoc = await pdfjsLib.getDocument({ data: ab }).promise;
        var outPdf;

        if (_mode === "target") {
          var unit        = targetUnitEl ? targetUnitEl.value : "kb";
          var targetBytes = parseFloat(targetKbInp.value) * (unit === "mb" ? 1048576 : 1024);
          setProgress("pdfcompress-fill", "pdfcompress-status", 3, "Starting compression search...");
          outPdf = await compressToTarget(pdfDoc, targetBytes);
        } else {
          var level   = levelSelect ? levelSelect.value : "ebook";
          var quality = LEVEL_QUALITY[level] || 0.62;
          setProgress("pdfcompress-fill", "pdfcompress-status", 3, "Compressing (" + level + " quality)...");
          outPdf = await renderCompressed(pdfDoc, quality, function (pct, msg) {
            setProgress("pdfcompress-fill", "pdfcompress-status", pct, msg);
          });
        }

        var blob     = outPdf.output("blob");
        var origSize = _file.size;
        var newSize  = blob.size;
        var savedPct = Math.round(((origSize - newSize) / origSize) * 100);
        var summary  = formatBytes(origSize) + "  ->  " + formatBytes(newSize) +
          (savedPct > 0
            ? "  (saved " + savedPct + "%)"
            : "  (try lower quality for more compression)");

        setProgress("pdfcompress-fill", "pdfcompress-status", 100, summary);
        if (infoEl) { infoEl.textContent = "Result: " + summary; infoEl.hidden = false; }
        triggerDownload(URL.createObjectURL(blob), basename(_file.name) + "_compressed.pdf");
        showToast("Compressed! " + summary, "success", 6000);
      } catch (err) {
        showToast("Compression failed: " + err.message, "error");
        console.error(err);
      } finally {
        convertBtn.disabled = false;
        convertBtn.textContent = "Compress PDF & Download";
        setTimeout(function () { if (progressWrap) progressWrap.hidden = true; }, 6000);
      }
    });
  })();

  /* ==========================================================
     15. DOCX -> PDF (mammoth.js parse + jsPDF)
     ========================================================== */
  (function () {
    var _file        = null;
    var PAGE_MM      = { a4: [210, 297], letter: [215.9, 279.4], a3: [297, 420] };
    var infoEl       = document.getElementById("docx2pdf-info");
    var progressWrap = document.getElementById("docx2pdf-progress");
    var convertBtn   = document.getElementById("btn-docx2pdf");
    var pageSelect   = document.getElementById("docx2pdf-page");
    var fontSizeInp  = document.getElementById("docx2pdf-fontsize");

    if (!convertBtn) return;

    setupDropZone("dz-docx2pdf", "file-docx2pdf", function (file) {
      var ok = file && (file.name.endsWith(".docx") ||
        file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      if (!ok) { showToast("Please select a .docx file.", "error"); return; }
      _file = file;
      markDropZone("dz-docx2pdf", file.name);
      if (infoEl) { infoEl.textContent = "Selected: " + file.name + "  |  " + formatBytes(file.size); infoEl.hidden = false; }
      convertBtn.disabled = false;
    });

    convertBtn.addEventListener("click", async function () {
      if (!_file) return;
      if (typeof mammoth === "undefined") {
        showToast("Mammoth.js not loaded. Check your internet connection.", "error"); return;
      }
      if (typeof jspdf === "undefined") {
        showToast("jsPDF not loaded. Check your internet connection.", "error"); return;
      }
      try {
        convertBtn.disabled = true;
        convertBtn.textContent = "Converting...";
        if (progressWrap) progressWrap.hidden = false;
        setProgress("docx2pdf-fill", "docx2pdf-status", 10, "Reading DOCX...");

        var ab     = await _file.arrayBuffer();
        var result = await mammoth.extractRawText({ arrayBuffer: ab });
        var text   = result.value;

        setProgress("docx2pdf-fill", "docx2pdf-status", 55, "Building PDF...");

        var { jsPDF }  = jspdf;
        var pageKey    = pageSelect ? pageSelect.value : "a4";
        var dims       = PAGE_MM[pageKey] || PAGE_MM.a4;
        var pw = dims[0], ph = dims[1];
        var fontSize   = parseInt(fontSizeInp ? fontSizeInp.value : 11) || 11;
        var margin     = 20;
        var usable     = pw - margin * 2;

        var pdf = new jsPDF({ unit: "mm", format: [pw, ph], orientation: pw > ph ? "l" : "p" });
        pdf.setFontSize(fontSize);
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(20, 20, 20);

        var lineH = fontSize * 0.38 + 1.2;
        var y     = margin;
        var lines = pdf.splitTextToSize(text, usable);

        lines.forEach(function (line) {
          if (y + lineH > ph - margin) { pdf.addPage([pw, ph]); y = margin; }
          var trimmed    = line.trim();
          var isHeading  = trimmed.length > 2 && trimmed.length < 60 &&
            !/[.!?,:;]$/.test(trimmed) && /^[A-Z0-9]/.test(trimmed) &&
            trimmed === trimmed.toUpperCase();
          if (isHeading) {
            pdf.setFontSize(fontSize + 3);
            pdf.setFont("helvetica", "bold");
            pdf.text(trimmed, margin, y);
            pdf.setFontSize(fontSize);
            pdf.setFont("helvetica", "normal");
            y += lineH * 1.6;
          } else {
            pdf.text(line, margin, y);
            y += lineH;
          }
        });

        setProgress("docx2pdf-fill", "docx2pdf-status", 100, "Done!");
        pdf.save(basename(_file.name) + ".pdf");
        showToast("DOCX converted to PDF & downloaded!", "success");
      } catch (err) {
        showToast("Conversion failed: " + err.message, "error");
        console.error(err);
      } finally {
        convertBtn.disabled = false;
        convertBtn.textContent = "Convert to PDF & Download";
        setTimeout(function () { if (progressWrap) progressWrap.hidden = true; }, 2500);
      }
    });
  })();

  /* ==========================================================
     GLOBAL DRAG-OVER PREVENTION
     ========================================================== */
  document.addEventListener("dragover", function (e) { e.preventDefault(); });
  document.addEventListener("drop",     function (e) { e.preventDefault(); });

  /* ==========================================================
     SCROLL REVEAL (lightweight IntersectionObserver)
     ========================================================== */
  (function () {
    if (!("IntersectionObserver" in window)) return;
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.style.opacity  = "1";
          entry.target.style.transform = "translateY(0)";
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });

    document.querySelectorAll(".feature-card, .faq-item").forEach(function (el) {
      el.style.opacity   = "0";
      el.style.transform = "translateY(20px)";
      el.style.transition = "opacity 0.5s ease, transform 0.5s ease";
      obs.observe(el);
    });
  })();

}); /* end DOMContentLoaded */
